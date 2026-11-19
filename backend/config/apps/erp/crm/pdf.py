"""Hujjat PDF'i (tijorat taklifi / buyurtma) — fpdf2, DejaVu Sans (kirill + lotin; core/fonts/, litsenziya — LICENSE-DejaVu.txt),
Belting Rezina logotipi (assets/). Tuzilishi: sarlavha (logo · hujjat turi, raqami, sanasi), ma'lumot bloki (mijoz, STIR,
yetkazish, bitim), qatorlar jadvali (chegirma ustuni — bor bo'lsa), ramkadagi jami (tovarlar, chegirma, ustama, logistika).
Mijozga chat orqali yuborish va Didox uchun; tarkib frontend chop etish sahifasi (deal/doc/doc.lib.ts) bilan bir xil."""

from __future__ import annotations

import logging
from decimal import Decimal
from pathlib import Path
from typing import Any

from fpdf import FPDF
from fpdf.fonts import FontFace

HERE = Path(__file__).parent
FONTS = HERE.parents[1] / "core" / "fonts"  # umumiy shriftlar (ombor stikerlari ham)
LOGO = HERE / "assets" / "belting-rezina.png"
logging.getLogger("fontTools").setLevel(logging.WARNING)  # shrift qisqartirish (subset) INFO loglari
KINDS = {"quote": "Tijorat taklifi", "order": "Buyurtma"}

INK = (17, 24, 39)  # asosiy matn
MUTED = (100, 110, 125)  # ikkinchi darajali
LINE = (215, 221, 230)  # chegaralar
SOFT = (245, 247, 250)  # yengil fon
ACCENT = (30, 90, 168)  # urg'u (sarlavha chizig'i, jami)


def _n(v: Any, d: int = 0) -> str:
    """1234567.5 → «1 234 567» (d — kasr xonalari; vergul bilan)."""
    try:
        x = Decimal(str(v or 0))
    except ArithmeticError:
        return str(v)
    s = f"{x:,.{d}f}".replace(",", " ").replace(".", ",")
    return s.rstrip("0").rstrip(",") if d and "," in s else s


def title(doc: dict[str, Any]) -> str:
    return f"{KINDS.get(doc['kind'], doc['kind'])} {doc.get('number') or 'qoralama'}"


def _date(v: Any) -> str:
    """2026-11-16 → 16.11.2026"""
    s = str(v or "")
    return f"{s[8:10]}.{s[5:7]}.{s[:4]}" if len(s) >= 10 and s[4] == "-" else s


class _Doc(FPDF):
    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("DejaVu", "", 7.5)
        self.set_text_color(*MUTED)
        self.cell(0, 5, "Belting Rezina", align="L")
        self.set_x(self.l_margin)
        self.cell(0, 5, f"{self.page_no()} / {{nb}}", align="R")


