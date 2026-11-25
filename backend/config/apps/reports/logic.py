"""Hisobot shablonlari va kunlik hisobotlar — Jarvis `services/templates.py` + `reports.py` qoidalari.

Shablon versiyalanadi: tasdiqlovchi bo'lim (`APPROVER_DEPT`, IT) a'zosi yoki ega taklif qilsa — darhol faol, boshqalar
(bo'lim boshlig'i, admin) taklifi — IT tasdig'ini kutadi. Hisobot birligi — bo'lim yoki bo'lim ichidagi toifa
(`<bo'lim>:<toifa>`, masalan `sotuv_b2b:monitoring`): toifaga biriktirilgan xodim bo'limning umumiy shablonini emas,
toifanikini to'ldiradi.
"""

from __future__ import annotations

import math
import re
from datetime import date as Date
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from django.db import transaction
from django.utils import timezone

from config.apps.audit import services as audit
from config.apps.staff import services as staff

from .models import Assign, Report, Status, Template

if TYPE_CHECKING:
    from config.apps.staff.models import User

TYPES = ("number", "money", "text")
NUMERIC = ("number", "money")
APPROVER_DEPT = "it"
_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_KEY = re.compile(r"^[a-z][a-z0-9_]{0,30}$")
_CAT = re.compile(r"^[a-z][a-z0-9_]{0,30}:[a-z][a-z0-9_]{0,30}$")


# ------------------------------------------------------------------ bo'limlar va huquqlar
def parent_key(key: str) -> str:
    return key.split(":", 1)[0]


def is_category(key: str) -> bool:
    return ":" in key


def is_approver(u: User) -> bool:
    """Ega — har doim; qolganlar — tasdiqlovchi bo'lim (IT) a'zolari."""
    if u.role == "owner":
        return True
    return u.role in ("admin", "employee") and APPROVER_DEPT in u.dept_keys()


def managed_depts(u: User) -> set[str]:
    """Shablonini o'zgartira oladigan bo'limlar: ega/admin — hammasi; boshliq — o'z bo'limlari."""
    keys = staff.department_keys()
    if u.is_panel:
        return keys
    return {h.get("dept_group") for h in (u.heads or [])} & keys


def can_propose(u: User, dept: str) -> bool:
    return parent_key(dept) in managed_depts(u) or is_approver(u)


# ------------------------------------------------------------------ shablonlar
def _tpl(t: Template, names: dict[int, str] | None = None) -> dict[str, Any]:
    names = names or {}
    return {
        "id": t.pk,
        "dept": t.dept,
        "version": t.version,
        "title": t.title,
        "fields": t.fields,
        "ask_at": t.ask_at or None,
        "summary_at": t.summary_at or None,
        "status": t.status,
        "proposed_by": t.proposed_by,
        "decided_by": t.decided_by,
        "reason": t.reason or None,
        "created": t.created.isoformat() if t.created else None,
        "decided": t.decided.isoformat() if t.decided else None,
        "proposed_name": names.get(t.proposed_by) if t.proposed_by else None,
        "decided_name": names.get(t.decided_by) if t.decided_by else None,
    }


def validate(data: dict[str, Any]) -> dict[str, Any]:
    """Shablonni tekshiradi va tozalaydi. Xato bo'lsa ValueError."""
    title = str(data.get("title") or "").strip()
    if not title or len(title) > 80:
        raise ValueError("Sarlavha kerak (80 belgigacha).")
    fields = data.get("fields")
    if not isinstance(fields, list) or not 1 <= len(fields) <= 20:
        raise ValueError("1 dan 20 tagacha maydon kerak.")
    clean, keys = [], set()
    for f in fields:
        f = f if isinstance(f, dict) else {}
        key = str(f.get("key") or "").strip().lower()
        label = str(f.get("label") or "").strip()
        typ = str(f.get("type") or "").strip()
        if not _KEY.match(key) or key in keys or key == "date":
            raise ValueError(f"Maydon kaliti noto'g'ri yoki takror: '{key}' (lotin kichik harf, raqam, _).")
        if not label or len(label) > 80:
            raise ValueError(f"'{key}' uchun nom kerak.")
        if typ not in TYPES:
            raise ValueError(f"'{key}' turi: number | money | text.")
        keys.add(key)
        clean.append({"key": key, "label": label, "type": typ})
    times = {}
    for k in ("ask_at", "summary_at"):
        v = str(data.get(k) or "").strip()
        if v and not _TIME.match(v):
            raise ValueError(f"{k}: HH:MM formatida (masalan 18:00) yoki bo'sh.")
        times[k] = v
    return {"title": title, "fields": clean, **times}


