"""Matn bloklari — `drawing/layout.tsx` nusxasi (06 §1.5)."""

from __future__ import annotations

import math

from .common import Box, C
from .pen import Pen


def zone(p: Pen, box: Box, title: str | None = None, sub: str | None = None) -> None:
    p.rect(box.x, box.y, box.w, box.h, fill="none", stroke=C.line, stroke_width=1.1)
    if title:
        p.text(box.x + 14, box.y + 26, title, 15, weight=600, fill=C.line)
    if sub:
        p.text(box.x + 14, box.y + 43, sub, 11.5, fill=C.thin)


def info_lines(p: Pen, x: float, y: float, lines: list[str | None], lh: float = 18, max_w: float = 272) -> float:
    """Chap ustun matni; uzun qatorlar so'zlab bo'linadi (ramkadan chiqmasin). Qaytaradi: oxirgi qator y si."""
    fs = 12.5
    mx = max(16, math.floor(max_w / (fs * 0.53)))
    use: list[str] = []
    for t in lines:
        if t:
            use.extend(wrap_line(t, mx))
    for i, t in enumerate(use):
        if t.startswith("§"):
            p.text(x, y + i * lh, t[1:], 11.5, weight=700, letter_spacing=0.6, fill=C.line)
        else:
            p.text(
                x + (10 if t.startswith("    ") else 0),
                y + i * lh,
                t.strip(),
                fs,
                fill=C.dim if t.startswith("⚠") else C.thin,
            )
    return y + (len(use) - 1) * lh


def wrap_line(t: str, mx: int) -> list[str]:
    if t.startswith("§") or len(t) <= mx:
        return [t]
    indent = "  " if t.startswith("  ") else ""
    words = t.strip().split(" ")
    out: list[str] = []
    cur = ""
    for w in words:
        nxt = f"{cur} {w}" if cur else w
        room = mx - len(indent) - (2 if out else 0)
        if len(nxt) > room and cur:
            out.append(cur)
            cur = w
        else:
            cur = nxt
    if cur:
        out.append(cur)
    return [f"{indent}{ln}" if i == 0 else f"{indent}  {ln}" for i, ln in enumerate(out)]


def info_fit(p: Pen, box: Box, lines: list[str | None], top: float = 36) -> None:
    wrap_at = max(16, math.floor((box.w - 36) / (11.5 * 0.53)))
    use: list[str] = []
    for t in lines:
        if t:
            use.extend(wrap_line(t, wrap_at))
    while use and use[-1].strip() == "":
        use.pop()
    avail = box.h - top - 10
    MIN_LH = 11
    MAX_LH = 17.5
    cols = 2 if len(use) * MIN_LH > avail else 1
    parts: list[list[str]] = [use]
    if cols == 2:
        mid = len(use) / 2
        cut = math.ceil(mid)
        best = math.inf
        for i, t in enumerate(use):
            if t.startswith("§") and i > 0 and abs(i - mid) < best:
                best = abs(i - mid)
                cut = i
        second = [t for i, t in enumerate(use[cut:]) if not (i == 0 and t.strip() == "")]
        parts = [use[:cut], second]
    rows_max = max([len(pp) for pp in parts] + [1])
    lh = min(MAX_LH, avail / rows_max)
    col_w = (box.w - 24) / cols
    longest = max([1] + [len(t.strip()) + 1 if t.startswith("  ") else len(t) for t in use])
    fs = max(8.5, min(12.5, lh * 0.74, (col_w - 6) / (longest * 0.53)))
    max_chars = max(8, math.floor((col_w - 6) / (fs * 0.53)))

    def cut_t(t: str) -> str:
        return f"{t[: max_chars - 1]}…" if len(t) > max_chars else t

    for c, part in enumerate(parts):
        for i, t in enumerate(part):
            x = box.x + 12 + c * col_w
            y = box.y + top + lh * (i + 0.8)
            if t.startswith("§"):
                p.text(x, y, cut_t(t[1:]), fs * 0.92, weight=700, letter_spacing=0.5, fill=C.line)
            else:
                dx = 14 if t.startswith("    ") else 6 if t.startswith("  ") else 0
                p.text(x + dx, y, cut_t(t.strip()), fs, fill=C.dim if t.startswith("⚠") else C.thin)
