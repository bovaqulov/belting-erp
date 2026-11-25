"""Backend-neutral chizish qatlami (`Pen`).

List chizuvchilari (`sheets/*`) faqat shu API orqali chizadi; natija —
kichik SVG-ga o'xshash daraxt (`Node`). Uni ikki backend o'qiydi:
`svg.to_svg` (Mini App / preview) va `pdf.to_pdf` (reportlab, vektor PDF).

Koordinatalar varaq birligida: 1188 × 840 (4 birlik = 1 mm qog'ozda), y pastga.
Atribut nomlari SVG dagidek (`stroke-width`, `fill-opacity`, ...); Python
kwargs'dagi `_` avtomatik `-` ga aylanadi. Guruh atributlari bolalarga
meros o'tadi (SVG qoidasi) — PDF backend ham shunday hisoblaydi.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

Pt = tuple[float, float]


@dataclass
class Span:
    """Matn bo'lagi (`<tspan>`): o'z qalinligi/rangi bo'lishi mumkin."""

    text: str
    weight: int | None = None
    fill: str | None = None


@dataclass
class Node:
    tag: str
    attrs: dict[str, Any] = field(default_factory=dict)
    children: list[Node] = field(default_factory=list)
    # tag-ga xos geometriya
    pts: list[Pt] | None = None  # polygon / polyline
    cmds: list[tuple] | None = None  # path: ("M",x,y) ("L",x,y) ("A",rx,ry,rot,large,sweep,x,y) ("Z",)
    spans: list[Span] | None = None  # text
    data: bytes | None = None  # image (PNG)
    transform: list[tuple] | None = None  # g/image: ("translate",x,y) ("rotate",deg)


def _attrs(kw: dict[str, Any]) -> dict[str, Any]:
    return {k.replace("_", "-"): v for k, v in kw.items() if v is not None}


class Pen:
    """Chizish yozuvchisi. Har bir chaqiruv joriy guruhga element qo'shadi."""

    def __init__(self) -> None:
        self.root = Node("g")
        self._stack: list[Node] = [self.root]

    # ---------------------------------------------------------------- tuzilish
    def _add(self, node: Node) -> Node:
        self._stack[-1].children.append(node)
        return node

    @contextmanager
    def group(self, transform: list[tuple] | None = None, **style: Any) -> Iterator[Node]:
        node = self._add(Node("g", _attrs(style), transform=transform))
        self._stack.append(node)
        try:
            yield node
        finally:
            self._stack.pop()

    # ----------------------------------------------------------------- shakllar
    def line(self, x1: float, y1: float, x2: float, y2: float, **style: Any) -> Node:
        return self._add(Node("line", {"x1": x1, "y1": y1, "x2": x2, "y2": y2, **_attrs(style)}))

    def rect(self, x: float, y: float, w: float, h: float, **style: Any) -> Node:
        return self._add(Node("rect", {"x": x, "y": y, "width": w, "height": h, **_attrs(style)}))

    def polygon(self, pts: list[Pt], **style: Any) -> Node:
        return self._add(Node("polygon", _attrs(style), pts=[(float(x), float(y)) for x, y in pts]))

    def polyline(self, pts: list[Pt], **style: Any) -> Node:
        return self._add(Node("polyline", _attrs(style), pts=[(float(x), float(y)) for x, y in pts]))

    def circle(self, cx: float, cy: float, r: float, **style: Any) -> Node:
        return self._add(Node("circle", {"cx": cx, "cy": cy, "r": r, **_attrs(style)}))

    def ellipse(self, cx: float, cy: float, rx: float, ry: float, **style: Any) -> Node:
        return self._add(Node("ellipse", {"cx": cx, "cy": cy, "rx": rx, "ry": ry, **_attrs(style)}))

    def path(self, cmds: list[tuple], **style: Any) -> Node:
        return self._add(Node("path", _attrs(style), cmds=list(cmds)))

    def text(
        self,
        x: float,
        y: float,
        text: str | list[Span],
        size: float,
        *,
        weight: int = 400,
        anchor: str = "start",
        fill: str | None = None,
        letter_spacing: float | None = None,
        halo: bool = False,
        **style: Any,
    ) -> Node:
        """Matn: `y` — tayanch chiziq (baseline). `halo` — oq kontur (paint-order: stroke)."""
        spans = [Span(text)] if isinstance(text, str) else list(text)
        attrs = {"x": x, "y": y, "font-size": size, **_attrs(style)}
        if weight != 400:
            attrs["font-weight"] = weight
        if anchor != "start":
            attrs["text-anchor"] = anchor
        if fill is not None:
            attrs["fill"] = fill
        if letter_spacing:
            attrs["letter-spacing"] = letter_spacing
        if halo:
            attrs["halo"] = True
        return self._add(Node("text", attrs, spans=spans))

    def image(self, png: bytes, x: float, y: float, w: float, h: float, transform: list[tuple] | None = None) -> Node:
        return self._add(Node("image", {"x": x, "y": y, "width": w, "height": h}, data=png, transform=transform))


def iter_text(node: Node) -> Iterator[str]:
    """Daraxtdagi barcha matnlar (testlar va qidiruv uchun)."""
    if node.spans:
        yield "".join(s.text for s in node.spans)
    for ch in node.children:
        yield from iter_text(ch)
