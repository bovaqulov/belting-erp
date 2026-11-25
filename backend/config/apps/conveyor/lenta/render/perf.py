"""Perforatsiya listi va oddiy sxema — `perfSheet.tsx`, `perfSimple.tsx` nusxasi (06 §10)."""

from __future__ import annotations

from ..drawing_model import col_window
from ..format import f1, uzs
from .common import SIDE_ZONES, Box, C, break_v, is_ru, vchain
from .layout import info_lines, wrap_line, zone
from .marks import break_line_h, dim_chain, dim_x, dim_y, hole_mark, lock_band, note_box
from .pen import Pen
from .spec import cols_text, join_note, perf_note_lines

M = {"left": 140, "right": 150, "top": 92, "bottom": 74}
GAP = 46
NOTE_H = 66  # izoh qutisi lentadan TASHQARIDA (pastda) — teshiklarni yopmasin


def _fill_head(m: dict, L: dict, box: Box) -> int:
    """Joy bo'yicha nechta boshlang'ich qator sig'adi (eniga mos masshtabda) — varaq bo'sh qolmasin."""
    rows_n = int(L["rows"])
    base = min(rows_n, 3 if L["stagger"] else 2)
    w = box.w - M["left"] - M["right"]
    h = box.h - M["top"] - M["bottom"] - GAP - NOTE_H
    k = min(w / max(1, m["belt"]["width"]), 6)
    if k <= 0 or L["pitchL"] <= 0:
        return base
    tail = m["belt"]["length"] - (L["start"] + (rows_n - 1) * L["pitchL"]) + L["pitchL"] / 2
    fit = int((h / k - L["start"] - tail) / L["pitchL"])
    head = max(base, min(rows_n, fit, 40))
    if L["stagger"] and head < rows_n and head % 2 == 0:
        head -= 1  # shaxmat: juft-toq navbat ko'rinsin
    return max(base, head)


def _plan(m: dict, L: dict, head: int | None = None) -> dict:
    ln = m["belt"]["length"]
    rows_n = int(L["rows"])
    head = min(rows_n, head or (3 if L["stagger"] else 2))
    broken = rows_n > head + 1
    rows = [*range(head), rows_n - 1] if broken else list(range(rows_n))

    def z_of(r: float) -> float:
        return L["start"] + r * L["pitchL"]

    z_head = z_of(head - 1) + L["pitchL"] / 2 if broken else ln
    z_tail = z_of(rows_n - 1) - L["pitchL"] / 2 if broken else ln
    shown = z_head + (ln - z_tail) if broken else ln
    return {"len": ln, "rows": rows, "z_of": z_of, "z_head": z_head, "z_tail": z_tail, "shown": shown, "broken": broken}


def perf_simple_scale(m: dict, L: dict, box: Box, fill: bool = False) -> float:
    pl = _plan(m, L, _fill_head(m, L, box) if fill else None)
    w = box.w - M["left"] - M["right"]
    h = box.h - M["top"] - M["bottom"] - (GAP if pl["broken"] else 0) - (NOTE_H if fill else 0)
    return max(0.01, min(w / max(1, m["belt"]["width"]), h / max(1, pl["shown"]), 6))


def perf_width_chain(L: dict, bw: float) -> tuple[list[float], list[str]]:
    groups = L.get("groups") or [0]
    # faqat lentaga tushishi mumkin bo'lgan ustunlar (natija bir xil; guruh × ustun to'liq aylanmaydi)
    pts = [
        {"u": g + L["edge"] + c * L["pitch"], "gi": gi}
        for gi, g in enumerate(groups)
        for c in col_window(g, L["edge"], int(L["cols"]), L["pitch"], 0, bw)
    ]
    pts += [{"u": u, "gi": -1} for u in (L.get("lines") or [])]
    pts = sorted((h for h in pts if 0 <= h["u"] <= bw), key=lambda h: h["u"])
    pts = [h for i, h in enumerate(pts) if i == 0 or h["u"] - pts[i - 1]["u"] > 0.05]
    stops: list[float] = [0]
    labels: list[str] = []
    i = 0
    while i < len(pts):
        h = pts[i]
        labels.append(f1(h["u"] - stops[-1]))
        stops.append(h["u"])
        j = i
        while j + 1 < len(pts) and h["gi"] >= 0 and pts[j + 1]["gi"] == h["gi"]:
            j += 1
        if j > i:
            n = j - i
            labels.append(f"{uzs(n)} × {f1(L['pitch'])}" if n > 1 else f1(pts[j]["u"] - h["u"]))
            stops.append(pts[j]["u"])
        i = j + 1
    labels.append(f1(bw - stops[-1]))
    stops.append(bw)
    return stops, labels


