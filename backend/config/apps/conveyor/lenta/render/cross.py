"""Ko'ndalang kesim listi va `CrossSectionView` — `drawing/crossSheet.tsx` nusxasi (06 §7)."""

from __future__ import annotations

from bisect import bisect_left
from collections.abc import Callable

from ..drawing_model import col_window, cross_len_text
from ..format import f1, uzs
from ..specs import SIDEWALL_SPEC
from .common import CS_ZONES, Box, C
from .details import cleat_section, profile_detail
from .layout import info_lines, zone
from .marks import (
    dim_chain,
    dim_chain_height,
    dim_chain_plan,
    dim_x,
    dim_y,
    ext_lines,
    guide_trapezoid,
    note_box,
)
from .pen import Pen
from .spec import cross_note_line

MIN_GAP_U = 34
GUIDE_U = 30


def cross_section_sheet(p: Pen, m: dict, n: int) -> None:
    b = m["belt"]
    bw = b["width"]
    g = m.get("guide")
    gs = g["spec"] if g else None
    g_bot = g["bottom"] if g else None
    g_top = g["top"] if g else None
    cr = m.get("cross")
    cs = cr["spec"] if cr else None
    th_mm = b["thickness"] if b["thickness"] is not None else 2
    Z = CS_ZONES

    if cr:
        if cr["parts"] > 1 or cr["manual"]:
            cross_line = f"Ko'ndalang: {cross_len_text(cr, lambda v: uzs(v))} mm"
        else:
            cross_line = f"Ko'ndalang: uz. {uzs(cr['drawLength'])} mm"
    else:
        cross_line = "Ko'ndalang: yo'q"
    gofro = m.get("gofro")
    zone(p, Z["info"], f"{n}. Ko'ndalang kesim")
    info_lines(
        p,
        Z["info"].x + 14,
        Z["info"].y + 54,
        [
            f"Lenta: {b['name']}",
            f"Eni: {uzs(bw)} mm",
            f"Qalinligi: {f1(th_mm)} mm"
            if b["thickness"] is not None
            else f"⚠ Qalinligi ko'rsatilmagan (chizmada {f1(th_mm)} mm)",
            "Yo'naltiruvchi: yo'q" if not g else None,
            f"Yo'naltiruvchi ostidan: {uzs(g_bot['count'])} dona" if g_bot else None,
            f"Yo'naltiruvchi ustidan: {uzs(g_top['count'])} dona" if g_top else None,
            cross_line,
            f"Bo'laklar tirqishi: {uzs(cr['gap'])} mm" if cr and cr["parts"] > 1 and not cr["manual"] else None,
            f"Gofrobort: H {uzs(gofro['height'])} mm · {len(gofro['sides'])} tomon" if gofro else "Gofrobort: yo'q",
        ],
    )

    # profil panellari — faqat profil bo'lsa (ikkalasi ham yo'q bo'lsa bo'sh "yo'q" panellar chizilmaydi)
    if gs or cs:
        zone(p, Z["guide"])
        if gs:
            profile_detail(
                p,
                Z["guide"].x + 40,
                Z["guide"].y + 44,
                g["name"],
                gs,
                heading="Yo'naltiruvchi profil kesimi",
                k=guide_detail_k(gs, 110),
            )
        else:
            p.text(Z["guide"].x + 14, Z["guide"].y + 26, "Yo'naltiruvchi profil yo'q", 15, weight=600, fill=C.thin)

        zone(p, Z["cleat"])
        if cs:
            cleat_section(p, Z["cleat"].x + 40, Z["cleat"].y + 30, cr["name"], cs, box_h=100)
        else:
            p.text(Z["cleat"].x + 14, Z["cleat"].y + 26, "Ko'ndalang profil yo'q", 15, weight=600, fill=C.thin)

    zone(p, Z["main"])
    cross_section_view(p, m, Z["main"])


def guide_detail_k(gs: dict, size: float) -> float:
    """Profil detalini o'qiladigan qilib kattalashtirish koeffitsienti (B/H ~ `size` birlik)."""
    return max(4.0, min(18.0, size / max(gs["B"], gs["H"], 1)))


