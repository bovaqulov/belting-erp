"""Vektor PDF backend (reportlab): A4 albom, har bir list — bitta sahifa.

Varaq birliklari (1188 × 840, y pastga) to'g'ridan-to'g'ri PDF ga
o'tkaziladi: `scale(297mm / 1188)` va y o'qi aylantiriladi. Matn uchun
kirill + o'zbek (o‘ g‘) chiqaradigan TTF (Arial) ro'yxatdan o'tkaziladi;
shriftda yo'q belgi (masalan ⚠) zaxira shriftdan, u ham bo'lmasa
vektor belgi bilan chiziladi.
"""

from __future__ import annotations

import io
import math
import os
import re
from dataclasses import dataclass
from typing import Any

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas

from .pen import Node

SHEET_W = 1188.0
SHEET_H = 840.0

_REGULAR_CANDIDATES = [
    os.environ.get("LENTA_FONT", ""),
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/msttcorefonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
]
_BOLD_CANDIDATES = [
    os.environ.get("LENTA_FONT_BOLD", ""),
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
]
_SYMBOL_CANDIDATES = [
    "/System/Library/Fonts/Apple Symbols.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
]


@dataclass
class _Font:
    name: str
    cmap: set[int] | None  # None — standart Helvetica (faqat latin-1)


_FONTS: dict[str, _Font] | None = None


def _register(name: str, candidates: list[str]) -> _Font | None:
    for path in candidates:
        if path and os.path.exists(path):
            try:
                tt = TTFont(name, path)
                pdfmetrics.registerFont(tt)
                return _Font(name, set(tt.face.charToGlyph.keys()))
            except Exception:
                continue
    return None


def fonts() -> dict[str, _Font]:
    """Shriftlar (bir marta ro'yxatdan o'tkaziladi); topilmasa Helvetica."""
    global _FONTS
    if _FONTS is None:
        reg = _register("LentaSans", _REGULAR_CANDIDATES)
        bold = _register("LentaSans-Bold", _BOLD_CANDIDATES) or reg
        sym = _register("LentaSymbols", _SYMBOL_CANDIDATES)
        _FONTS = {
            "regular": reg or _Font("Helvetica", None),
            "bold": bold or _Font("Helvetica-Bold", None),
            "symbol": sym or _Font("Helvetica", None),
        }
    return _FONTS


def _has(f: _Font, ch: str) -> bool:
    if f.cmap is None:
        return ord(ch) < 256
    return ord(ch) in f.cmap


# ------------------------------------------------------------------ ranglar
_HEX3 = re.compile(r"^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$")
_HEX6 = re.compile(r"^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$")
_RGB = re.compile(r"^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$")


def parse_color(c: Any) -> tuple[float, float, float] | None:
    if c is None or c == "none":
        return None
    s = str(c).strip()
    if m := _HEX6.match(s):
        return tuple(int(g, 16) / 255 for g in m.groups())  # type: ignore[return-value]
    if m := _HEX3.match(s):
        return tuple(int(g * 2, 16) / 255 for g in m.groups())  # type: ignore[return-value]
    if m := _RGB.match(s):
        return tuple(int(g) / 255 for g in m.groups())  # type: ignore[return-value]
    named = {"white": (1, 1, 1), "black": (0, 0, 0)}
    return named.get(s, (0, 0, 0))  # type: ignore[return-value]


# --------------------------------------------------------- uslub merosi
_INHERIT = (
    "fill",
    "stroke",
    "stroke-width",
    "stroke-dasharray",
    "stroke-linejoin",
    "fill-rule",
    "fill-opacity",
    "stroke-opacity",
    "font-size",
    "font-weight",
    "text-anchor",
    "letter-spacing",
)
_DEFAULT = {"fill": "#000000", "stroke": "none", "stroke-width": 1.0, "opacity": 1.0}


def _style(parent: dict[str, Any], attrs: dict[str, Any]) -> dict[str, Any]:
    st = dict(parent)
    for k in _INHERIT:
        if k in attrs:
            st[k] = attrs[k]
    if "opacity" in attrs:
        st["opacity"] = st.get("opacity", 1.0) * float(attrs["opacity"])
    return st


def _dash(v: Any) -> list[float] | None:
    if v is None or v == "none":
        return None
    vals = [float(x) for x in re.split(r"[\s,]+", str(v).strip()) if x]
    return vals or None