def perf_simple_view(
    p: Pen, m: dict, L: dict, box: Box, show_join: bool = False, callout: str | None = None, fill: bool = False
) -> None:
    """fill=True — varaqni to'ldiradi (ko'proq qator), izoh lentadan tashqarida (pastda)."""
    bw = m["belt"]["width"]
    pl = _plan(m, L, _fill_head(m, L, box) if fill else None)
    k = perf_simple_scale(m, L, box, fill)
    Wd = bw * k
    px = box.x + M["left"] + (box.w - M["left"] - M["right"] - Wd) / 2
    py = box.y + M["top"]

    def X(u: float) -> float:
        return px + u * k

    def Y(z: float) -> float:
        return py + z * k if z <= pl["z_head"] + 1e-6 else py + pl["z_head"] * k + GAP + (z - pl["z_tail"]) * k

    z_of = pl["z_of"]
    y_end = Y(pl["len"])
    groups = L.get("groups") or [0]
    holes: list[tuple[float, float]] = []
    for r in pl["rows"]:
        odd = L["stagger"] and r % 2 == 1
        n = max(1, L["cols"] - 1) if odd else L["cols"]
        u0 = L["edgeOffset"] if odd else L["edge"]
        for g in groups:
            for c in range(int(n)):
                u = g + u0 + c * L["pitch"]
                if u - L["dia"] / 2 >= 0 and u + L["dia"] / 2 <= bw:
                    holes.append((u, z_of(r)))
        for u in L.get("lines") or []:
            holes.append((u, z_of(r)))
    hr = (L["dia"] / 2) * k
    stops, labels = perf_width_chain(L, bw)
    last = z_of(L["rows"] - 1)
    notes = perf_note_lines(m)

    y_cut1 = Y(pl["z_head"])
    y_cut2 = Y(pl["z_tail"]) if pl["broken"] else y_end
    with p.group():
        with p.group(fill=C.belt, fill_opacity=0.08, stroke="none"):
            p.rect(px, py, Wd, y_cut1 - py)
            if pl["broken"]:
                p.rect(px, y_cut2, Wd, y_end - y_cut2)
        with p.group(fill="none", stroke=C.line, stroke_width=1.3):
            if pl["broken"]:
                p.polyline([(px, y_cut1), (px, py), (px + Wd, py), (px + Wd, y_cut1)])
                p.polyline([(px, y_cut2), (px, y_end), (px + Wd, y_end), (px + Wd, y_cut2)])
            else:
                p.rect(px, py, Wd, y_end - py)
        if pl["broken"]:
            break_line_h(p, y_cut1, px, px + Wd)
            break_line_h(p, y_cut2, px, px + Wd)
            hidden = int(L["rows"]) - len(pl["rows"])
            txt = (
                f"разрыв · {uzs(hidden)} рядов не показаны (всего {uzs(L['rows'])})"
                if is_ru(m)
                else f"uzilgan · {uzs(hidden)} qator ko'rsatilmagan (jami {uzs(L['rows'])} qator)"
            )
            p.text(px + Wd / 2, (y_cut1 + y_cut2) / 2 + 4, txt, 11.5, fill=C.thin, anchor="middle")
        z0 = z_of(0)
        for u, z in holes:
            hole_mark(p, X(u), Y(z), hr, axes=z == z0 or len(holes) <= 40)
        jn = m.get("_join") if show_join else None
        if jn and jn["kind"] in ("lock", "install", "weld"):
            kind = "weld" if jn["kind"] == "weld" else "lock"
            depth = min(14.0, max(7.0, (m["belt"]["joint"] or 0) * k))
            lock_band(p, px, px + Wd, py, depth, kind, down=True)
            lock_band(p, px, px + Wd, y_end, depth, kind, down=False)
            txt = join_note(m)
            if txt:
                lx = px + Wd - min(60, Wd * 0.15)
                with p.group(stroke=C.thin, stroke_width=0.8, fill="none"):
                    p.line(lx, y_end - depth / 2, lx + 10, y_end + 14)
                    p.line(lx + 10, y_end + 14, px + Wd + 4, y_end + 14)
                p.text(px + Wd + 4, y_end + 28, txt, 12, weight=600, fill=C.line, anchor="end")
        dim_x(p, px, px + Wd, py - 58, uzs(bw))
        dim_chain(p, [X(s) for s in stops], labels, py - 24, up=True)
        edge_caption(p, px - 8, py - 24, is_ru(m), above=bool(callout))  # "B" belgisi bilan ustma-ust tushmasin
        dim_y(p, py, Y(z_of(0)), px - 22, f1(z_of(0)))
        if L["rows"] > 1:
            dim_y(p, Y(z_of(0)), Y(z_of(1)), px - 22, f1(L["pitchL"]))
        if pl["broken"]:
            dim_y(p, Y(last), y_end, px - 22, f1(pl["len"] - last))
        if holes:
            first_row = [h for h in holes if h[1] == z_of(0)]
            h = holes[0]
            for q in first_row:
                if q[0] > h[0]:
                    h = q
            rr = max(hr, 4)
            x1 = X(h[0]) + rr * 0.7
            y1 = Y(h[1]) - rr * 0.7
            with p.group():
                p.line(x1, y1, px + Wd + 14, py - 4, stroke=C.dim, stroke_width=0.9)
                p.text(px + Wd + 18, py, f"Ø{f1(L['dia'])}", 13, weight=600, fill=C.dim)
        dim_y(p, py, y_end, px + Wd + 110, uzs(pl["len"]))

        if fill:
            # izoh — lentadan tashqarida, pastda (teshiklarni yopmaydi)
            note_box(p, px + Wd / 2, y_end + 44 + NOTE_H / 2 - 10, notes, min(max(Wd, 420), 640), max_h=NOTE_H - 6)
        else:
            # lenta ichidagi yozuv: birinchi va ikkinchi qator orasida (yoki boshida)
            rows_y = sorted({Y(z) for _, z in holes if Y(z) < y_cut1})
            ya, yb = py + 6, y_cut1 - 14
            cand = [(b - a, (a + b) / 2) for a, b in zip([ya, *rows_y], [*rows_y, yb]) if b > a]
            if cand:
                gap, cy = max(cand)
                note_box(p, px + Wd / 2, cy, notes, min(Wd - 16, 600), max_h=gap - 16)
        if callout and holes:
            u1, zf = holes[0]
            callout_circle(p, X(u1), Y(zf), callout)


