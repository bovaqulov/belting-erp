"""Kanal kartochkalari (sinxron) va kartochka auditi.

Kartochka shtrixkodlari — skanerda yig'ishning asosi (buyurtma qatori kartochka orqali kutilgan shtrixkodni biladi).
Audit (Jarvis office/erp/market/audit.py dan, ERP bog'lanishi va rasm tahlilisiz qismi):
  photo_none — rasm yo'q (crit) · blocked — WB bloklangan (crit) · wb_error — WB kartochka xatosi (warn)
  no_chrt — WB chrtId yo'q, qoldiq yuborib bo'lmaydi (warn) · no_barcode — shtrixkod yo'q, skaner tanimaydi (warn)
Muammo keyingi tekshiruvda topilmasa — yopiladi; «Xato emas» (muted) qayta chiqmaydi.
"""

from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from django.utils import timezone

from . import channels as C
from .channels import ChannelError
from .models import ACTIVE, Card, Issue, Order

log = logging.getLogger(__name__)

TEXT = {
    "photo_none": "Rasm yo'q",
    "blocked": "Kartochka bloklangan",
    "wb_error": "WB kartochka xatosi",
    "no_chrt": "chrtId yo'q",
    "no_barcode": "Shtrixkod yo'q (skaner tanimaydi)",
}
SEV = {"photo_none": "crit", "blocked": "crit", "wb_error": "warn", "no_chrt": "warn", "no_barcode": "warn"}
SEV_ORDER = {"crit": 0, "warn": 1, "info": 2}


# ---------------------------------------------------------------- kanaldan o'qish → [{ext_id, vendor_code, title, codes, photos, ext}]
def _fetch_wb() -> list[dict]:
    rows: list[dict] = []
    cur: dict[str, Any] = {"limit": 100}
    for _ in range(500):
        r = C.wb(
            "POST",
            "/content/v2/get/cards/list",
            host=C.WB_CONTENT,
            json={"settings": {"cursor": cur, "filter": {"withPhoto": -1}}},
        )
        j = C.must("wb", r, "WB kartochkalar") or {}
        for c in j.get("cards") or []:
            sizes = c.get("sizes") or [{}]
            rows.append(
                {
                    "ext_id": str(c["nmID"]),
                    "vendor_code": c.get("vendorCode") or "",
                    "title": c.get("title") or "",
                    "codes": [str(s) for z in sizes for s in z.get("skus") or []],
                    "photos": len(c.get("photos") or []),
                    "ext": {"chrtId": sizes[0].get("chrtID"), "imtID": c.get("imtID"), "photo": _wb_photo(c)},
                }
            )
        cursor = j.get("cursor") or {}
        if (cursor.get("total") or 0) < 100:
            break
        cur = {"limit": 100, "updatedAt": cursor.get("updatedAt"), "nmID": cursor.get("nmID")}
    return rows


def _fetch_ozon() -> list[dict]:
    ids: list[int] = []
    last = ""
    for _ in range(50):
        j = C.ozon("/v3/product/list", {"filter": {"visibility": "ALL"}, "last_id": last, "limit": 1000})
        res = j.get("result") or j
        items = res.get("items") or []
        ids += [x["product_id"] for x in items if x.get("product_id")]
        last = res.get("last_id") or ""
        if not last or len(items) < 1000:
            break
    rows: list[dict] = []
    for i in range(0, len(ids), 500):
        j = C.ozon("/v3/product/info/list", {"product_id": ids[i : i + 500]})
        for p in j.get("items") or (j.get("result") or {}).get("items") or []:
            prim = p.get("primary_image") or []
            prim = prim if isinstance(prim, list) else [prim]
            imgs = [x for x in [*prim, *(p.get("images") or [])] if x]
            rows.append(
                {
                    "ext_id": str(p["id"]),
                    "vendor_code": p.get("offer_id") or "",
                    "title": p.get("name") or "",
                    "codes": [str(b) for b in p.get("barcodes") or [] if b],
                    "photos": len(dict.fromkeys(imgs)),
                    "ext": {
                        "offer_id": p.get("offer_id"),
                        "sku": ((p.get("sources") or [{}])[0]).get("sku"),
                        "photo": imgs[0] if imgs else None,
                    },
                    "active": not p.get("is_archived"),
                }
            )
    return rows


