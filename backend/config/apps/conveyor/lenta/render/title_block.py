"""Sarlavha jadvallari — `drawing/titleBlock.tsx` nusxasi (06 §4)."""

from __future__ import annotations

import math

from .._js import jround, js_str
from ..format import f1, uzs
from .common import CONTENT_BOT, CONTENT_X, NO_SCALE, PAD, TITLE_H, C, H, W
from .pen import Pen, Span


def fit_text(text: str, max_w: float) -> str:
    per = 5.9
    mx = max(3, math.floor(max_w / per))
    return text if len(text) <= mx else f"{text[: mx - 1].rstrip()}…"


def scale_text(ratio: float) -> str:
    if ratio == NO_SCALE:
        return "Masshtabsiz"
    if not (ratio > 0) or not math.isfinite(ratio):
        return "—"
    if ratio >= 1:
        return f"1 : {js_str(jround(ratio))}"
    up = 1 / ratio
    v = jround(up) if up >= 10 else jround(up * 10) / 10
    return f"{js_str(v)} : 1".replace(".", ",", 1)


def title_block(
    p: Pen, m: dict, scale_ratio: float, ok: bool, sheet_title: str, page: int, pages: int, date: str
) -> None:
    x = CONTENT_X
    w = W - PAD - CONTENT_X
    y = CONTENT_BOT
    rows = 6
    row_h = math.floor((TITLE_H - 24) / rows)
    head_h = TITLE_H - rows * row_h
    col_label, col_val, col_unit = 212, 236, 42
    left_w = col_label + col_val + col_unit
    VAL_FS = 11
    max_chars = math.floor((col_val - 14) / (VAL_FS * 0.56))
    b = m["belt"]
    customer = " · ".join(v for v in (m["projectName"], m["customerPhone"]) if v)
    joint = b["joint"]
    data = [
        ("Buyurtmachi, loyiha / Заказчик", customer or "ko'rsatilmagan / не указан", ""),
        ("Turi / Тип", b["name"], ""),
        ("Eni / Ширина", uzs(b["width"]) if ok else "—", "мм"),
        ("Uzunligi / Длина", uzs(b["length"]) if ok else "—", "мм"),
        (
            "Kesish uz. / Длина раскроя",
            f"{uzs(b['length'] + joint)}{f' (+{uzs(joint)} ulash)' if joint else ''}" if ok else "—",
            "мм",
        ),
        ("Qalinligi / Толщина", f1(b["thickness"]) if b["thickness"] else "—", "мм"),
    ]
    with p.group(stroke=C.line, stroke_width=1.35, fill="none"):
        p.line(x, y + head_h, x + left_w, y + head_h)
        p.text(
            x + left_w / 2,
            y + head_h - 7,
            "Konveyer lenta / Конвейерная лента",
            13,
            weight=600,
            fill=C.line,
            stroke="none",
            anchor="middle",
        )
        for i, (label, value, unit) in enumerate(data):
            ry = y + head_h + i * row_h
            if i < rows - 1:
                p.line(x, ry + row_h, x + left_w, ry + row_h)
            p.line(x + col_label, ry, x + col_label, ry + row_h)
            p.line(x + col_label + col_val, ry, x + col_label + col_val, ry + row_h)
            ty = ry + row_h / 2 + 4
            p.text(x + 8, ty, label, 11, fill=C.line, stroke="none")
            val = f"{value[: max_chars - 1]}…" if len(value) > max_chars else value
            p.text(x + col_label + col_val / 2, ty, val, VAL_FS, fill=C.line, stroke="none", anchor="middle")
            p.text(
                x + col_label + col_val + col_unit / 2, ty, unit, VAL_FS, fill=C.line, stroke="none", anchor="middle"
            )
        p.line(x + left_w, y, x + left_w, y + TITLE_H)
        _right_block(p, x + left_w, y, w - left_w, TITLE_H, m, scale_ratio, ok, sheet_title, page, pages, date)


