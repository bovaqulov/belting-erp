"""Savdo hujjati PDF'i (fpdf2, DejaVu Sans — kirill/lotin): sarlavha (firma, hujjat turi, raqami, sanasi), mijoz,
STIR, shartnoma, asos; tovarlar jadvali (miqdor, narx, chegirma, summa, QQS); jami va QQS; to'lov — summa va usul."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fpdf import FPDF

FONTS = Path(__file__).parents[2] / "core" / "fonts"
LOGO = Path(__file__).parents[1] / "crm" / "assets" / "belting-rezina.png"
INK, MUTED, LINE, SOFT = (17, 24, 39), (100, 110, 125), (215, 221, 230), (245, 247, 250)
TITLES = {
    "order": "Buyurtma",
    "invoice": "To'lov uchun hisob",
    "shipment": "Yuk xati (sotuv)",
    "vat_invoice": "Schyot-faktura",
    "receipt": "To'lov kvitansiyasi",
}
PAY = {"bank": "bank o'tkazmasi", "cash": "naqd (kassa)", "card": "karta"}


def _n(v: Any) -> str:
    try:
        x = float(v or 0)
    except (TypeError, ValueError):
        return str(v)
    s = f"{x:,.2f}".replace(",", " ").replace(".", ",")
    return s[:-3] if s.endswith(",00") else s


def render(d: dict[str, Any], firm_name: str) -> bytes:
    pdf = FPDF(format="A4")
    pdf.set_margins(14, 14, 14)
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_font("DejaVu", "", str(FONTS / "DejaVuSans.ttf"))
    pdf.add_font("DejaVu", "B", str(FONTS / "DejaVuSans-Bold.ttf"))
    pdf.add_page()
    w = pdf.epw
    if LOGO.exists():
        pdf.image(str(LOGO), x=pdf.l_margin, y=pdf.get_y(), h=10)
    pdf.set_font("DejaVu", "B", 14)
    pdf.set_text_color(*INK)
    pdf.cell(w, 7, f"{TITLES.get(d['kind'], d['kind'])} № {d['number']}", align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "", 9)
    pdf.set_text_color(*MUTED)
    pdf.cell(
        w,
        5,
        f"{d['date'][8:10]}.{d['date'][5:7]}.{d['date'][:4]} · {firm_name}",
        align="R",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(6)
    info = [("Mijoz", d.get("customer") or "—"), ("STIR", d.get("customer_inn") or "—")]
    if d.get("contract"):
        info.append(("Shartnoma", d["contract"]))
    if d.get("warehouse") and d["kind"] in ("order", "shipment"):
        info.append(("Ombor", d["warehouse"]))
    if d.get("base"):
        info.append(("Asos", d["base"]["number"]))
    pdf.set_text_color(*INK)
    for k, v in info:
        pdf.set_font("DejaVu", "", 9)
        pdf.set_text_color(*MUTED)
        pdf.cell(28, 6, k)
        pdf.set_text_color(*INK)
        pdf.set_font("DejaVu", "B", 10)
        pdf.multi_cell(w - 28, 6, str(v), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    if d["kind"] == "receipt":
        pdf.set_font("DejaVu", "B", 13)
        pdf.cell(
            w,
            10,
            f"Qabul qilindi: {_n(d['total'])} so'm ({PAY.get(d.get('pay_method') or '', '')})",
            new_x="LMARGIN",
            new_y="NEXT",
        )
    else:
        cols = [
            (8, "№", "C"),
            (w - 8 - 18 - 14 - 28 - 16 - 30 - 24, "Tovar", "L"),
            (18, "Miqdor", "R"),
            (14, "Birl.", "C"),
            (28, "Narx", "R"),
            (16, "Chegirma", "R"),
            (30, "Summa", "R"),
            (24, "QQS", "R"),
        ]
        pdf.set_fill_color(*SOFT)
        pdf.set_draw_color(*LINE)
        pdf.set_font("DejaVu", "B", 8)
        for cw, h, al in cols:
            pdf.cell(cw, 7, h, border=1, align=al, fill=True)
        pdf.ln()
        pdf.set_font("DejaVu", "", 8)
        for i, x in enumerate(d.get("lines") or [], 1):
            name = x["name"] + (f" ({x['char']})" if x.get("char") else "")
            vals = [
                str(i),
                name,
                _n(x["qty"]),
                x.get("unit") or "",
                _n(x["price"]),
                f"{_n(x['discount'])}%" if float(x.get("discount") or 0) else "",
                _n(x["amount"]),
                _n(x["vat"]),
            ]
            for (cw, _, al), v in zip(cols, vals, strict=True):
                pdf.cell(cw, 6, v[:60] if al == "L" else v, border=1, align=al)
            pdf.ln()
        pdf.ln(3)
        pdf.set_font("DejaVu", "", 10)
        pdf.cell(w - 40, 6, f"Shu jumladan QQS {_n(d.get('vat_pct'))}%:", align="R")
        pdf.cell(40, 6, _n(d["vat"]), align="R", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("DejaVu", "B", 12)
        pdf.cell(w - 40, 8, "Jami (QQS bilan):", align="R")
        pdf.cell(40, 8, f"{_n(d['total'])} so'm", align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(14)
    pdf.set_font("DejaVu", "", 9)
    pdf.set_text_color(*MUTED)
    pdf.cell(w / 2, 6, "Topshirdi: ____________________")
    pdf.cell(w / 2, 6, "Qabul qildi: ____________________", align="R")
    return bytes(pdf.output())