def perf_sheet(p: Pen, m: dict, n: int, L: dict, count: float) -> None:
    Z = SIDE_ZONES
    groups = L.get("groups") or []
    last_g = groups[-1] if groups else 0
    edge_r = m["belt"]["width"] - (last_g + L["edge"] + (L["cols"] - 1) * L["pitch"])
    same = L["pitchL"] == L["pitch"]
    zone(p, Z["info"], f"{n}. Perforatsiya")
    y_end = info_lines(
        p,
        Z["info"].x + 14,
        Z["info"].y + 54,
        [
            f"Teshik: Ø{uzs(L['dia'])} mm",
            f"Soni: {uzs(count)} dona",
            "Joylashuvi: " + ("shaxmat tartibida" if L["stagger"] else "to'g'ri qator"),
            None,
            f"Qadam: {f1(L['pitch'])} mm" if same else f"Ustunlar orasi (enida): {f1(L['pitch'])} mm",
            None if same else f"Qatorlar orasi (bo'yida): {f1(L['pitchL'])} mm",
            f"Siljish: {f1(L['pitch'] / 2)} mm" if L["stagger"] else None,
            f"Enida: {cols_text(L, is_ru(m))}",
            f"Qatorlar: {uzs(L['rows'])} ta",
            None,
            f"Chetdan (chap): {f1(L['edge'] + (groups[0] if groups else 0))} mm",
            f"Chetdan (o'ng): {f1(edge_r)} mm",
            "  — ikkala chetdan teng" if abs(L["edge"] + (groups[0] if groups else 0) - edge_r) < 0.05 else None,
            f"Boshidan: {f1(L['start'])} mm",
            f"Oxiridan: {f1(m['belt']['length'] - L['start'] - (L['rows'] - 1) * L['pitchL'])} mm",
            "Chet qo'lda berilgan" if L.get("manualEdge") else "Chet avtomatik hisoblangan",
            None,
            f"Gofrobort tomoni: {len(L['blocked'])} ta" if L.get("blocked") else None,
            "O'lchamlar haqiqiy, mm",
            "Teshiklar to'liq ko'rsatilgan" if L["rows"] <= 5 else "Qatorlarning bir qismi ko'rsatilgan — takrorlanadi",
        ],
    )
    det = Box(Z["info"].x + 10, y_end + 26, Z["info"].w - 20, Z["info"].y + Z["info"].h - y_end - 34)
    ok = det.h >= 190 and perf_detail(p, m, L, det)
    zone(p, Z["main"])
    perf_simple_view(p, m, L, Z["main"], callout="B" if ok else None, fill=True)


