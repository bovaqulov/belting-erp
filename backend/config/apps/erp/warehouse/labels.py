"""Stikerlar (termoprinter 58×40 mm, PDF): birlik (rulon/bo'lak — QR kod, nom, o'lcham, firma), tovar (shtrixkod
o'rniga QR — artikul), javon (QR — joy kodi). QR — segno, PDF — fpdf2 + DejaVu (kirill). Matn sig'masa — qisqartiriladi.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import segno
from fpdf import FPDF

from . import codes as K
from .models import Cell, Place, Rack, Unit
from .stock import Bad, NotFound, cat, char_name, full_name, mm

FONTS = Path(__file__).resolve().parents[2] / "core" / "fonts"
W, H = 58.0, 40.0
QR = 26.0
MAX = 300  # bitta PDF'da ko'pi bilan


def _qr_png(text: str) -> io.BytesIO:
    buf = io.BytesIO()
    segno.make(text, error="m", micro=False).save(buf, kind="png", scale=8, border=1)
    buf.seek(0)
    return buf


class _Pdf(FPDF):
    def __init__(self) -> None:
        super().__init__(unit="mm", format=(W, H))
        self.set_auto_page_break(False)
        self.set_margins(0, 0, 0)
        self.add_font("DejaVu", "", str(FONTS / "DejaVuSans.ttf"))
        self.add_font("DejaVu", "B", str(FONTS / "DejaVuSans-Bold.ttf"))

    def fit(self, text: str, width: float, size: float, style: str = "") -> str:
        """Matnni kenglikka sig'dirish (oxiri «…»)."""
        self.set_font("DejaVu", style, size)
        if self.get_string_width(text) <= width:
            return text
        while text and self.get_string_width(text + "…") > width:
            text = text[:-1]
        return text + "…"

    def label(self, code: str, title: str, lines: list[str], big: str = "") -> None:
        self.add_page()
        self.image(_qr_png(code), x=1.5, y=1.5, w=QR, h=QR)
        x = QR + 3
        tw = W - x - 1.5
        self.set_xy(x, 2)
        self.set_font("DejaVu", "B", 9)
        self.cell(tw, 4.5, self.fit(code, tw, 9, "B"))
        y = 7.5
        for ln in lines[:5]:
            self.set_xy(x, y)
            self.cell(tw, 3.6, self.fit(ln, tw, 7))
            y += 3.8
        if big:
            self.set_xy(x, y + 0.5)
            self.cell(tw, 5, self.fit(big, tw, 11, "B"))
        # nom — pastda, ikki qatorgacha
        self.set_font("DejaVu", "", 7.5)
        self.set_xy(1.5, QR + 2.5)
        words, rows, cur = title.split(), [], ""
        for w in words:
            t = f"{cur} {w}".strip()
            if self.get_string_width(t) <= W - 3:
                cur = t
            else:
                rows.append(cur)
                cur = w
        rows.append(cur)
        if len(rows) > 2:
            rows = [rows[0], self.fit(" ".join(rows[1:]), W - 3, 7.5)]
        for r in rows:
            self.set_x(1.5)
            self.cell(W - 3, 3.6, r, new_x="LMARGIN", new_y="NEXT")

    def data(self) -> bytes:
        return bytes(self.output())


def _size(u: Unit) -> str:
    w, length = mm(u.width_mm), mm(u.length_mm)
    if w and length:
        return f"{w} × {length} mm"
    if w:
        return f"eni {w} mm"
    if length:
        return f"{length / 1000:g} m"
    return ""


def units_pdf(ids: list[int]) -> bytes:
    us = list(Unit.objects.select_related("loc").filter(pk__in=ids[:MAX], code__isnull=False))
    if not us:
        raise NotFound("Stiker uchun birlik topilmadi (donali partiyaga stiker chiqmaydi)")
    info = cat({u.item_id for u in us})
    pdf = _Pdf()
    for u in sorted(us, key=lambda x: x.code or ""):
        it = info.get(u.item_id, {"name": f"#{u.item_id}", "unit": "", "chars": {}})
        lines = [
            x
            for x in (
                _size(u),
                f"{u.firm}" + (f" · {u.loc.code}" if u.loc else ""),
                f"dan: {u.parent_code}" if u.parent_code else "",
            )
            if x
        ]
        pdf.label(u.code or "", full_name(it, u.char_id), lines, f"{float(u.qty):g} {it['unit']}")
    return pdf.data()