def active(dept: str) -> Template | None:
    return Template.objects.filter(dept=dept, status=Status.ACTIVE).order_by("-version").first()


def history() -> list[dict[str, Any]]:
    rows = list(Template.objects.order_by("dept", "-version")[:200])
    names = staff.user_names({x for t in rows for x in (t.proposed_by, t.decided_by) if x})
    return [_tpl(t, names) for t in rows]


def depts_with_reports() -> list[str]:
    return sorted(set(Template.objects.filter(status=Status.ACTIVE).values_list("dept", flat=True)))


def _activate(t: Template, by: int | None) -> None:
    Template.objects.filter(dept=t.dept, status=Status.ACTIVE).exclude(pk=t.pk).update(status=Status.ARCHIVED)
    t.status, t.decided_by, t.decided = Status.ACTIVE, by, timezone.now()
    t.save(update_fields=["status", "decided_by", "decided"])


@transaction.atomic
def propose(dept: str, data: dict[str, Any], u: User) -> dict[str, Any]:
    """Yangi versiya taklifi. Tasdiqlovchi taklif qilsa — darhol faollashadi."""
    keys = staff.department_keys()
    if dept not in keys and not (_CAT.match(dept) and parent_key(dept) in keys):
        raise ValueError("Bunday bo'lim yo'q (toifa: <bo'lim>:<toifa>, masalan sotuv_b2b:monitoring).")
    t = validate(data)
    direct = is_approver(u)
    # shu odamning shu bo'lim uchun oldingi kutilayotgan taklifi — yangisi bilan almashadi (takror yig'ilmaydi)
    Template.objects.filter(dept=dept, proposed_by=u.tg_id, status=Status.PENDING).update(
        status=Status.SUPERSEDED, decided=timezone.now(), reason="yangi taklif bilan almashtirildi"
    )
    last = Template.objects.filter(dept=dept).order_by("-version").values_list("version", flat=True).first() or 0
    tpl = Template.objects.create(dept=dept, version=last + 1, status=Status.PENDING, proposed_by=u.tg_id, **t)
    if direct:
        _activate(tpl, u.tg_id)
    audit.log("template_proposed", u.tg_id, dept, detail={"id": tpl.pk, "direct": direct})
    return _tpl(tpl, staff.user_names({u.tg_id}))


@transaction.atomic
def decide(tpl_id: int, u: User, approve: bool, reason: str = "") -> dict[str, Any]:
    t = Template.objects.select_for_update().filter(pk=tpl_id).first()
    if t is None or t.status != Status.PENDING:
        raise ValueError("Kutilayotgan taklif topilmadi.")
    if not is_approver(u):
        raise PermissionError(f"Shablonni faqat {APPROVER_DEPT} bo'limi tasdiqlaydi.")
    if approve:
        cur = active(t.dept)
        if cur and cur.version > t.version:
            # orada yangiroq versiya faollashgan — eski taklifni tasdiqlash uni orqaga qaytarib yuborardi
            raise ValueError(f"Bu taklif (v{t.version}) eskirgan: hozir v{cur.version} faol. Yangi taklif bering.")
        _activate(t, u.tg_id)
    else:
        t.status, t.decided_by, t.decided, t.reason = Status.REJECTED, u.tg_id, timezone.now(), reason[:255]
        t.save(update_fields=["status", "decided_by", "decided", "reason"])
    audit.log("template_" + ("approved" if approve else "rejected"), u.tg_id, t.dept, detail={"id": t.pk})
    return _tpl(t, staff.user_names({x for x in (t.proposed_by, t.decided_by) if x}))


