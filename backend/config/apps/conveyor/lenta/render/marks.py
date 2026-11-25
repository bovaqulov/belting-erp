"""O'lcham primitivlari — `drawing/marks.tsx` nusxasi (qoidalar 06 §1.4)."""

from __future__ import annotations

from dataclasses import dataclass

from .common import C
from .pen import Pen

CHAIN_FS = 12
CHAIN_ROW = 15
CHAIN_GAP = 6


def guide_trapezoid(
    p: Pen,
    cx: float,
    base: float,
    B: float,
    S: float,
    Hh: float,
    up: bool,
    min_x: float,
    max_x: float,
    stroke: str = C.guideEdge,
    stroke_width: float = 1.25,
) -> None:
    c = max(min_x + B / 2, min(cx, max_x - B / 2))
    tip = base - Hh if up else base + Hh
    p.polygon(
        [(c - B / 2, base), (c + B / 2, base), (c + S / 2, tip), (c - S / 2, tip)],
        fill=C.guide,
        stroke=stroke,
        stroke_width=stroke_width,
    )


def dim(
    p: Pen, x1: float, y1: float, x2: float, y2: float, label: str, small: bool = False, tag: str | None = None
) -> None:
    fs = 11 if small else 13
    mid = (x1 + x2) / 2
    too_narrow = abs(x2 - x1) < len(label) * fs * 0.62
    with p.group(stroke=C.dim, fill=C.dim, stroke_width=1.25):
        p.line(x1, y1, x2, y2)
        p.line(x1, y1 - 5, x1, y1 + 5)
        p.line(x2, y2 - 5, x2, y2 + 5)
        p.text(mid, y1 - 11 if too_narrow else y1 - 5, label, fs, weight=600, anchor="middle", stroke="none")
        if tag:
            p.text(mid, y1 + 11, tag, 10, anchor="middle", stroke="none", fill=C.thin)


def dim_x(
    p: Pen,
    x1: float,
    x2: float,
    y: float,
    label: str,
    up: bool | None = None,
    at: float = 0.5,
    outside: str | None = None,
) -> None:
    narrow = abs(x2 - x1) < len(label) * 7 + 8
    with p.group(stroke=C.dim, stroke_width=1.1, fill="none"):
        p.line(x1, y, x2, y)
        p.line(x1, y - 5, x1, y + 5)
        p.line(x2, y - 5, x2, y + 5)
        if narrow and outside:
            w = len(label) * 7 + 10
            edge = min(x1, x2) if outside == "left" else max(x1, x2)
            p.line(edge, y, edge - w if outside == "left" else edge + w, y)
            p.text(
                edge - 5 if outside == "left" else edge + 5,
                y - 5,
                label,
                12,
                weight=600,
                fill=C.dim,
                stroke="none",
                anchor="end" if outside == "left" else "start",
            )
            return
        tx = x1 + (x2 - x1) * at
        p.text(
            tx,
            y + 15 if up is False else y - (16 if narrow else 6),
            label,
            12,
            weight=600,
            fill=C.dim,
            stroke="none",
            anchor="middle",
        )
        if narrow and up is not False:
            p.line(tx, y - 5, tx, y - 13, opacity=0.5)


@dataclass
class ChainItem:
    text: str
    mid: float
    row: int
    outside: str | None = None


def dim_chain_plan(xs: list[float], labels: list[str]) -> tuple[list[ChainItem], int]:
    """Zanjir yozuvlarini qatorlarga taqsimlaydi; (items, rows)."""
    row_right: list[float] = []
    last = len(labels) - 1
    items: list[ChainItem] = []
    for i, text in enumerate(labels):
        mid = (xs[i] + xs[i + 1]) / 2
        half = (len(text) * CHAIN_FS * 0.6) / 2 + CHAIN_GAP
        narrow = xs[i + 1] - xs[i] < half * 2
        if narrow and last > 0 and i == 0:
            items.append(ChainItem(text, mid, 0, "left"))
            continue
        if narrow and last > 0 and i == last:
            items.append(ChainItem(text, mid, 0, "right"))
            continue
        row = 0
        while (row_right[row] if row < len(row_right) else float("-inf")) > mid - half:
            row += 1
        while len(row_right) <= row:
            row_right.append(float("-inf"))
        row_right[row] = mid + half
        items.append(ChainItem(text, mid, row))
    return items, max(1, len(row_right))