def _chain_for(row: dict | None, bw: float, x_at: Callable[[float], float]) -> dict | None:
    if not row or len(row["xs"]) == 0:
        return None
    stops: list[float] = []
    for u in [0, *row["xs"], bw]:
        if not stops or u - stops[-1] > 0.5:
            stops.append(u)
    if len(stops) < 2:
        return None
    labels = [f1(u - stops[i]) for i, u in enumerate(stops[1:])]
    xs = [x_at(u) for u in stops]
    return {"xs": xs, "labels": labels, "rows": dim_chain_plan(xs, labels)[1]}


def cross_section_view(p: Pen, m: dict, box: Box, max_w: float = 920, note: bool = True) -> dict:
    """Kesimni chizadi; qaytaradi: {"guide": (x, y) | None} — "A" detal belgisi uchun."""
    bw = m["belt"]["width"]
    g = m.get("guide")
    gs = g["spec"] if g else None
    g_bot = g["bottom"] if g else None
    g_top = g["top"] if g else None
    cr = m.get("cross")
    cs = cr["spec"] if cr else None
    gofro = m.get("gofro")
    band = SIDEWALL_SPEC["width"]
    plan_w, px, x_at = cross_h_geo(m, box, max_w)

    def edge_dims_for(row: dict | None) -> list[dict]:
        if not row or len(row["xs"]) == 0 or not gs:
            return []
        half = gs["B"] / 2
        out = []
        a = row["xs"][0] - half
        bb = row["xs"][-1] + half
        if a > 0.5:
            out.append({"x1": px, "x2": x_at(a), "mm": a, "left": True})
        if bw - bb > 0.5:
            out.append({"x1": x_at(bb), "x2": px + plan_w, "mm": bw - bb, "left": False})
        return out

    bot_edge = edge_dims_for(g_bot)
    top_edge = edge_dims_for(g_top)
    EDGE_ROW = 52
    bot_chain = _chain_for(g_bot, bw, x_at)
    top_chain = _chain_for(g_top, bw, x_at)

    def chain_room(c: dict | None) -> float:
        return dim_chain_height(c["rows"]) + 16 if c else 0

    obj_stops: list[dict] = [{"u": 0, "h": 0}]
    bands = gofro["bands"] if gofro else []
    band_l = next((bd for bd in bands if bd["side"] == "left"), None)
    band_r = next((bd for bd in bands if bd["side"] == "right"), None)
    wall_h = gofro["height"] if gofro else 0
    if band_l:
        obj_stops += [{"u": band_l["from"], "h": wall_h}, {"u": band_l["from"] + band, "h": wall_h}]
    for sp in cr["spans"] if cr else []:
        for u in sp:
            obj_stops.append({"u": u, "h": cs["H"] if cs else 0})
    if band_r:
        obj_stops += [{"u": band_r["to"] - band, "h": wall_h}, {"u": band_r["to"], "h": wall_h}]
    obj_stops.append({"u": bw, "h": 0})

    obj_chain = None
    st: list[dict] = []
    for q in sorted(obj_stops, key=lambda d: d["u"]):
        if not st or q["u"] - st[-1]["u"] > 0.5:
            st.append(dict(q))
        else:
            st[-1]["h"] = max(st[-1]["h"], q["h"])
    if len(st) > 2:
        xs = [x_at(q["u"]) for q in st]
        labels = [f1(q["u"] - st[i]["u"]) for i, q in enumerate(st[1:])]
        obj_chain = {"st": st, "xs": xs, "labels": labels, "rows": dim_chain_plan(xs, labels)[1]}

    TOP_ROOM = (
        48
        + (chain_room(top_chain) if top_chain else 0)
        + (EDGE_ROW if top_edge else 0)
        + (dim_chain_height(obj_chain["rows"]) - 15 if obj_chain else 0)
    )
    perf_l = (m.get("perf") or {}).get("layout") if m.get("perf") else None
    hole_us: list[float] = []
    if perf_l:
        for gg in perf_l.get("groups") or [0]:
            for c in col_window(gg, perf_l["edge"], int(perf_l["cols"]), perf_l["pitch"], 0, bw):
                u = gg + perf_l["edge"] + c * perf_l["pitch"]
                if 0 < u < bw:
                    hole_us.append(u)
    hole_chain = None
    if perf_l and not bot_chain and 0 < len(hole_us) <= 24:
        sts = [0, *hole_us, bw]
        xs = [x_at(u) for u in sts]
        labels = [f1(u - sts[i]) for i, u in enumerate(sts[1:])]
        hole_chain = {"xs": xs, "labels": labels, "rows": dim_chain_plan(xs, labels)[1]}
    BOT_ROOM = (
        34
        + max(20, chain_room(bot_chain) + 10)
        + (EDGE_ROW if bot_edge else 0)
        + (dim_chain_height(hole_chain["rows"]) + 26 if hole_chain else 0)
    )

    gofro_h = gofro["height"] if gofro else 0
    tall_mm = max(gofro_h, cs["H"] if cs else 0)
    avail_h = box.h - TOP_ROOM - BOT_ROOM
    gk0 = GUIDE_U / max(gs["B"], 1) if gs else 0
    BELT_U = 11
    UP_U = max(60.0, min(170.0, (avail_h - BELT_U) * 0.62))
    up_u0 = max(UP_U if tall_mm > 0 else 0, gs["H"] * gk0 if g_top and gs else 0, 16)
    down_u0 = gs["H"] * gk0 if g_bot and gs else 0
    fit = max(0.3, min(1, (avail_h - down_u0 - BELT_U) / up_u0))
    vk = (UP_U * fit) / tall_mm if tall_mm > 0 else 0
    gk = gk0
    up_u = max(UP_U * fit if tall_mm > 0 else 0, gs["H"] * gk if g_top and gs else 0, 16)
    down_u = down_u0

    belt_th = BELT_U
    section_h = up_u + down_u + belt_th
    block_h = TOP_ROOM + section_h + BOT_ROOM
    section_top = box.y + max(0, (box.h - block_h) / 2) + TOP_ROOM
    y_belt = section_top + up_u

    y_bot_chain = y_belt + belt_th + down_u + 30
    y_top_chain = section_top - 12
    y_top_edge = y_top_chain - chain_room(top_chain) - 4 if top_chain else section_top - 10
    y_cross_dim = (
        (y_top_chain - chain_room(top_chain) - (EDGE_ROW if top_edge else 0)) if top_chain else section_top - 10
    )
    y_bot_edge = y_bot_chain + dim_chain_height(bot_chain["rows"]) + 34 if bot_chain else y_bot_chain
    y_width_dim = y_cross_dim - (dim_chain_height(obj_chain["rows"]) + 7 if obj_chain else 22)

    # gofrobort
    if gofro:
        for bd in gofro["bands"]:
            u0 = bd["from"] if bd["side"] == "left" else bd["to"] - band
            p.rect(
                x_at(u0),
                y_belt - gofro["height"] * vk,
                max(4, x_at(u0 + band) - x_at(u0)),
                gofro["height"] * vk,
                fill=C.wall,
                stroke=C.wallEdge,
                stroke_width=1.4,
            )
    # lenta
    p.rect(x_at(0), y_belt, x_at(bw) - x_at(0), belt_th, fill=C.belt, stroke=C.beltEdge, stroke_width=1.4)
    # ko'ndalang profil bo'laklari
    if cr and cs:
        for u0, u1 in cr["spans"]:
            a, bb = x_at(u0), x_at(u1)
            p.rect(
                a,
                y_belt - cs["H"] * vk,
                max(6, bb - a),
                cs["H"] * vk,
                fill=C.cleat,
                stroke=C.cleatEdge,
                stroke_width=1.4,
            )
    # yo'naltiruvchilar
    if gs:
        for row in (r for r in (g_bot, g_top) if r):
            for cx in row["xs"]:
                guide_trapezoid(
                    p,
                    x_at(cx),
                    y_belt if row["place"] == "top" else y_belt + belt_th,
                    gs["B"] * gk,
                    gs["S"] * gk,
                    gs["H"] * gk,
                    row["place"] == "top",
                    px,
                    px + plan_w,
                )
    # teshiklar
    if perf_l and not cr:
        for u in hole_us:
            a, bb = x_at(u - perf_l["dia"] / 2), x_at(u + perf_l["dia"] / 2)
            p.rect(a, y_belt - 0.5, max(1.5, bb - a), belt_th + 1, fill=C.paper, stroke=C.line, stroke_width=0.6)
    if hole_chain:
        ext_lines(p, [(x, y_belt + belt_th + 3, y_belt + belt_th + 28) for x in hole_chain["xs"]])
        dim_chain(p, hole_chain["xs"], hole_chain["labels"], y_belt + belt_th + 24)

    dim_x(p, px, px + plan_w, y_width_dim, uzs(bw), at=0.28)

    if obj_chain:
        ext_lines(
            p, [(obj_chain["xs"][k], y_belt - q["h"] * vk - 3, y_cross_dim + 6) for k, q in enumerate(obj_chain["st"])]
        )
        dim_chain(p, obj_chain["xs"], obj_chain["labels"], y_cross_dim, up=True)
    ext_lines(p, [(px, y_belt - 3, y_width_dim - 6), (px + plan_w, y_belt - 3, y_width_dim - 6)])

    g_h = gs["H"] if gs else 0
    if bot_chain:
        last = len(bot_chain["xs"]) - 1
        ext_lines(
            p,
            [
                (
                    x,
                    y_belt + belt_th + 3 if k in (0, last) else y_belt + belt_th + max(18, g_h * gk) + 3,
                    y_bot_chain - 6,
                )
                for k, x in enumerate(bot_chain["xs"])
            ],
        )
        dim_chain(p, bot_chain["xs"], bot_chain["labels"], y_bot_chain)
        if bot_edge:
            ext_lines(p, [(x, y_belt + belt_th + 3, y_bot_edge + 5) for d in bot_edge for x in (d["x1"], d["x2"])])
            for d in bot_edge:
                dim_x(p, d["x1"], d["x2"], y_bot_edge, f1(d["mm"]), up=False)
            p.text(px - 8, y_bot_edge + 4, "chetigacha", 10.5, fill=C.thin, anchor="end")
        p.text(px - 8, y_bot_chain + 4, "o'qigacha", 10.5, fill=C.thin, anchor="end")
    if top_chain:
        last = len(top_chain["xs"]) - 1
        ext_lines(
            p,
            [
                (x, y_belt - 3 if k in (0, last) else y_belt - max(18, g_h * gk) - 3, y_top_chain + 6)
                for k, x in enumerate(top_chain["xs"])
            ],
        )
        dim_chain(p, top_chain["xs"], top_chain["labels"], y_top_chain, up=True)
        if top_edge:
            ext_lines(p, [(x, y_belt - 3, y_top_edge - 5) for d in top_edge for x in (d["x1"], d["x2"])])
            for d in top_edge:
                dim_x(p, d["x1"], d["x2"], y_top_edge, f1(d["mm"]), up=True)
            p.text(px - 8, y_top_edge + 4, "chetigacha", 10.5, fill=C.thin, anchor="end")
        p.text(px - 8, y_top_chain + 4, "o'qigacha", 10.5, fill=C.thin, anchor="end")

    if gofro:
        dim_y(p, y_belt - gofro["height"] * vk, y_belt, px - 22, f"H {uzs(gofro['height'])}")
    if cs and not gofro:
        dim_y(p, y_belt - cs["H"] * vk, y_belt, px - 22, f"H {f1(cs['H'])}")
    # ko'ndalang profil yozuvi — profil ustida (lenta ichida)
    note = cross_note_line(m) if note else None  # bir varaqli chizmada — "Texnik talablar"da
    if note and cr and cs and cr["spans"]:
        a0, b0 = max(cr["spans"], key=lambda sp: sp[1] - sp[0])
        xa, xb = x_at(a0), x_at(b0)
        hh = cs["H"] * vk
        if xb - xa > 120 and hh > 20:
            note_box(p, (xa + xb) / 2, y_belt - hh / 2, [note], min(xb - xa - 12, 640), fs=12.5, max_h=hh - 6)
    if tall_mm > 0 or gs:
        p.text(px, box.y + box.h - 8, "Kesim shartli: balandliklar kattalashtirilgan (masshtabsiz)", 11, fill=C.thin)
    anchor = None
    if gs:
        row = g_bot or g_top
        if row and row["xs"]:
            cx = x_at(row["xs"][0])
            anchor = (
                cx,
                y_belt + belt_th + gs["H"] * gk / 2 if row["place"] == "bottom" else y_belt - gs["H"] * gk / 2,
            )
    return {"guide": anchor}


