"""Hujjatni yuborish: PDF (pdf.py) — mijoz chatiga (Telegram / WhatsApp — fayl; Instagram — matn, Meta fayl qabul
qilmaydi) va Didox'ga (000 erkin hujjat qoralamasi, imzo — Didox kabinetida). Har yuborish — bitim tarixida."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from config.apps.core.http import ApiError

from . import didox, pdf, sales, tg
from .access import Me
from .deals import doc_json
from .models import Activity, Doc, TgChat

CH_NAME = {"tg": "Telegram", "wa": "WhatsApp", "ig": "Instagram"}


def render(doc: Doc) -> bytes:
    return pdf.render(doc_json(doc, full=True))


def filename(doc: Doc) -> str:
    return f"{doc.number}.pdf"


def summary(doc: Doc) -> str:
    """Hujjat matni (fayl yuborib bo'lmaydigan kanal uchun)."""
    j = doc_json(doc, full=True)
    rows = "\n".join(
        f"{i}. {x.get('name')} — {pdf._n(x.get('qty'), 3)} {x.get('unit') or ''} × {pdf._n(x.get('price'))} = {pdf._n(x.get('amount'))}"
        for i, x in enumerate(j["lines"], 1)
    )
    return f"{pdf.title(j)} ({j['date']})\n{rows}\nJami: {pdf._n(j['total'])} so'm"


def to_chat(me: Me, doc: Doc, chat: TgChat, now: datetime) -> dict[str, Any]:
    """Mijoz chatiga: Telegram / WhatsApp — PDF fayl (izoh bilan), Instagram — matn."""
    ch = chat.connection.channel
    if chat.connection.user_tg != me.tg_id:
        raise ApiError(403, "Faqat o'z chatingizga yuborasiz.")
    caption = f"{pdf.title(doc_json(doc))} — {pdf._n(doc.total)} so'm"
    if ch == "ig":
        msg = tg.send(chat, summary(doc))
    else:
        msg = tg.send_file(chat, filename(doc), "application/pdf", render(doc), caption, True, None)
    Activity.objects.create(
        deal=doc.deal,
        kind="message",
        ts=now,
        actor=me.tg_id,
        text=f"{doc.number} mijozga {CH_NAME.get(ch, ch)} orqali yuborildi",
    )
    # ketma-ketlik: taklif yuborildi → «Taklif yuborildi», buyurtma yuborildi → «Shartnoma va hisob-faktura»
    sales.advance(me, doc.deal, "offer" if doc.kind == "quote" else "contract", now, f"{doc.number} mijozga yuborildi")
    return {"ok": True, "message_id": msg.pk, "channel": ch}


def to_didox(me: Me, doc: Doc, subtype: int, now: datetime) -> dict[str, Any]:
    """Didox'da qoralama (PDF bilan). Mijoz STIRi kerak; qayta yaratilmaydi (o'chirilgan/bekor qilingan bo'lsa — mumkin)."""
    if doc.didox_id and doc.didox_status not in (5, 55, 5555):
        raise ApiError(409, "Bu hujjat Didox'da allaqachon bor — holatini yangilang yoki kabinetda oching.")
    inn = str((doc_json(doc, full=True)["meta"] or {}).get("inn") or "")
    if len(inn) not in (9, 14):
        raise ApiError(400, "Mijozning STIRi yo'q — Didox'ga yuborish uchun mijoz kartochkasida STIRni kiriting.")
    j = doc_json(doc, full=True)
    doc.didox_id = didox.create_draft(
        number=doc.number, date=j["date"], name=pdf.title(j), buyer_tin=inn, subtype=subtype, pdf=render(doc)
    )
    doc.didox_status, doc.didox_at = 0, now
    doc.save(update_fields=["didox_id", "didox_status", "didox_at"])
    d = doc.deal
    if d.sign_status != "signed":  # shartnoma imzoga yuborilmoqda — bitimda «Yuborildi» (1 kunlik kuzatuv)
        d.sign_status, d.sign_sent_at = "sent", now
        d.save(update_fields=["sign_status", "sign_sent_at"])
    sales.advance(me, d, "contract", now, f"{doc.number} Didox'ga yuborildi")
    Activity.objects.create(
        deal=doc.deal,
        kind="doc",
        ts=now,
        actor=me.tg_id,
        text=f"{doc.number} Didox'da qoralama sifatida yaratildi ({didox.SUBTYPES[subtype]}) — kabinetda E-IMZO bilan imzolab yuboring",
    )
    return doc_json(doc, full=True)


def didox_refresh(me: Me, doc: Doc, now: datetime) -> dict[str, Any]:
    if not doc.didox_id:
        raise ApiError(400, "Hujjat hali Didox'ga yuborilmagan.")
    st = didox.status(doc.didox_id)
    if st is not None and st != doc.didox_status:
        doc.didox_status = st
        doc.save(update_fields=["didox_status"])
        Activity.objects.create(
            deal=doc.deal, kind="doc", ts=now, actor=me.tg_id, text=f"Didox: {doc.number} — {didox.STATUS.get(st, st)}"
        )
        if st == 3 and doc.deal.sign_status != "signed":  # ikki tomon imzoladi — bitimda ham «Imzolandi»
            doc.deal.sign_status = "signed"
            doc.deal.save(update_fields=["sign_status"])
            sales.advance(me, doc.deal, "payment", now, f"Didox: {doc.number} ikki tomon imzoladi")
    return doc_json(doc, full=True)