def dim_chain_height(rows: int) -> float:
    return 15 + (rows - 1) * CHAIN_ROW


def dim_chain(p: Pen, xs: list[float], labels: list[str], y: float, up: bool = False) -> None:
    items, _ = dim_chain_plan(xs, labels)
    d = -1 if up else 1
    with p.group(stroke=C.dim, stroke_width=1.1, fill="none"):
        p.line(xs[0], y, xs[-1], y)
        for x in xs:
            p.line(x, y - 5, x, y + 5)
        for it in items:
            if it.outside:
                left = it.outside == "left"
                x0 = xs[0] if left else xs[-1]
                ext = len(it.text) * CHAIN_FS * 0.6 + 10
                p.line(x0, y, x0 - ext if left else x0 + ext, y)
                p.text(
                    x0 - 5 if left else x0 + 5,
                    y + (-5 if up else -4),
                    it.text,
                    CHAIN_FS,
                    weight=600,
                    fill=C.dim,
                    stroke="none",
                    anchor="end" if left else "start",
                )
            else:
                if it.row > 0:
                    p.line(it.mid, y + d * 5, it.mid, y + d * (it.row * CHAIN_ROW + 4), opacity=0.45)
                p.text(
                    it.mid,
                    y + d * (15 + it.row * CHAIN_ROW) + (4 if up else 0),
                    it.text,
                    CHAIN_FS,
                    weight=600,
                    fill=C.dim,
                    stroke="none",
                    anchor="middle",
                )


def dim_y(p: Pen, y1: float, y2: float, x: float, label: str) -> None:
    with p.group(stroke=C.dim, stroke_width=1.1, fill="none"):
        p.line(x, y1, x, y2)
        p.line(x - 5, y1, x + 5, y1)
        p.line(x - 5, y2, x + 5, y2)
        p.text(x - 8, (y1 + y2) / 2 + 4, label, 12, weight=600, fill=C.dim, stroke="none", anchor="end")


def break_mark_h(p: Pen, y: float, x1: float, x2: float) -> None:
    p.rect(x1, y - 13, max(0, x2 - x1), 26, fill=C.paper, stroke="none")


def break_mark(p: Pen, x: float, y1: float, y2: float) -> None:
    p.rect(x - 13, y1, 26, max(0, y2 - y1), fill=C.paper, stroke="none")


def ext_lines(p: Pen, lines: list[tuple[float, float, float]]) -> None:
    """(x, from, to) — vertikal chiqarish chiziqlari."""
    if not lines:
        return
    with p.group(stroke=C.dim, stroke_width=0.6, opacity=0.55):
        for x, a, b in lines:
            p.line(x, a, x, b)


# ------------------------------------------------------------------ 2026-11 qo'shimchalar (09_divergences.md)
MIN_HOLE_R = 4.0  # qog'ozda kamida Ø2 mm (4 birlik = 1 mm) — teshik ko'rinsin (D2)
AXIS_DASH = "10 3 2 3"  # shtrix-punktir (o'q chizig'i)


def hole_mark(p: Pen, cx: float, cy: float, r: float, axes: bool = False) -> None:
    """Teshik: to'q to'ldirilgan doira (kamida MIN_HOLE_R), ixtiyoriy o'q chiziqlari bilan."""
    rr = max(MIN_HOLE_R, r)
    p.circle(cx, cy, rr, fill=C.line, stroke=C.line, stroke_width=0.6)
    if axes:
        e = rr + 4
        with p.group(stroke=C.thin, stroke_width=0.45, stroke_dasharray=AXIS_DASH):
            p.line(cx - e, cy, cx + e, cy)
            p.line(cx, cy - e, cx, cy + e)