# ------------------------------------------------------------ chizuvchi
class _Painter:
    def __init__(self, c: rl_canvas.Canvas) -> None:
        self.c = c
        self.f = fonts()

    # uslubni o'rnatadi; (fill?, stroke?) qaytaradi
    def apply(self, st: dict[str, Any], *, allow_fill: bool = True) -> tuple[bool, bool]:
        c = self.c
        op = float(st.get("opacity", 1.0))
        fill = parse_color(st.get("fill")) if allow_fill else None
        stroke = parse_color(st.get("stroke"))
        sw = float(st.get("stroke-width", 1.0))
        if fill:
            c.setFillColorRGB(*fill)
            c.setFillAlpha(max(0.0, min(1.0, op * float(st.get("fill-opacity", 1.0)))))
        if stroke and sw > 0:
            c.setStrokeColorRGB(*stroke)
            c.setStrokeAlpha(max(0.0, min(1.0, op * float(st.get("stroke-opacity", 1.0)))))
            c.setLineWidth(sw)
            c.setLineJoin(1 if st.get("stroke-linejoin") == "round" else 0)
            d = _dash(st.get("stroke-dasharray"))
            if d:
                c.setDash(d, 0)
            else:
                c.setDash([], 0)
        return bool(fill), bool(stroke and sw > 0)

    def node(self, n: Node, parent: dict[str, Any]) -> None:
        st = _style(parent, n.attrs)
        c = self.c
        if n.tag == "g":
            if n.transform:
                c.saveState()
                self._transform(n.transform)
            for ch in n.children:
                self.node(ch, st)
            if n.transform:
                c.restoreState()
            return
        if n.tag == "text":
            self.text(n, st)
            return
        if n.tag == "image":
            self.image(n)
            return
        c.saveState()
        a = n.attrs
        fill_rule_even = st.get("fill-rule") == "evenodd"
        if n.tag == "line":
            do_fill, do_stroke = self.apply(st, allow_fill=False)
            if do_stroke:
                c.line(float(a["x1"]), float(a["y1"]), float(a["x2"]), float(a["y2"]))
        elif n.tag == "rect":
            do_fill, do_stroke = self.apply(st)
            w, h = float(a["width"]), float(a["height"])
            if (do_fill or do_stroke) and w >= 0 and h >= 0:
                c.rect(float(a["x"]), float(a["y"]), w, h, stroke=int(do_stroke), fill=int(do_fill))
        elif n.tag == "circle":
            do_fill, do_stroke = self.apply(st)
            if do_fill or do_stroke:
                c.circle(float(a["cx"]), float(a["cy"]), float(a["r"]), stroke=int(do_stroke), fill=int(do_fill))
        elif n.tag == "ellipse":
            do_fill, do_stroke = self.apply(st)
            cx, cy, rx, ry = (float(a[k]) for k in ("cx", "cy", "rx", "ry"))
            if do_fill or do_stroke:
                c.ellipse(cx - rx, cy - ry, cx + rx, cy + ry, stroke=int(do_stroke), fill=int(do_fill))
        elif n.tag in ("polygon", "polyline"):
            closed = n.tag == "polygon"
            do_fill, do_stroke = self.apply(st, allow_fill=closed or st.get("fill") not in (None, "none"))
            pts = n.pts or []
            if len(pts) >= 2 and (do_fill or do_stroke):
                p = c.beginPath()
                p.moveTo(*pts[0])
                for q in pts[1:]:
                    p.lineTo(*q)
                if closed:
                    p.close()
                c.drawPath(p, stroke=int(do_stroke), fill=int(do_fill and closed), fillMode=0 if fill_rule_even else 1)
        elif n.tag == "path":
            do_fill, do_stroke = self.apply(st)
            p = c.beginPath()
            _path(p, n.cmds or [])
            if do_fill or do_stroke:
                c.drawPath(p, stroke=int(do_stroke), fill=int(do_fill), fillMode=0 if fill_rule_even else 1)
        c.restoreState()

    def _transform(self, t: list[tuple]) -> None:
        for op in t:
            if op[0] == "translate":
                self.c.translate(float(op[1]), float(op[2]))
            elif op[0] == "rotate":
                self.c.rotate(float(op[1]))
            elif op[0] == "scale":
                self.c.scale(float(op[1]), float(op[2] if len(op) > 2 else op[1]))

    def image(self, n: Node) -> None:
        a = n.attrs
        c = self.c
        c.saveState()
        if n.transform:
            self._transform(n.transform)
        x, y, w, h = (float(a[k]) for k in ("x", "y", "width", "height"))
        c.translate(x, y + h)
        c.scale(1, -1)
        c.drawImage(ImageReader(io.BytesIO(n.data or b"")), 0, 0, w, h, mask="auto")
        c.restoreState()

    # -------------------------------------------------------------- matn
    def _runs(self, text: str, bold: bool) -> list[tuple[str, str | None]]:
        """Matnni shrift bo'yicha bo'laklarga ajratadi; None — vektor ⚠."""
        main = self.f["bold" if bold else "regular"]
        sym = self.f["symbol"]
        runs: list[tuple[str, str | None]] = []
        for ch in text:
            if _has(main, ch) or ch in " \t":
                fn: str | None = main.name
            elif _has(sym, ch):
                fn = sym.name
            elif ch == "⚠":
                fn = None
            else:
                fn, ch = main.name, "?"
            if runs and runs[-1][1] == fn and fn is not None:
                runs[-1] = (runs[-1][0] + ch, fn)
            else:
                runs.append((ch, fn))
        return runs

    def text(self, n: Node, st: dict[str, Any]) -> None:
        a = n.attrs
        c = self.c
        size = float(st.get("font-size", 12))
        base_w = int(st.get("font-weight", 400) or 400)
        ls = float(st.get("letter-spacing", 0) or 0)
        anchor = st.get("text-anchor", "start")
        # bo'laklar: (matn, shrift, rang)
        pieces: list[tuple[str, str | None, Any]] = []
        for sp in n.spans or []:
            w = sp.weight if sp.weight is not None else base_w
            fill = sp.fill if sp.fill is not None else st.get("fill", "#000000")
            for txt, fn in self._runs(sp.text, w >= 600):
                pieces.append((txt, fn, fill))
        widths = [self._w(t, fn, size, ls) for t, fn, _ in pieces]
        total = sum(widths)
        x = float(a["x"])
        y = float(a["y"])
        if anchor == "middle":
            x -= total / 2
        elif anchor == "end":
            x -= total
        op = float(st.get("opacity", 1.0))
        c.saveState()
        c.translate(x, y)
        c.scale(1, -1)
        if a.get("halo"):
            self._draw_pieces(pieces, widths, size, ls, halo=True, op=op)
        self._draw_pieces(pieces, widths, size, ls, halo=False, op=op)
        c.restoreState()

    def _w(self, t: str, fn: str | None, size: float, ls: float) -> float:
        if fn is None:
            return size * 0.9 * len(t) + ls * len(t)
        return pdfmetrics.stringWidth(t, fn, size) + ls * len(t)

    def _draw_pieces(self, pieces: list, widths: list[float], size: float, ls: float, *, halo: bool, op: float) -> None:
        c = self.c
        cx = 0.0
        for (t, fn, fill), w in zip(pieces, widths):
            col = parse_color(fill)
            if fn is None:
                if not halo and col:
                    self._warn_glyph(cx, size, col, op)
                cx += w
                continue
            if col is None and not halo:
                cx += w
                continue
            # Tr (render mode) grafik holatda qoladi — q/Q bilan o'raladi
            c.saveState()
            to = c.beginText(cx, 0)
            to.setFont(fn, size)
            if ls:
                to.setCharSpace(ls)
            if halo:
                c.setStrokeColorRGB(1, 1, 1)
                c.setStrokeAlpha(op)
                c.setLineWidth(3.4)
                c.setLineJoin(1)
                to.setTextRenderMode(1)
            else:
                c.setFillColorRGB(*(col or (0, 0, 0)))
                c.setFillAlpha(op)
            to.textOut(t)
            c.drawText(to)
            c.restoreState()
            cx += w

    def _warn_glyph(self, x: float, size: float, col: tuple, op: float) -> None:
        """⚠ — shriftda bo'lmasa: uchburchak + undov (y yuqoriga, baseline 0)."""
        c = self.c
        s = size * 0.82
        c.saveState()
        c.setStrokeColorRGB(*col)
        c.setFillColorRGB(*col)
        c.setStrokeAlpha(op)
        c.setLineWidth(size * 0.08)
        c.setLineJoin(1)
        p = c.beginPath()
        p.moveTo(x + size * 0.05, 0)
        p.lineTo(x + size * 0.05 + s, 0)
        p.lineTo(x + size * 0.05 + s / 2, s * 0.9)
        p.close()
        c.drawPath(p, stroke=1, fill=0)
        mx = x + size * 0.05 + s / 2
        c.setLineWidth(size * 0.09)
        c.line(mx, s * 0.28, mx, s * 0.62)
        c.circle(mx, s * 0.14, size * 0.05, stroke=0, fill=1)
        c.restoreState()


