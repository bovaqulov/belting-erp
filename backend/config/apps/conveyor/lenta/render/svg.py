"""SVG backend: `Node` daraxtini mustaqil SVG matniga aylantiradi."""

from __future__ import annotations

import base64
import math
import re
from typing import Any
from xml.sax.saxutils import escape, quoteattr

from .pen import Node

FONT_FAMILY = "Helvetica, Arial, sans-serif"
# XML 1.0 da taqiqlangan belgilar (boshqaruv belgilari, surrogatlar): matnda (mijoz nomi ...) kelsa SVG buziladi
_XML_BAD = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]")


def _esc(text: str) -> str:
    return escape(_XML_BAD.sub("", text))


def num(v: Any) -> str:
    """Ixcham son: 3 kasrgacha, oxiridagi nollarsiz."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        if not math.isfinite(v):
            return "0"
        r = round(float(v), 3)
        if r == 0:
            return "0"
        if r == int(r):
            return str(int(r))
        return f"{r:.3f}".rstrip("0").rstrip(".")
    return str(v)


def _transform(t: list[tuple] | None) -> str:
    if not t:
        return ""
    out = []
    for op in t:
        if op[0] == "translate":
            out.append(f"translate({num(op[1])} {num(op[2])})")
        elif op[0] == "rotate":
            out.append(f"rotate({num(op[1])})")
        elif op[0] == "scale":
            out.append(f"scale({num(op[1])} {num(op[2] if len(op) > 2 else op[1])})")
    return " ".join(out)


def _path_d(cmds: list[tuple]) -> str:
    parts = []
    for c in cmds:
        parts.append(" ".join([c[0], *(num(v) for v in c[1:])]))
    return " ".join(parts)


def _attr_str(attrs: dict[str, Any]) -> str:
    out = []
    for k, v in attrs.items():
        if k == "halo":
            continue
        out.append(f" {k}={quoteattr(num(v))}")
    return "".join(out)


def _node(n: Node, out: list[str]) -> None:
    a = dict(n.attrs)
    if n.tag == "text" and a.pop("halo", False):
        a.update({"paint-order": "stroke", "stroke": "#ffffff", "stroke-width": 3.4, "stroke-linejoin": "round"})
    tr = _transform(n.transform)
    extra = f' transform="{tr}"' if tr else ""
    if n.tag in ("polygon", "polyline"):
        pts = " ".join(f"{num(x)},{num(y)}" for x, y in (n.pts or []))
        out.append(f'<{n.tag} points="{pts}"{_attr_str(a)}/>')
    elif n.tag == "path":
        out.append(f'<path d="{_path_d(n.cmds or [])}"{_attr_str(a)}/>')
    elif n.tag == "text":
        spans = n.spans or []
        if len(spans) == 1 and spans[0].weight is None and spans[0].fill is None:
            body = _esc(spans[0].text)
        else:
            body = ""
            for s in spans:
                sa = {}
                if s.weight is not None:
                    sa["font-weight"] = s.weight
                if s.fill is not None:
                    sa["fill"] = s.fill
                body += f"<tspan{_attr_str(sa)}>{_esc(s.text)}</tspan>" if sa else _esc(s.text)
        out.append(f"<text{_attr_str(a)}{extra}>{body}</text>")
    elif n.tag == "image":
        href = "data:image/png;base64," + base64.b64encode(n.data or b"").decode()
        out.append(f'<image href="{href}"{_attr_str(a)} preserveAspectRatio="xMidYMid meet"{extra}/>')
    elif n.tag == "g":
        if not n.children:
            return
        if not a and not extra:
            for ch in n.children:
                _node(ch, out)
            return
        out.append(f"<g{_attr_str(a)}{extra}>")
        for ch in n.children:
            _node(ch, out)
        out.append("</g>")
    else:
        out.append(f"<{n.tag}{_attr_str(a)}{extra}/>")


def render_svg(root: Node, title: str, width: float = 1188, height: float = 840) -> str:
    out: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {num(width)} {num(height)}" '
        f'font-family="{FONT_FAMILY}" '
        f'style="background:#ffffff" shape-rendering="geometricPrecision" role="img" '
        f"aria-label={quoteattr('Konveyer lenta chizmasi — ' + title)}>",
        f'<rect x="0" y="0" width="{num(width)}" height="{num(height)}" fill="#ffffff"/>',
    ]
    _node(root, out)
    out.append("</svg>")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + "".join(out)