def break_line_h(p: Pen, y: float, x1: float, x2: float, over: float = 8) -> None:
    """GOST 2.303 uzilish chizig'i (ingichka, siniqli) — gorizontal kesik bo'ylab."""
    span = x2 - x1
    n = max(1, min(3, int(span // 260) + 1))
    pts: list[tuple[float, float]] = [(x1 - over, y)]
    for i in range(n):
        xm = x1 + span * (i + 0.5) / n
        pts += [(xm - 6, y), (xm - 2.5, y - 8), (xm + 2.5, y + 8), (xm + 6, y)]
    pts.append((x2 + over, y))
    p.polyline(pts, fill="none", stroke=C.line, stroke_width=0.8, stroke_linejoin="round")


def note_box(
    p: Pen,
    cx: float,
    cy: float,
    lines: list[str],
    max_w: float,
    fs: float = 12.5,
    color: str = C.line,
    max_h: float = 1e9,
) -> tuple[float, float]:
    """Lenta ichidagi yozuv: och fonli ramka, markazi (cx, cy). Sig'masa so'zlab bo'linadi va kichrayadi.

    Qaytaradi: (eni, bo'yi) birlikda.
    """
    from .layout import wrap_line

    lines = [t for t in lines if t]
    if not lines or max_w < 40:
        return 0, 0

    def layout(src: list[str], size: float) -> tuple[list[str], bool]:
        mx = max(8, int((max_w - 16) // (size * 0.56)))
        rows: list[str] = []
        for t in src:
            rows.extend(s.strip() for s in wrap_line(t, mx))
        ok_w = max(len(t) for t in rows) * size * 0.56 + 16 <= max_w
        return rows, ok_w and size * 1.28 * len(rows) + 8 <= max_h

    variants = [lines] + ([[" · ".join(lines)]] if len(lines) > 1 else [])
    out: list[str] = []
    size = fs
    done = False
    joined = False
    while not done:
        for vi, src in enumerate(variants):
            out, done = layout(src, size)
            if done:
                joined = vi > 0
                break
        if not done:
            if size <= 9.5:
                out, _ = layout(lines, size)
                break
            size -= 0.5
    longest = max(len(t) for t in out)
    w = min(max_w, longest * size * 0.56 + 18)
    lh = size * 1.28
    h = lh * len(out) + 8
    p.rect(cx - w / 2, cy - h / 2, w, h, fill=C.paper, fill_opacity=0.93, stroke=color, stroke_width=0.7, rx=3)
    for i, t in enumerate(out):
        p.text(
            cx,
            cy - h / 2 + 4 + lh * (i + 0.78),
            t,
            size,
            weight=600 if i == 0 or joined else 400,
            fill=color,
            anchor="middle",
        )
    return w, h


def lock_band(p: Pen, x1: float, x2: float, y: float, depth: float, kind: str, down: bool) -> None:
    """Ulash belgisi lenta uchida (eni bo'ylab): `lock` — taroq/sharnir, `weld` — shtrixlangan band.

    `y` — lenta uchi; `down` — band lenta ichiga pastga qarab (yuqori uch) yoki tepaga (pastki uch).
    """
    d = max(6.0, depth)
    top = y if down else y - d
    if kind == "weld":
        p.rect(x1, top, x2 - x1, d, fill=C.paper, stroke=C.line, stroke_width=0.8)
        step = 6
        with p.group(stroke=C.line, stroke_width=0.5):
            x = x1 - d
            while x < x2:
                a = max(x, x1)
                b = min(x + d, x2)
                # 45° shtrix: (x, top+d) -> (x+d, top), band ichida kesilgan
                p.line(a, top + d - (a - x), b, top + d - (b - x))
                x += step
        return
    # mexanik qulf: band + taroq tishlari (navbatma-navbat ilmoqlar)
    p.rect(x1, top, x2 - x1, d, fill=C.guide, stroke=C.line, stroke_width=0.8)
    pitch = 9.0
    n = max(2, int((x2 - x1) // pitch))
    step = (x2 - x1) / n
    with p.group(stroke=C.line, stroke_width=0.6, fill=C.paper):
        for i in range(n):
            if i % 2:
                continue
            a = x1 + i * step + step * 0.15
            p.rect(a, top + d * 0.2, step * 0.7, d * 0.6)
    p.line(x1, top + d / 2, x2, top + d / 2, stroke=C.line, stroke_width=0.5, stroke_dasharray=AXIS_DASH)


def short_lock_name(name: str) -> str:
    """ "KS - SE 90/10 пластик (Пластик замок FORBO)" -> "KS - SE 90/10 (FORBO)"."""
    import re

    base, _, rest = name.partition("(")
    words = [w for w in base.split() if not re.fullmatch(r"[А-Яа-яЁё.]+", w)]
    brand = [w for w in re.findall(r"[A-Z][A-Z0-9]{2,}", rest) if w not in ("MM", "ММ")]
    out = " ".join(words).strip() or name.strip()
    return f"{out} ({brand[0]})" if brand else out