def item_pdf(item_id: int, char_id: int | None, copies: int = 1) -> bytes:
    it = cat([item_id]).get(item_id)
    if it is None:
        raise NotFound("Tovar topilmadi")
    code = it["barcode"] or it["sku"] or f"I{item_id}"
    pdf = _Pdf()
    for _ in range(max(1, min(copies, 50))):
        pdf.label(
            code,
            full_name(it, char_id),
            [x for x in (it["sku"] or "", char_name(it, char_id) or "", it["grp"] or "") if x],
        )
    return pdf.data()


def cells_pdf(ids: list[int]) -> bytes:
    """Tokcha yorlig'i: QR va to'liq kod (AO1-A-02-03-C), katta — qator-qavat (03-C): javon oldida tez o'qiladi."""
    cs = list(Cell.objects.select_related("warehouse", "block__building", "rack").filter(pk__in=ids[:MAX]))
    if not cs:
        raise NotFound("Javon topilmadi")
    pdf = _Pdf()
    for c in sorted(cs, key=lambda x: x.code):
        if c.rack_id and c.row and c.floor:
            b = c.block
            where = " · ".join(
                x
                for x in (c.warehouse.name, b.building.name if b and b.building else "", f"{b.code} xona" if b else "")
                if x
            )
            pdf.label(
                c.code,
                f"{c.rack.name or f'{c.rack.number}-stellaj'} · {c.row}-qator · {c.floor}-qavat ({K.floor_letter(c.floor)})",
                [where],
                f"{c.row:02d}-{K.floor_letter(c.floor)}",
            )
        else:
            pdf.label(c.code, c.warehouse.name, [c.block.name if c.block else ""], c.code)
    return pdf.data()


def racks_pdf(ids: list[int]) -> bytes:
    """Stellaj boshi yorlig'i: katta stellaj kodi (AO1-A-02) va QR — skanerlansa, xaritada stellaj ochiladi."""
    rs = list(Rack.objects.select_related("warehouse", "block__building").filter(pk__in=ids[:MAX]))
    if not rs:
        raise NotFound("Stellaj topilmadi")
    pdf = _Pdf()
    for r in rs:
        b = r.block
        code = K.rack(K.block(K.building(r.warehouse.code, b.building.number), b.code), r.number) if b.building else ""
        pdf.label(
            code,
            f"{r.name or f'{r.number}-stellaj'} — {r.rows} qator × {r.floors} qavat (A…{K.floor_letter(r.floors)})",
            [
                r.warehouse.name,
                f"{b.building.name if b.building else ''} · {b.code} xona{f' — {b.name}' if b.name else ''}",
            ],
            code,
        )
    return pdf.data()


def place_pdf(pk: int) -> bytes:
    p = Place.objects.filter(pk=pk).first()
    if p is None:
        raise NotFound("Joylashtirish topilmadi")
    coded = list(Unit.objects.filter(pk__in=p.unit_ids, code__isnull=False).values_list("pk", flat=True))
    return units_pdf(coded) if coded else item_pdf(p.item_id, p.char_id)


def labels_pdf(body: dict[str, Any]) -> bytes:
    if body.get("batch_ids"):
        return units_pdf([int(x) for x in body["batch_ids"]])
    if body.get("cell_ids"):
        return cells_pdf([int(x) for x in body["cell_ids"]])
    if body.get("rack_ids"):
        return racks_pdf([int(x) for x in body["rack_ids"]])
    if body.get("item_id"):
        return item_pdf(
            int(body["item_id"]), int(body["char_id"]) if body.get("char_id") else None, int(body.get("copies") or 1)
        )
    raise Bad("Nimaning stikeri — birlik, tovar yoki javonni tanlang")


def custom_pdf(rows: list[tuple[str, str, list[str], str]]) -> bytes:
    """Ixtiyoriy stikerlar: [(QR kodi, nom, qatorlar, katta yozuv)] — sex zakaz stikeri va boshqalar."""
    if not rows:
        raise NotFound("Stiker uchun ma'lumot yo'q")
    pdf = _Pdf()
    for code, title, lines, big in rows[:MAX]:
        pdf.label(code, title, lines, big)
    return pdf.data()