# ------------------------------------------------------------------ "B" detal (09 §D11, LentaCUD'da yo'q)
DET_GAP = 12  # uzilish oralig'i (birlik)


def _axis(feats: list[float], hw: float, kd: float, join_px: float = 46) -> list[tuple[float, float]]:
    """Uzilishli o'q: 0 (chet) va teshik markazlari atrofidagi oynalar; yaqinlari birlashtiriladi."""
    segs: list[list[float]] = [[0.0, 0.0]]
    for f in sorted(feats):
        a, b = f - hw, f + hw
        if (a - segs[-1][1]) * kd <= join_px:
            segs[-1][1] = max(segs[-1][1], b)
        else:
            segs.append([a, b])
    if segs[0][1] <= 0:
        segs[0][1] = hw
    return [(a, b) for a, b in segs]


def _axis_len(segs: list[tuple[float, float]], kd: float) -> float:
    return sum((b - a) * kd for a, b in segs) + DET_GAP * (len(segs) - 1)


def _axis_map(segs: list[tuple[float, float]], kd: float, origin: float):
    def f(v: float) -> float:
        pos = origin
        for a, b in segs:
            if v <= b + 1e-9:
                return pos + (max(v, a) - a) * kd
            pos += (b - a) * kd + DET_GAP
        return pos - DET_GAP

    return f


def perf_detail(p: Pen, m: dict, L: dict, box: Box, callout: str = "B") -> bool:
    """ "B" detal alohida guruhda (`data-view="detail"` — asosiy ko'rinishdan ajratish uchun)."""
    if box.h < 190 or box.w < 200:
        return False
    with p.group(data_view="detail"):
        return _perf_detail(p, m, L, box, callout)