def _fetch_uzum() -> list[dict]:
    rows: list[dict] = []
    for shop in C.uzum_shops():
        for page in range(50):
            r = C.uzum("GET", f"/v1/product/shop/{shop}", params={"page": page, "size": 100})
            if not r.ok:
                raise ChannelError(f"Uzum tovarlar: {C.error_text('uzum', r)}")
            p = C.uzum_payload(r) or {}
            prods = p.get("productList") or p.get("products") or []
            rows.extend(
                {
                    "ext_id": str(s.get("skuId")),
                    "vendor_code": s.get("article") or pr.get("article") or "",
                    "title": f"{pr.get('title') or ''} {s.get('skuTitle') or ''}".strip(),
                    "codes": [str(s["barcode"])] if s.get("barcode") else [],
                    "photos": None,
                    "ext": {
                        "productId": pr.get("productId"),
                        "shopId": shop,
                        "photo": pr.get("previewImg") or pr.get("image"),
                    },
                }
                for pr in prods
                for s in pr.get("skuList") or []
            )
            if len(prods) < 100:
                break
    return rows


def _wb_photo(c: dict) -> str | None:
    """Kichik kvadrat rasm (ro'yxat uchun)."""
    ph = (c.get("photos") or [{}])[0]
    return ph.get("square") or ph.get("tm") or ph.get("c246x328") or ph.get("big")


FETCH = {"wb": _fetch_wb, "ozon": _fetch_ozon, "uzum": _fetch_uzum}


def refresh_cards(ch: str) -> int:
    rows = FETCH[ch]()
    with transaction.atomic():
        have = {c.ext_id: c for c in Card.objects.filter(channel=ch)}
        for r in rows:
            c = have.get(r["ext_id"]) or Card(channel=ch, ext_id=r["ext_id"])
            c.vendor_code, c.title, c.codes, c.photos = (
                r["vendor_code"][:128],
                r["title"][:500],
                r["codes"],
                r["photos"],
            )
            c.ext = {**(c.ext or {}), **r["ext"]}
            c.active = r.get("active", True)
            c.save()
        # faol buyurtmalar qatorlari (nom, shtrixkod, rasm) yangi kartochkadan qayta hisoblansin
        Order.objects.filter(channel=ch, stage__in=ACTIVE).update(lines=None)
    return len(rows)


# ---------------------------------------------------------------- audit
def _wb_extra() -> tuple[dict[str, str], set[str]]:
    """WB xatolar ro'yxati (vendorCode → matn) va bloklangan nmID'lar. Xato bo'lsa — bo'sh (audit davom etadi)."""
    errs: dict[str, str] = {}
    blocked: set[str] = set()
    try:
        r = C.wb(
            "POST",
            "/content/v2/cards/error/list",
            host=C.WB_CONTENT,
            json={"cursor": {"limit": 100}, "order": {"ascending": False}},
        )
        for e in ((r.json() or {}).get("data") or {}).get("items") or [] if r.ok else []:
            raw = e.get("errors")
            txt = (
                "; ".join(str(x) for v in raw.values() for x in (v if isinstance(v, list) else [v]))
                if isinstance(raw, dict)
                else str(raw or "")
            )
            for vc in e.get("vendorCodes") or [e.get("vendorCode")]:
                if vc:
                    errs[vc] = txt[:300]
    except ChannelError as exc:
        log.warning("WB xatolar ro'yxati olinmadi: %s", exc.detail)
    try:
        r = C.wb(
            "GET",
            "/api/v1/analytics/banned-products/blocked",
            host=C.WB_ANALYTICS,
            params={"sort": "nmId", "order": "desc"},
        )
        blocked = {str(x.get("nmId")) for x in ((r.json() or {}).get("report") or [])} if r.ok else set()
    except ChannelError as exc:
        log.warning("WB bloklanganlar olinmadi: %s", exc.detail)
    return errs, blocked


