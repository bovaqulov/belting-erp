"""Jo'natmalar mantig'i: ro'yxat (holat, tashuvchi, qidiruv; holatlar soni), yaratish/tahrirlash (tekshiruv bilan),
holat o'tishlari (faqat ruxsat etilgan yo'nalishda, tarixga yoziladi)."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from config.apps.core.http import ApiError

from .models import Carrier, Payer, Shipment, Status

FLOW: dict[str, tuple[str, ...]] = {
    Status.NEW: (Status.HANDED, Status.CANCELLED),
    Status.HANDED: (Status.TRANSIT, Status.DELIVERED, Status.RETURNED, Status.CANCELLED),
    Status.TRANSIT: (Status.DELIVERED, Status.RETURNED),
    Status.DELIVERED: (),
    Status.RETURNED: (),
    Status.CANCELLED: (),
}
ACTIVE = (Status.NEW, Status.HANDED, Status.TRANSIT)
TEXT = {"recipient": 160, "phone": 32, "city": 80, "address": 300, "track_no": 60, "ref": 60, "note": 2000}


def meta() -> dict[str, Any]:
    return {
        "carriers": [{"key": k, "title": t} for k, t in Carrier.choices],
        "statuses": [{"key": k, "title": t, "next": list(FLOW[k])} for k, t in Status.choices],
        "payers": [{"key": k, "title": t} for k, t in Payer.choices],
    }


def _num(v: Any) -> float | None:
    return None if v is None else float(v)


def row(s: Shipment) -> dict[str, Any]:
    return {
        "id": s.pk,
        "number": s.number,
        "carrier": s.carrier,
        "status": s.status,
        "recipient": s.recipient,
        "phone": s.phone,
        "city": s.city,
        "address": s.address,
        "places": s.places,
        "weight_kg": _num(s.weight_kg),
        "cost": _num(s.cost),
        "payer": s.payer,
        "track_no": s.track_no,
        "ref": s.ref,
        "note": s.note,
        "next": list(FLOW[s.status]),
        "created": timezone.localtime(s.created).isoformat(timespec="seconds"),
        "updated": timezone.localtime(s.updated).isoformat(timespec="seconds"),
    }


def shipments(status: str = "", carrier: str = "", q: str = "") -> dict[str, Any]:
    qs = Shipment.objects.all()
    if carrier:
        qs = qs.filter(carrier=carrier)
    q = q.strip()
    if q:
        qs = qs.filter(
            Q(number__icontains=q)
            | Q(recipient__icontains=q)
            | Q(track_no__icontains=q)
            | Q(ref__icontains=q)
            | Q(phone__icontains=q)
            | Q(city__icontains=q)
        )
    counts = {k: 0 for k in Status.values}
    for r in qs.values("status").annotate(n=Count("id")):
        counts[r["status"]] = r["n"]
    if status == "active":
        qs = qs.filter(status__in=ACTIVE)
    elif status:
        qs = qs.filter(status=status)
    return {"shipments": [row(s) for s in qs[:300]], "counts": counts, "active": sum(counts[k] for k in ACTIVE)}


def shipment(pk: int) -> dict[str, Any]:
    s = Shipment.objects.filter(pk=pk).first()
    if s is None:
        raise ApiError(404, "Jo'natma topilmadi")
    return {**row(s), "history": s.history}


def _dec(v: Any, field: str, label: str) -> Decimal | None:
    if v in (None, ""):
        return None
    try:
        d = Decimal(str(v).replace(" ", "").replace(",", "."))
    except InvalidOperation:
        raise ApiError(422, {field: f"{label}: son kiriting"}) from None
    if d < 0:
        raise ApiError(422, {field: f"{label} manfiy bo'lmaydi"})
    return d


def _apply(s: Shipment, body: dict[str, Any]) -> None:
    for k, n in TEXT.items():
        if k in body:
            setattr(s, k, str(body[k] or "").strip()[:n])
    if "carrier" in body:
        if body["carrier"] not in Carrier.values:
            raise ApiError(422, {"carrier": "Tashuvchini tanlang"})
        s.carrier = body["carrier"]
    if "payer" in body:
        if body["payer"] not in Payer.values:
            raise ApiError(422, {"payer": "To'lovchini tanlang"})
        s.payer = body["payer"]
    if "places" in body:
        try:
            s.places = 1 if body["places"] in (None, "") else int(body["places"])
        except (TypeError, ValueError):
            raise ApiError(422, {"places": "Joylar soni — butun son"}) from None
        if not 1 <= s.places <= 999:
            raise ApiError(422, {"places": "Joylar soni 1–999"})
    if "weight_kg" in body:
        s.weight_kg = _dec(body["weight_kg"], "weight_kg", "Vazn")
    if "cost" in body:
        s.cost = _dec(body["cost"], "cost", "Narx")
    if not s.recipient:
        raise ApiError(422, {"recipient": "Qabul qiluvchini yozing"})
    if not (s.city or s.address):
        raise ApiError(422, {"address": "Shahar yoki manzilni yozing"})


def _event(status: str, by: int | None, note: str = "") -> dict[str, Any]:
    return {"ts": timezone.localtime().isoformat(timespec="seconds"), "status": status, "by": by, "note": note}


def _next_number() -> str:
    yy = timezone.localdate().strftime("%y")
    prefix = f"LG-{yy}-"
    last = Shipment.objects.filter(number__startswith=prefix).order_by("-number").values_list("number", flat=True)
    n = int(last[0].rsplit("-", 1)[1]) + 1 if last else 1
    return f"{prefix}{n:05d}"


@transaction.atomic
def create(body: dict[str, Any], by: int | None) -> dict[str, Any]:
    s = Shipment(carrier="", created_by=by)
    if "carrier" not in body:
        raise ApiError(422, {"carrier": "Tashuvchini tanlang"})
    _apply(s, body)
    s.number = _next_number()
    s.history = [_event(Status.NEW, by)]
    s.save()
    return shipment(s.pk)


@transaction.atomic
def update(pk: int, body: dict[str, Any], by: int | None) -> dict[str, Any]:
    s = Shipment.objects.select_for_update().filter(pk=pk).first()
    if s is None:
        raise ApiError(404, "Jo'natma topilmadi")
    if s.status not in ACTIVE:
        raise ApiError(409, "Yopilgan jo'natma tahrirlanmaydi")
    _apply(s, body)
    s.save()
    return shipment(s.pk)


@transaction.atomic
def set_status(pk: int, status: str, by: int | None, note: str = "") -> dict[str, Any]:
    s = Shipment.objects.select_for_update().filter(pk=pk).first()
    if s is None:
        raise ApiError(404, "Jo'natma topilmadi")
    if status not in FLOW[s.status]:
        cur, new = Status(s.status).label, (Status(status).label if status in Status.values else status)
        raise ApiError(409, f"«{cur}» holatidan «{new}» ga o'tib bo'lmaydi")
    s.status = status
    s.history = [*s.history, _event(status, by, note.strip()[:300])]
    s.save(update_fields=["status", "history", "updated"])
    return shipment(s.pk)