def _perf_detail(p: Pen, m: dict, L: dict, box: Box, callout: str) -> bool:
    """Lenta burchagi kattalashtirilgan: chetdan teshik markazigacha, boshidan 1-qatorgacha, qadamlar, Ø.

    Masofalar uzilishlar bilan (masshtabsiz), yozuvlar — haqiqiy mm. Joy yetmasa — chizilmaydi (False).
    """
    if box.h < 190 or box.w < 200:
        return False
    ru = is_ru(m)
    dia = L["dia"]
    g0 = (L.get("groups") or [0])[0]
    u1 = g0 + L["edge"]
    cols = int(L["cols"])
    u2 = u1 + L["pitch"] if cols > 1 else None
    rows = int(L["rows"])
    st = bool(L["stagger"]) and cols > 1 and rows > 1
    uo = g0 + L["edgeOffset"] if st else None
    z0 = L["start"]
    z1 = z0 + L["pitchL"] if rows > 1 else None
    xs_f = [u for u in (u1, u2, uo) if u is not None]
    zs_f = [z for z in (z0, z1) if z is not None]
    kd = min(9.0, max(1.2, 22 / max(dia, 0.5)))
    if min(u1, z0) * kd < 16:
        kd = min(14.0, 16 / max(min(u1, z0), 0.5))
    avail_w, avail_h = box.w - 110, box.h - 142
    for _ in range(30):
        hw = max(1.7 * dia, 12 / kd)
        sx = _axis(xs_f, hw, kd)
        sz = _axis(zs_f, hw, kd)
        if _axis_len(sx, kd) <= avail_w and _axis_len(sz, kd) <= avail_h:
            break
        kd *= 0.85
    x0, y0 = box.x + 66, box.y + 86
    X = _axis_map(sx, kd, x0)
    Y = _axis_map(sz, kd, y0)
    wpx, hpx = _axis_len(sx, kd), _axis_len(sz, kd)
    mx = max(20, int((box.w - 8) / (10.5 * 0.53)))
    p.text(
        box.x + 4,
        box.y + 14,
        (f"{callout} — расположение отверстий" if ru else f"{callout} — teshiklar joylashuvi"),
        13.5,
        weight=700,
        fill=C.line,
    )
    sub = (
        "увеличено, с разрывами · размеры действительные, мм"
        if ru
        else "kattalashtirilgan, uzilishlar bilan · o'lchamlar haqiqiy, mm"
    )
    sub_rows = wrap_line(sub, mx)[:2]
    for i, t in enumerate(sub_rows):
        p.text(box.x + 4, box.y + 30 + i * 13, t.strip(), 10.5, fill=C.thin)
    if len(sub_rows) > 1:
        y0 += 10
        Y = _axis_map(sz, kd, y0)
    p.rect(x0, y0, wpx, hpx, fill=C.belt, fill_opacity=0.1, stroke="none")
    # uzilishlar: oq oraliq, chetlarda "//" belgisi
    pos = x0
    for a, b in sx[:-1]:
        pos += (b - a) * kd
        p.rect(pos, y0 + 1, DET_GAP, hpx, fill=C.paper, stroke="none")
        with p.group(stroke=C.line, stroke_width=0.9):
            for d in (2.5, DET_GAP - 2.5):
                p.line(pos + d - 3, y0 + 5, pos + d + 3, y0 - 5)
        pos += DET_GAP
    pos = y0
    for a, b in sz[:-1]:
        pos += (b - a) * kd
        p.rect(x0 + 1, pos, wpx, DET_GAP, fill=C.paper, stroke="none")
        with p.group(stroke=C.line, stroke_width=0.9):
            for d in (2.5, DET_GAP - 2.5):
                p.line(x0 - 5, pos + d + 3, x0 + 5, pos + d - 3)
        pos += DET_GAP
    break_v(p, x0 + wpx, y0, y0 + hpx)
    break_line_h(p, y0 + hpx, x0, x0 + wpx, over=2)
    # lenta chetlari: chap (yon chet) va yuqori (lenta boshi)
    with p.group(stroke=C.line, stroke_width=1.6):
        for a, b in sx:
            p.line(X(a), y0, X(b), y0)
        for a, b in sz:
            p.line(x0, Y(a), x0, Y(b))
    hr = max(3.0, dia / 2 * kd)

    def vis(v: float, segs: list[tuple[float, float]]) -> bool:
        return any(a - 1e-9 <= v <= b + 1e-9 for a, b in segs)

    pts: list[tuple[float, float, int]] = []
    for ri, z in enumerate(zs_f):
        odd = st and ri % 2 == 1
        for u in (uo, uo + L["pitch"]) if odd else (u1, u2):
            if u is not None and vis(u, sx) and vis(z, sz) and X(u) + hr < x0 + wpx - 4:
                pts.append((X(u), Y(z), ri))
    for hx, hy, _ in pts:
        hole_mark(p, hx, hy, hr, axes=True)
    # o'lchamlar: yuqorida chetdan -> 1-teshik -> 2-teshik
    stops = [0.0, u1] + ([u2] if u2 is not None and vis(u2, sx) else [])
    xs = [X(u) for u in stops]
    with p.group(stroke=C.dim, stroke_width=0.6, opacity=0.6):
        for x in xs[1:]:
            p.line(x, Y(z0) - hr - 2, x, y0 - 22)
    dim_chain(p, xs, [f1(L["edge"] + g0)] + ([f1(L["pitch"])] if len(xs) > 2 else []), y0 - 16, up=True)
    # chapda: lenta boshidan 1-qatorgacha, qatorlar qadami
    zst = [0.0, *zs_f]
    ys = [Y(z) for z in zst]
    with p.group(stroke=C.dim, stroke_width=0.6, opacity=0.6):
        for y in ys[1:]:
            p.line(X(u1) - hr - 2, y, x0 - 22, y)
    vchain(p, x0 - 16, ys, [f1(z0)] + ([f1(L["pitchL"])] if z1 is not None else []))
    # pastda: shaxmat siljishi
    yb = y0 + hpx + 22
    if st and uo is not None and vis(uo, sx):
        xa, xb = X(u1), X(uo)
        with p.group(stroke=C.dim, stroke_width=0.6, opacity=0.6):
            p.line(xa, Y(z0) + hr + 2, xa, yb + 5)
            p.line(xb, Y(z1) + hr + 2, xb, yb + 5)
        dim_x(p, xa, xb, yb, f1(uo - u1), up=False)
    # Ø chiqarma
    if pts:
        hx, hy, _ = max((q for q in pts if q[2] == 0), key=lambda q: q[0], default=pts[0])
        lx = min(hx + 34, x0 + wpx + 30)
        with p.group(stroke=C.dim, stroke_width=0.9):
            p.line(hx + hr * 0.7, hy + hr * 0.7, lx, hy + 30)
            p.line(lx, hy + 30, lx + 34, hy + 30)
        p.text(lx + 3, hy + 26, f"Ø{f1(dia)}", 13, weight=700, fill=C.dim, halo=True)
    bw = m["belt"]["width"]
    last_g = (L.get("groups") or [0])[-1]
    edge_r = bw - (last_g + L["edge"] + (cols - 1) * L["pitch"])
    tail = m["belt"]["length"] - L["start"] - (rows - 1) * L["pitchL"]
    info = (
        [
            f"От края до центра отверстия: слева {f1(u1)} / справа {f1(edge_r)} мм",
            f"От начала / конца ленты до 1-го ряда: {f1(z0)} / {f1(tail)} мм",
        ]
        if ru
        else [
            f"Chetdan teshik markazigacha: chap {f1(u1)} / o'ng {f1(edge_r)} mm",
            f"Boshidan / oxiridan qator markazigacha: {f1(z0)} / {f1(tail)} mm",
        ]
    )
    ty = y0 + hpx + (58 if st else 34)
    rows_t = [r.strip() for t in info for r in wrap_line(t, max(20, int((box.w - 8) / (11 * 0.53))))]
    for i, t in enumerate(rows_t):
        if ty + i * 15 < box.y + box.h - 2:
            p.text(box.x + 4, ty + i * 15, t, 11, fill=C.thin)
    return True


def edge_caption(p: Pen, x: float, y: float, ru: bool, above: bool = False) -> None:
    """ "chetdan teshik markazigacha" — ikki qisqa qator, o'lcham zanjiri chap uchida (o'ngga tekislangan)."""
    lines = ["от края до", "центра отв."] if ru else ["chetdan teshik", "markazigacha"]
    dy = (-30, -18) if above else (12, 24)
    for t, d in zip(lines, dy):
        p.text(x, y + d, t, 10, fill=C.thin, anchor="end")


def callout_circle(p: Pen, cx: float, cy: float, label: str, r: float = 18) -> None:
    """Detal belgisi: shtrix doira + harf (chapda-yuqorida)."""
    p.circle(cx, cy, r, fill="none", stroke=C.line, stroke_width=1, stroke_dasharray="5 3")
    p.text(cx - r - 4, cy - r + 2, label, 15, weight=700, fill=C.line, anchor="end", halo=True)