def _right_block(
    p: Pen,
    x: float,
    y: float,
    w: float,
    h: float,
    m: dict,
    scale_ratio: float,
    ok: bool,
    sheet_title: str,
    page: int,
    pages: int,
    date: str,
) -> None:
    r = h / 6
    c1 = 150
    half = w / 2
    T = {"fill": C.line, "stroke": "none"}
    with p.group():
        p.line(x, y + r, x + w, y + r)
        p.line(x + c1, y, x + c1, y + r)
        p.line(x + half, y, x + half, y + r)
        p.line(x + half + c1, y, x + half + c1, y + r)
        p.text(x + 8, y + r / 2 + 4, "Fayl / Файл", 11, **T)
        p.text(
            x + c1 + 10,
            y + r / 2 + 4,
            fit_text(m.get("_drawingNo") or m["projectName"] or "—", half - c1 - 78),
            11,
            weight=600,
            **T,
        )
        p.text(x + half + 8, y + r / 2 + 4, "Sana / Дата", 11, **T)
        p.text(x + half + c1 + 10, y + r / 2 + 4, date or "—", 11, weight=600, **T)

        p.line(x, y + 2 * r, x + w, y + 2 * r)
        p.line(x + c1, y + r, x + c1, y + 2 * r)
        p.line(x + half, y + r, x + half, y + 2 * r)
        p.line(x + half + c1, y + r, x + half + c1, y + 2 * r)
        p.text(x + 8, y + 1.5 * r + 4, "Masshtab / Масштаб", 11, **T)
        p.text(
            x + c1 + 10,
            y + 1.5 * r + 4,
            "turlicha" if page > 1 else scale_text(scale_ratio) if ok else "—",
            11,
            weight=600,
            **T,
        )
        p.text(x + half - 10, y + r / 2 + 4, f"List {page} / {pages}", 11, weight=600, anchor="end", **T)
        p.text(x + half + 8, y + 1.5 * r + 4, "O'lchov / Ед. изм.", 11, **T)
        p.text(x + half + c1 + 10, y + 1.5 * r + 4, "мм", 11, weight=600, **T)

        p.line(x, y + 3.6 * r, x + w, y + 3.6 * r)
        fs = min(20, r * 0.72)
        nm = m["projectName"] or "Konveyer lenta"
        mx = max(8, int((w - 40) / (fs * 0.56)))  # katakka sig'sin (uzun nom qisqartiriladi)
        if len(nm) > mx:
            nm = nm[: mx - 1].rstrip() + "…"
        p.text(x + w / 2, y + 2 * r + 0.75 * r, nm, fs, anchor="middle", **T)
        spans = [Span(sheet_title)]
        if m["customerPhone"]:
            spans.append(Span(f" · {m['customerPhone']}", weight=400, fill=C.thin))
        p.text(x + w / 2, y + 3.6 * r - 0.22 * r, spans, min(12, r * 0.5), weight=600, anchor="middle", **T)

        p.line(x, y + 4.4 * r, x + w, y + 4.4 * r)
        p.text(x + w / 2, y + 4 * r + 4, "Tasdiqlandi / Одобрена:", 11, anchor="middle", **T)

        p.line(x + half, y + 4.4 * r, x + half, y + h)
        p.text(x + 10, y + 5 * r + 2, "F.I.O.: ______________________", 11, **T)
        p.text(x + 10, y + 5.7 * r + 2, "Imzo / Подпись: ______________", 11, **T)
        p.text(x + half + 10, y + 5 * r + 2, "Ishlab chiqdi / Разработал:", 11, **T)
        p.text(x + half + 10, y + 5.7 * r + 2, m["author"], 11, weight=600, **T)


def mini_title_block(p: Pen, m: dict, sheet_title: str, page: int, pages: int, date: str) -> None:
    x = CONTENT_X
    w = W - PAD - CONTENT_X
    h = 26
    y = PAD + (H - 2 * PAD) - h
    b = m["belt"]
    cells = [
        (m["projectName"] or "Konveyer lenta", sheet_title),
        (f"{uzs(b['width'])} × {uzs(b['length'])} mm", m["customerPhone"] or ""),
        (date or "", f"List {page} / {pages}"),
    ]
    col_w = w / 3
    with p.group(stroke=C.line, stroke_width=1.1, fill="none"):
        p.line(x, y, x + w, y)
        for i, (a, bb) in enumerate(cells):
            if i > 0:
                p.line(x + i * col_w, y, x + i * col_w, y + h)
            a = fit_text(a, col_w - 28 - len(bb) * 6.2)  # o'ng tomondagi yozuv bilan ustma-ust tushmasin
            p.text(x + i * col_w + 10, y + h / 2 + 4, a, 11, weight=600, fill=C.line, stroke="none")
            p.text(x + (i + 1) * col_w - 10, y + h / 2 + 4, bb, 11, fill=C.thin, stroke="none", anchor="end")