def cross_h_geo(m: dict, box: Box, max_w: float = 920) -> tuple[float, float, Callable[[float], float]]:
    """Kesimning gorizontal MASSHTABSIZ shabloni: (planW, px, xAt)."""
    plan_w = min(box.w - 140, max_w)
    px = box.x + (box.w - plan_w) * (85 / 140)
    bw = max(m["belt"]["width"], 1)
    gofro = m.get("gofro")
    cr = m.get("cross")
    g = m.get("guide")

    raw: list[float] = [0, bw]
    band = SIDEWALL_SPEC["width"]
    bands = gofro["bands"] if gofro else []
    for bd in bands:
        u0 = bd["from"] if bd["side"] == "left" else bd["to"] - band
        raw += [u0, u0 + band]
    for a, bb in cr["spans"] if cr else []:
        raw += [a, bb]

    def under_wall(c: float) -> bool:
        for bd in bands:
            lo = bd["from"] if bd["side"] == "left" else bd["to"] - band
            hi = bd["from"] + band if bd["side"] == "left" else bd["to"]
            if lo < c < hi:
                return True
        return False

    g_b = (g["spec"]["B"] if g and g.get("spec") else 0) or 0
    bodies: list[tuple[float, float]] = []
    for row in (g["bottom"], g["top"]) if g else ():
        for c in row["xs"] if row else []:
            if not under_wall(c) and g_b > 0:
                raw += [c - g_b / 2, c + g_b / 2]
                bodies.append((max(0, c - g_b / 2), min(bw, c + g_b / 2)))
    stops: list[float] = []
    for u in sorted(min(bw, max(0, u)) for u in raw):
        if not stops or u - stops[-1] > 0.5:
            stops.append(u)
    if stops[-1] < bw:
        stops.append(bw)

    n = len(stops) - 1
    # oraliq yo'naltiruvchi TANASImi (asl: bodies.some(...)) — bisect bilan O(n log n)
    bodies.sort()
    body_a = [a for a, _ in bodies]

    def is_body(i: int) -> bool:
        j = bisect_left(body_a, stops[i] - 0.5)
        while j < len(bodies) and bodies[j][0] <= stops[i] + 0.5:
            if abs(stops[i + 1] - bodies[j][1]) <= 0.5:
                return True
            j += 1
        return False

    body = [is_body(i) for i in range(n)]
    n_body = sum(1 for v in body if v)
    n_free = n - n_body
    body_u = min(GUIDE_U, (plan_w * 0.3) / max(1, n_body))
    min_u = min(MIN_GAP_U, (plan_w * 0.6 - body_u * n_body) / max(1, n_free))
    k_local = body_u / g_b if n_body > 0 and g_b > 0 else min_u / 10

    def gap_of(i: int) -> float:
        return stops[i + 1] - stops[i]

    def small(i: int) -> bool:
        return not body[i] and gap_of(i) * k_local < min_u

    used_u = 0.0
    big_mm = 0.0
    n_big = 0
    for i in range(n):
        if body[i]:
            used_u += body_u
        elif small(i):
            used_u += gap_of(i) * k_local
        else:
            n_big += 1
            big_mm += gap_of(i)
    rest = max(0, plan_w - used_u - min_u * n_big)
    xs = [px]
    for i in range(n):
        xs.append(
            xs[i]
            + (body_u if body[i] else gap_of(i) * k_local if small(i) else min_u + (rest * gap_of(i)) / (big_mm or 1))
        )
    total = xs[n] - px
    if total > 0 and abs(total - plan_w) > 0.5:
        for i in range(1, n + 1):
            xs[i] = px + ((xs[i] - px) * plan_w) / total

    def x_at(u: float) -> float:
        if u <= 0:
            return px
        if u >= bw:
            return px + plan_w
        i = min(n - 1, bisect_left(stops, u, 1) - 1)
        a = stops[i]
        bb = stops[i + 1]
        return xs[i] + ((u - a) / max(bb - a, 1e-6)) * (xs[i + 1] - xs[i])

    return plan_w, px, x_at
