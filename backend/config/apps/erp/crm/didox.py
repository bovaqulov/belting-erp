"""Didox — O'zbekistondagi elektron hujjat aylanishi (EDO) operatori: CRM hujjatini (taklif / buyurtma) Didox'da qoralama
sifatida yaratish va holatini kuzatish.

API (partner): baza `DIDOX_URL` (prod — api-partners.didox.uz, sinov — testapi3.didox.uz). Har so'rov —
`Partner-Authorization: <partner token>`, mazmunlilari — yana `user-key: <foydalanuvchi tokeni>`. Foydalanuvchi tokeni —
`POST /v1/auth/{tin}/password/ru {password}` → `token` (360 daqiqa yashaydi — keshlanadi; login rate-limit qilinadi).

Hujjat turi — 000 «Erkin hujjat» (PDF, ≤ 10 MB, kontragent ham Didox'da bo'lishi kerak): `POST /v1/documents/000/create`
`{data: {Document, Subtype, SellerTin, Seller, BuyerTin, Buyer}, document: "data:application/pdf;base64,…"}` → `_id`.
Sotuvchi rekvizitlari — `GET /v1/profile`, xaridor — `GET /v1/utils/info/{tin}` (soliq bazasi).
Imzo (PKCS7 + timestamp) — E-IMZO kaliti egasining kompyuterida: CRM faqat qoralama yaratadi, yuborish (imzolash) —
Didox kabinetida (didox.uz). Holat — `GET /v1/documents/{id}?owner=1` → `doc_status`.
Manba: Didox partner API hujjati (api-docs.didox.uz) asosidagi ma'lumotnoma; tokenlar berilganda sinov stendida tekshirilsin.
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx
from django.conf import settings
from django.core.cache import cache

from config.apps.core.http import ApiError

log = logging.getLogger(__name__)
TIMEOUT = 60
TOKEN_TTL = 350 * 60  # Didox — 360 daqiqa; biroz oldin yangilanadi
PDF_MAX = 10 * 1024 * 1024
CABINET = "https://didox.uz"
# 000 erkin hujjat — kichik turlari (CRM'da tanlanadi)
SUBTYPES: dict[int, str] = {
    3: "Shartnoma",
    4: "To'lov uchun hisob",
    7: "Buyurtma (zayavka)",
    8: "Spetsifikatsiya",
    6: "Boshqa hujjat",
}
STATUS: dict[int, str] = {
    0: "Qoralama — Didox'da imzolab yuboring",
    1: "Yuborildi — mijoz imzosi kutilmoqda",
    2: "Sizning imzongiz kutilmoqda",
    3: "Ikki tomon imzolagan",
    4: "Mijoz rad etdi",
    5: "O'chirilgan",
    55: "Qoralama o'chirilgan",
    5555: "Bekor qilingan",
}


def enabled() -> bool:
    return bool(settings.DIDOX_PARTNER_TOKEN and settings.DIDOX_TIN and settings.DIDOX_PASSWORD)


def _req(method: str, path: str, body: dict[str, Any] | None = None, user_key: str | None = None) -> Any:
    if not enabled():
        raise ApiError(
            503,
            "Didox ulanmagan — administrator DIDOX_PARTNER_TOKEN, DIDOX_TIN va DIDOX_PASSWORD kalitlarini qo'yishi kerak.",
        )
    headers = {"Partner-Authorization": settings.DIDOX_PARTNER_TOKEN, "Accept": "application/json"}
    if user_key:
        headers["user-key"] = user_key
    try:
        with httpx.Client(timeout=TIMEOUT) as h:
            r = h.request(method, f"{settings.DIDOX_URL}{path}", json=body, headers=headers)
    except httpx.HTTPError as e:
        raise ApiError(502, "Didox bilan aloqa bo'lmadi — keyinroq urinib ko'ring.") from e
    try:
        data = r.json() if r.content else None
    except ValueError:
        data = {"raw": r.text[:300]}
    if r.status_code >= 400:
        msg = (data or {}).get("message") or (data or {}).get("error") if isinstance(data, dict) else None
        if r.status_code == 401:
            cache.delete(_key())
        raise ApiError(502, f"Didox rad etdi ({r.status_code}): {msg or 'nomaʼlum xato'}")
    return data


def _key() -> str:
    return f"didox:token:{settings.DIDOX_TIN}"


def user_key() -> str:
    tok = cache.get(_key())
    if tok:
        return tok
    res = _req("POST", f"/v1/auth/{settings.DIDOX_TIN}/password/ru", {"password": settings.DIDOX_PASSWORD}) or {}
    tok = res.get("token") or (res.get("data") or {}).get("token")
    if not tok:
        raise ApiError(502, "Didox'ga kirib bo'lmadi — STIR va parolni tekshiring.")
    cache.set(_key(), tok, TOKEN_TTL)
    return tok


def _party(info: dict[str, Any]) -> dict[str, str]:
    return {
        "Name": str(info.get("shortName") or info.get("name") or ""),
        "BranchCode": "",
        "BranchName": "",
        "Address": str(info.get("address") or info.get("fullAddress") or "").strip(),
    }


def create_draft(*, number: str, date: str, name: str, buyer_tin: str, subtype: int, pdf: bytes) -> str:
    """000 erkin hujjat qoralamasi (PDF bilan) → Didox hujjat ID'si."""
    if subtype not in SUBTYPES:
        raise ApiError(400, "Didox hujjat turi noto'g'ri.")
    if len(pdf) > PDF_MAX:
        raise ApiError(413, "PDF 10 MB dan katta — Didox qabul qilmaydi.")
    uk = user_key()
    seller = _req("GET", "/v1/profile", user_key=uk) or {}
    buyer = _req("GET", f"/v1/utils/info/{buyer_tin}", user_key=uk) or {}
    if not (buyer.get("shortName") or buyer.get("name")):
        raise ApiError(400, f"STIR {buyer_tin} soliq bazasida topilmadi — mijoz STIRini tekshiring.")
    payload = {
        "data": {
            "Document": {"DocumentNo": number, "DocumentDate": date, "DocumentName": name},
            "Subtype": subtype,
            "SellerTin": str(seller.get("tin") or settings.DIDOX_TIN),
            "Seller": _party(seller),
            "BuyerTin": buyer_tin,
            "Buyer": _party(buyer),
        },
        "document": "data:application/pdf;base64," + base64.b64encode(pdf).decode(),
    }
    res = _req("POST", "/v1/documents/000/create", payload, user_key=uk) or {}
    doc_id = str(res.get("_id") or (res.get("data") or {}).get("_id") or "")
    if not doc_id:
        raise ApiError(502, "Didox hujjat ID'sini qaytarmadi — kabinetda tekshiring.")
    return doc_id


def status(doc_id: str) -> int | None:
    """Didox hujjat holati (doc_status)."""
    res = _req("GET", f"/v1/documents/{doc_id}?owner=1", user_key=user_key()) or {}
    data = res.get("data") or {}
    meta = data.get("document") or {}
    v = meta.get("doc_status", data.get("doc_status", res.get("doc_status")))
    try:
        return int(v)
    except (TypeError, ValueError):
        return None