# ------------------------------------------------- SVG yoyi -> Bezier
def _path(p: Any, cmds: list[tuple]) -> None:
    cur = (0.0, 0.0)
    start = (0.0, 0.0)
    for cm in cmds:
        op = cm[0]
        if op == "M":
            cur = start = (float(cm[1]), float(cm[2]))
            p.moveTo(*cur)
        elif op == "L":
            cur = (float(cm[1]), float(cm[2]))
            p.lineTo(*cur)
        elif op == "Z":
            p.close()
            cur = start
        elif op == "A":
            rx, ry, rot, large, sweep, x, y = (float(v) for v in cm[1:])
            for seg in _arc_to_bezier(cur, rx, ry, rot, int(large), int(sweep), (x, y)):
                p.curveTo(*seg)
            cur = (x, y)


def _arc_to_bezier(
    p0: tuple[float, float], rx: float, ry: float, phi_deg: float, fa: int, fs: int, p1: tuple[float, float]
) -> list[tuple[float, ...]]:
    """SVG `A` buyrug'ini kubik Bezier bo'laklariga aylantiradi (SVG 1.1 F.6)."""
    x1, y1 = p0
    x2, y2 = p1
    if rx == 0 or ry == 0 or (x1 == x2 and y1 == y2):
        return [(x1, y1, x2, y2, x2, y2)]
    rx, ry = abs(rx), abs(ry)
    phi = math.radians(phi_deg)
    cp, sp = math.cos(phi), math.sin(phi)
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x1p = cp * dx + sp * dy
    y1p = -sp * dx + cp * dy
    lam = (x1p**2) / (rx**2) + (y1p**2) / (ry**2)
    if lam > 1:
        s = math.sqrt(lam)
        rx, ry = rx * s, ry * s
    num_ = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    co = math.sqrt(max(0.0, num_ / den)) if den else 0.0
    if fa == fs:
        co = -co
    cxp = co * rx * y1p / ry
    cyp = -co * ry * x1p / rx
    cx = cp * cxp - sp * cyp + (x1 + x2) / 2
    cy = sp * cxp + cp * cyp + (y1 + y2) / 2

    def ang(ux: float, uy: float, vx: float, vy: float) -> float:
        a = math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        return a

    t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not fs and dt > 0:
        dt -= 2 * math.pi
    elif fs and dt < 0:
        dt += 2 * math.pi
    n = max(1, int(math.ceil(abs(dt) / (math.pi / 2) - 1e-9)))
    step = dt / n
    out = []
    for i in range(n):
        a1 = t1 + i * step
        a2 = a1 + step
        k = 4 / 3 * math.tan((a2 - a1) / 4)
        e1 = (math.cos(a1), math.sin(a1))
        e2 = (math.cos(a2), math.sin(a2))
        q1 = (e1[0] - k * e1[1], e1[1] + k * e1[0])
        q2 = (e2[0] + k * e2[1], e2[1] - k * e2[0])

        def tr(q: tuple[float, float]) -> tuple[float, float]:
            px, py = q[0] * rx, q[1] * ry
            return (cp * px - sp * py + cx, sp * px + cp * py + cy)

        c1, c2, pe = tr(q1), tr(q2), tr(e2)
        out.append((c1[0], c1[1], c2[0], c2[1], pe[0], pe[1]))
    return out


def render_pdf(pages: list[tuple[Node, str]], title: str = "Konveyer lenta chizmasi") -> bytes:
    """`pages` — (daraxt, list nomi); har biri A4 albom sahifa."""
    buf = io.BytesIO()
    pw, ph = landscape(A4)
    c = rl_canvas.Canvas(buf, pagesize=(pw, ph), pageCompression=1)
    c.setTitle(title)
    c.setCreator("Agent lenta")
    painter = _Painter(c)
    k = pw / SHEET_W
    for root, _name in pages:
        c.saveState()
        c.translate(0, ph)
        c.scale(k, -k)
        c.setFillColorRGB(1, 1, 1)
        c.rect(0, 0, SHEET_W, SHEET_H, stroke=0, fill=1)
        painter.node(root, dict(_DEFAULT))
        c.restoreState()
        c.showPage()
    c.save()
    return buf.getvalue()