def check(cards: list[Card], wb_err: dict[str, str], blocked: set[str]) -> dict[tuple[str, str, str], dict]:
    """Sof tekshiruv: (kanal, ext_id, kod) → tafsilot."""
    found: dict[tuple[str, str, str], dict] = {}
    for c in cards:
        if not c.active:
            continue
        if c.photos == 0:
            found[(c.channel, c.ext_id, "photo_none")] = {}
        if not c.codes:
            found[(c.channel, c.ext_id, "no_barcode")] = {}
        if c.channel == "wb":
            if not (c.ext or {}).get("chrtId"):
                found[(c.channel, c.ext_id, "no_chrt")] = {}
            if c.ext_id in blocked:
                found[(c.channel, c.ext_id, "blocked")] = {}
            if c.vendor_code in wb_err:
                found[(c.channel, c.ext_id, "wb_error")] = {"xato": wb_err[c.vendor_code]}
    return found


def run() -> dict:
    chs = [ch for ch in FETCH if C.configured(ch)]
    if not chs:
        raise ChannelError(
            "Hech bir kanal ulanmagan (backend .env.local: WB_TOKEN, OZON_ID/OZON_TOKEN, UZUM_TOKEN)", 400
        )
    n, failed = 0, []
    for ch in chs:
        try:
            n += refresh_cards(ch)
        except ChannelError as exc:
            log.warning("%s kartochkalari olinmadi: %s", ch, exc.detail)
            failed.append(ch)
    wb_err, blocked = _wb_extra() if "wb" in chs and "wb" not in failed else ({}, set())
    ok_chs = [ch for ch in chs if ch not in failed]
    cards = list(Card.objects.filter(channel__in=ok_chs))
    found = check(cards, wb_err, blocked)
    by = {(c.channel, c.ext_id): c for c in cards}
    now = timezone.now()
    with transaction.atomic():
        old = {(i.channel, i.ext_id, i.code): i for i in Issue.objects.filter(channel__in=ok_chs)}
        for key, det in found.items():
            c = by[key[:2]]
            i = old.get(key) or Issue(channel=key[0], ext_id=key[1], code=key[2])
            i.severity, i.text = SEV[key[2]], TEXT[key[2]]
            i.vendor_code, i.title, i.photos, i.detail = c.vendor_code, c.title, c.photos, det or None
            i.resolved_at = None
            i.save()
        for key, i in old.items():
            if key not in found and i.resolved_at is None:
                i.resolved_at = now
                i.save(update_fields=["resolved_at"])
    if failed and not ok_chs:
        raise ChannelError(f"Kanallar javob bermadi: {', '.join(failed)}")
    return {"cards": n}


def _open():
    return Issue.objects.filter(resolved_at__isnull=True, muted=False)


def issues(code: str | None = None, ch: str | None = None) -> list[dict]:
    qs = _open()
    if code:
        qs = qs.filter(code=code)
    if ch:
        qs = qs.filter(channel=ch)
    rs = sorted(qs[:2000], key=lambda i: (SEV_ORDER.get(i.severity, 9), i.channel, i.vendor_code))
    return [
        {
            "id": i.pk,
            "code": i.code,
            "severity": i.severity,
            "text": i.text,
            "channel": i.channel,
            "ext_id": i.ext_id,
            "vendor_code": i.vendor_code or None,
            "title": i.title or None,
            "photos": i.photos,
            "detail": i.detail,
        }
        for i in rs
    ]


def mute(pk: int) -> dict:
    if not Issue.objects.filter(pk=pk).update(muted=True):
        raise ChannelError("Muammo topilmadi", 404)
    return {"ok": True}


def summary() -> list[dict]:
    agg: dict[tuple[str, str], dict] = {}
    for i in _open().only("code", "channel", "severity", "text"):
        a = agg.setdefault(
            (i.code, i.channel), {"code": i.code, "severity": i.severity, "channel": i.channel, "n": 0, "text": i.text}
        )
        a["n"] += 1
    return sorted(agg.values(), key=lambda a: (SEV_ORDER.get(a["severity"], 9), -a["n"]))


def channel_stats() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for ch in FETCH:
        n = linked = off = total = 0
        for item_ids, active, stock in Card.objects.filter(channel=ch).values_list("item_ids", "active", "ch_stock"):
            n += 1
            linked += bool(item_ids)
            off += not active
            total += max(stock, 0)
        out[ch] = {
            "name": C.NAMES[ch],
            "n": n,
            "linked": linked,
            "off": off,
            "ch_total": total,
            "push_stock": False,
            "push_price": False,
        }
    return out