def render(doc: dict[str, Any]) -> bytes:
    """doc — deals.doc_json(full=True) natijasi."""
    m: dict[str, Any] = doc.get("meta") or {}
    lines: list[dict[str, Any]] = list(doc.get("lines") or [])
    sub = Decimal(str(m.get("sub") or 0))
    disc = sub * Decimal(str(m.get("discount") or 0)) / 100
    mark = (sub - disc) * Decimal(str(m.get("markup") or 0)) / 100
    log = Decimal(str(m.get("logistics") or 0))

    pdf = _Doc(format="A4")
    pdf.set_margins(16, 16, 16)
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_font("DejaVu", "", str(FONTS / "DejaVuSans.ttf"))
    pdf.add_font("DejaVu", "B", str(FONTS / "DejaVuSans-Bold.ttf"))
    pdf.set_title(title(doc))
    pdf.set_author("Belting Rezina")
    pdf.add_page()
    w = pdf.epw  # ish kengligi

    # — sarlavha: chapda logo, o'ngda hujjat turi / raqam / sana
    top = pdf.get_y()
    if LOGO.exists():
        pdf.image(str(LOGO), x=pdf.l_margin, y=top + 1, h=8)
    pdf.set_xy(pdf.l_margin, top)
    pdf.set_font("DejaVu", "B", 17)
    pdf.set_text_color(*INK)
    pdf.cell(w, 8, KINDS.get(doc["kind"], doc["kind"]).upper(), align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "", 9.5)
    pdf.set_text_color(*MUTED)
    pdf.cell(
        w,
        5,
        f"№ {doc.get('number') or 'qoralama'}   ·   {_date(doc.get('date'))}",
        align="R",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(3)
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.6)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + w, pdf.get_y())
    pdf.ln(5)

    # — ma'lumot bloki (yengil fon, yumaloq burchak)
    info = [
        (k, str(v))
        for k, v in (("Mijoz", m.get("customer")), ("STIR", m.get("inn")), ("Yetkazish", m.get("location")))
        if v
    ]
    info.append(("Bitim", str(doc.get("deal_title") or "")))
    y0 = pdf.get_y()
    h = 4 + 6 * len(info)
    pdf.set_fill_color(*SOFT)
    pdf.set_draw_color(*LINE)
    pdf.set_line_width(0.2)
    pdf.rect(pdf.l_margin, y0, w, h, style="DF", round_corners=True, corner_radius=2.5)
    pdf.set_y(y0 + 2)
    for label, val in info:
        pdf.set_x(pdf.l_margin + 4)
        pdf.set_font("DejaVu", "", 9)
        pdf.set_text_color(*MUTED)
        pdf.cell(28, 6, label)
        pdf.set_font("DejaVu", "B", 10)
        pdf.set_text_color(*INK)
        pdf.cell(w - 36, 6, val[:110], new_x="LMARGIN", new_y="NEXT")
    pdf.set_y(y0 + h + 6)

    # — qatorlar jadvali (chegirma ustuni — kamida bitta qatorda bo'lsa)
    has_disc = any(Decimal(str(x.get("discount") or 0)) for x in lines)
    heads = ["№", "Tovar", "Miqdor", "Narx, so'm"] + (["Chegirma"] if has_disc else []) + ["Summa, so'm"]
    widths = (8, 76, 24, 28) + ((18,) if has_disc else ()) + (30,)
    aligns = ("CENTER", "LEFT", "RIGHT", "RIGHT") + (("RIGHT",) if has_disc else ()) + ("RIGHT",)
    pdf.set_font("DejaVu", "", 9.5)
    pdf.set_text_color(*INK)
    pdf.set_draw_color(*LINE)
    pdf.set_line_width(0.2)
    with pdf.table(
        col_widths=widths,
        text_align=aligns,
        line_height=7,
        padding=(1.2, 2),
        borders_layout="HORIZONTAL_LINES",
        cell_fill_color=SOFT,
        cell_fill_mode="ROWS",
        headings_style=FontFace(emphasis="BOLD", color=(255, 255, 255), fill_color=ACCENT),
    ) as t:
        head = t.row()
        for x in heads:
            head.cell(x)
        for i, x in enumerate(lines, 1):
            r = t.row()
            r.cell(str(i))
            r.cell(str(x.get("name") or ""))
            r.cell(f"{_n(x.get('qty'), 3)} {x.get('unit') or ''}".strip())
            r.cell(_n(x.get("price")))
            if has_disc:
                r.cell(f"{_n(x.get('discount'), 2)}%" if Decimal(str(x.get("discount") or 0)) else "")
            r.cell(_n(x.get("amount")))

    # — jami: o'ngda ramka (tovarlar, chegirma, ustama, logistika, jami)
    rows: list[tuple[str, str]] = [("Tovarlar", _n(sub))]
    if disc:
        rows.append((f"Chegirma {_n(m.get('discount'), 2)}%", f"−{_n(disc)}"))
    if mark:
        rows.append((f"Ustama {_n(m.get('markup'), 2)}%", f"+{_n(mark)}"))
    if log:
        rows.append(("Logistika", f"+{_n(log)}"))
    bw, x0 = 86.0, pdf.l_margin + w - 86.0
    bh = 6 * len(rows) + 15
    pdf.ln(6)
    if pdf.get_y() + bh > pdf.h - pdf.b_margin:
        pdf.add_page()
    y0 = pdf.get_y()
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.5)
    pdf.rect(x0, y0, bw, bh, style="D", round_corners=True, corner_radius=2.5)
    pdf.set_y(y0 + 2.5)
    for label, val in rows:
        pdf.set_x(x0 + 4)
        pdf.set_font("DejaVu", "", 9.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(bw / 2 - 4, 6, label)
        pdf.set_text_color(*INK)
        pdf.cell(bw / 2 - 4, 6, val, align="R", new_x="LMARGIN", new_y="NEXT")
    sep = pdf.get_y() + 1.5
    pdf.set_draw_color(*LINE)
    pdf.set_line_width(0.2)
    pdf.line(x0 + 4, sep, x0 + bw - 4, sep)
    pdf.set_y(sep + 2)
    pdf.set_x(x0 + 4)
    pdf.set_font("DejaVu", "B", 12)
    pdf.set_text_color(*INK)
    pdf.cell(bw / 2 - 12, 8, "Jami")
    pdf.set_text_color(*ACCENT)
    pdf.cell(bw / 2 + 4, 8, f"{_n(doc.get('total'))} so'm", align="R", new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())