# ------------------------------------------------------------------ hisobot birliklari
def unit_info(key: str) -> dict[str, Any] | None:
    """Bo'lim yoki toifa: {key, name, name_ru, icon, color} (toifa — ota bo'limdan, nomiga toifa qo'shiladi)."""
    deps = staff.departments_info()
    if key in deps:
        return deps[key]
    parent = deps.get(parent_key(key))
    if not is_category(key) or parent is None:
        return None
    tpl = active(key)
    label = (tpl.title if tpl else "") or key.split(":", 1)[1]
    label = label[:1].upper() + label[1:].lower()
    return {**parent, "key": key, "name": f"{parent['name']} · {label}", "name_ru": f"{parent['name_ru']} · {label}"}


def categories(dept_key: str) -> list[str]:
    return [k for k in depts_with_reports() if is_category(k) and parent_key(k) == dept_key]


def user_units(u: User) -> list[str]:
    """Xodim to'ldiradigan hisobot birliklari: har bo'limida — biriktirilgan toifa (faol shabloni bo'lsa) yoki bo'lim."""
    mine = list(Assign.objects.filter(tg_id=u.tg_id).values_list("unit", flat=True))
    out: list[str] = []
    for d in u.dept_keys():
        k = next((x for x in mine if parent_key(x) == d and active(x)), d)
        if active(k) and k not in out:
            out.append(k)
    return out


# ------------------------------------------------------------------ hisobot
def today() -> str:
    return timezone.localdate().isoformat()  # Toshkent sanasi (TIME_ZONE)


def parse_date(value: str | None) -> str:
    """'bugun', 'kecha', '2026-06-21', '21.06.2026' → 'YYYY-MM-DD'."""
    v = (value or "").strip().lower()
    if v in ("", "bugun", "today", "сегодня"):
        return today()
    if v in ("kecha", "yesterday", "вчера"):
        return (timezone.localdate() - timedelta(days=1)).isoformat()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y", "%d/%m/%Y"):
        try:
            return datetime.strptime(v, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    raise ValueError("Sana formati: 2026-06-21 yoki 21.06.2026")


def clean_values(dept: str, raw: dict[str, Any], *, clear_empty: bool = False) -> dict[str, Any]:
    """clear_empty=True (veb forma — butun forma yuboriladi): kalit bor, qiymat bo'sh → None (saqlangani o'chadi)."""
    tpl = active(dept)
    if tpl is None:
        raise ValueError("Bu bo'limda faol hisobot shabloni yo'q.")
    out: dict[str, Any] = {}
    for f in tpl.fields:
        v = raw.get(f["key"])
        if v in (None, ""):
            if clear_empty and f["key"] in raw:
                out[f["key"]] = None
            continue
        if f["type"] in NUMERIC:
            if isinstance(v, str):
                v = v.replace(" ", "").replace(",", ".")
            try:
                n = float(v)
            except (TypeError, ValueError):
                raise ValueError(f"{f['label']}: raqam bo'lishi kerak") from None
            if not math.isfinite(n):
                raise ValueError(f"{f['label']}: raqam bo'lishi kerak")
            out[f["key"]] = int(n) if n == int(n) else n
        else:
            out[f["key"]] = str(v).strip()[:500]
    return out


def values_for(dept: str, tg_id: int, day: str) -> dict[str, Any]:
    r = Report.objects.filter(dept=dept, tg_id=tg_id, date=Date.fromisoformat(day)).first()
    return dict(r.values) if r else {}


@transaction.atomic
def upsert(dept: str, tg_id: int, day: str, values: dict[str, Any]) -> None:
    """Qiymatlar birlashtiriladi; None — o'sha maydon o'chiriladi."""
    r, _ = Report.objects.select_for_update().get_or_create(dept=dept, tg_id=tg_id, date=Date.fromisoformat(day))
    merged = {**r.values, **values}
    r.values = {k: v for k, v in merged.items() if v is not None}
    r.save(update_fields=["values", "updated"])
