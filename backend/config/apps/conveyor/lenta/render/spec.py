"""Texnik tavsif qatorlari — `drawing/spec.ts` nusxasi (06 §5.1)."""

from __future__ import annotations

from ..drawing_model import col_window, cross_len_text
from ..format import f1, uzs
from ..specs import SIDEWALL_SPEC
from .common import is_ru


def main_notes(m: dict) -> list[str]:
    """Chizmadagi ogohlantirishlar (`mainNotes`)."""
    out = list(m["warnings"])
    if m["unverified"]:
        out.append(f"O'lchami tasdiqlanmagan: {', '.join(m['unverified'])}")
    return out


def _guide_rows(m: dict) -> list[dict]:
    g = m.get("guide")
    if not g:
        return []
    return [r for r in (g.get("bottom"), g.get("top")) if r]


def spec_lines(m: dict, brief: bool = False) -> list[str | None]:
    b = m["belt"]
    bw = b["width"]
    ln = b["length"]
    g = m.get("guide")
    gs = g["spec"] if g else None
    cr = m.get("cross")
    cs = cr["spec"] if cr else None
    band = SIDEWALL_SPEC["width"]
    rows = _guide_rows(m)
    pitch = cr["pitch"] if cr else None
    perf = (m.get("perf") or {}).get("layout") if m.get("perf") else None

    spans = cr["spans"] if cr else []
    gofro = m.get("gofro")
    walls = [
        ((bd["from"], bd["from"] + band) if bd["side"] == "left" else (bd["to"] - band, bd["to"]))
        for bd in (gofro["bands"] if gofro else [])
    ]
    gaps = [(a - w1 if a >= w1 else w0 - bb if bb <= w0 else 0) for w0, w1 in walls for a, bb in spans]
    wall_gap = min(gaps) if gaps else None

    if brief:
        lenta: list[str | None] = (
            [
                "§LENTA",
                f"  Kesish uz.: {uzs(ln + b['joint'])} mm" if b["joint"] > 0 else None,
                f"  Ulanish: {m['join']}" if m["join"] else None,
            ]
            if b["joint"] > 0 or m["join"]
            else []
        )
    else:
        lenta = [
            "§LENTA",
            f"  {b['name']}",
            f"  O'lchami: {uzs(bw)} × {uzs(ln)} mm",
            f"  Qalinligi: {f1(b['thickness'])} mm" if b["thickness"] else None,
            f"  Kesish uz.: {uzs(ln + b['joint'])} mm" if b["joint"] > 0 else None,
            f"  Ulanish: {m['join']}" if m["join"] else None,
        ]

    guide: list[str | None] = []
    if g:
        guide = ["§YO'NALTIRUVCHI", f"  {g['name']}", f"  Kesimi: B {f1(gs['B'])} · H {f1(gs['H'])} mm" if gs else None]
        for r in rows:
            side = "Ustidan" if r["place"] == "top" else "Ostidan"
            xs = r["xs"]
            if brief:
                guide.append(f"  {side}: {uzs(len(xs))} dona")
            else:
                if len(xs) == 1:
                    where = (
                        "markazda"
                        if abs(xs[0] - bw / 2) < 0.5
                        else f"chapdan {f1(xs[0])} / o'ngdan {f1(bw - xs[0])} mm (o'qigacha)"
                    )
                else:
                    where = f"chetdan {f1(xs[0])} / {f1(bw - xs[-1])} mm"
                guide.append(f"  {side}: {uzs(len(xs))} dona · {where}")
        if not brief:
            for r in rows:
                if len(r["xs"]) > 1:
                    lbl = "Ustidagi" if r["place"] == "top" else "Ostidagi"
                    guide.append(f"  {lbl} qadam: {f1(r['pitch']) + ' mm' if r['pitch'] is not None else 'notekis'}")
                else:
                    guide.append(None)

    cross: list[str | None] = []
    if cr:
        if brief:
            ln_txt = None
        elif cr["manual"]:
            ln_txt = f"  Uzunligi: {cross_len_text(cr, f1)} mm"
        elif cr["parts"] > 1:
            ln_txt = f"  Uzunligi: {uzs(cr['parts'])} × {f1(cr['drawLength'])} mm (tirqish {f1(cr['gap'])})"
        else:
            ln_txt = f"  Uzunligi: {f1(cr['drawLength'])} mm"
        cross = [
            "§KO'NDALANG PROFIL",
            f"  {cr['name']}",
            f"  Kesimi: B {f1(cs['B'])} · H {f1(cs['H'])} mm" if cs else None,
            ln_txt,
            (
                f"  Soni: {uzs(cr['count'])} o'rin × {uzs(cr['parts'])} = {uzs(cr['count'] * cr['parts'])} dona"
                if cr["parts"] > 1
                else f"  Soni: {uzs(cr['count'])} dona"
            ),
            (f"  Qadam: {f1(pitch)} mm" if pitch is not None else "  Qadam: har xil") if cr["count"] > 1 else None,
            f"  Birinchisi boshidan: {f1(cr['ys'][0])} mm" if len(cr["ys"]) > 0 else None,
            f"  Gofra devorigacha: {f1(wall_gap)} mm" if not brief and wall_gap is not None else None,
        ]

    gof: list[str | None] = []
    if gofro:
        sides = gofro["sides"]
        gof = [
            "§GOFROBORT",
            f"  {gofro['name']}",
            None if brief else f"  Balandligi: H {f1(gofro['height'])} mm",
            "  " + ("Ikkala tomonda" if len(sides) == 2 else "Chap tomonda" if sides[0] == "left" else "O'ng tomonda"),
        ]
        if not brief:
            for bd in gofro.get("bands") or []:
                off = bd["from"] if bd["side"] == "left" else bw - bd["to"]
                side_lbl = "Chap" if bd["side"] == "left" else "O'ng"
                gof.append(f"  {side_lbl} chetdan: {f1(off)} mm" if off > 0.5 else None)

    perf_l: list[str | None] = []
    if perf:
        perf_l = [
            "§PERFORATSIYA",
            f"  Ø {f1(perf['dia'])} mm · {uzs(m['perf']['count'])} ta",
            f"  Enida: {cols_text(perf)} · qadam {f1(perf['pitch'])} mm",
            f"  Bo'yida: {uzs(perf['rows'])} qator · qadam {f1(perf['pitchL'])} mm",
            f"  {edge_text(perf, bw).capitalize()}",
            "  Shaxmat tartibida" if perf["stagger"] and perf["cols"] > 1 else None,
            f"  Yakka qatorlar: {', '.join(f1(u) for u in perf['lines'])} mm" if perf.get("lines") else None,
        ]

    out: list[str | None] = []
    for i, sec in enumerate(s for s in (lenta, guide, cross, gof, perf_l) if len(s) > 0):
        if i > 0:
            out.append(" ")
        out.extend(sec)
    return out


# ------------------------------------------------------------------ lenta ichidagi yozuvlar (2026-11, D3)
def perf_margins(L: dict, bw: float) -> tuple[float, float]:
    """Haqiqiy chap/o'ng chet (teshik markazigacha), mm."""
    groups = L.get("groups") or [0]
    # faqat lentaga tushishi mumkin bo'lgan ustunlar (natija bir xil; guruh × ustun to'liq aylanmaydi)
    us = [
        g + L["edge"] + c * L["pitch"]
        for g in groups
        for c in col_window(g, L["edge"], int(L["cols"]), L["pitch"], 0, bw)
    ]
    us += list(L.get("lines") or [])
    us = [u for u in us if 0 <= u <= bw]
    if not us:
        return 0.0, 0.0
    return min(us), bw - max(us)


def edge_text(L: dict, bw: float, ru: bool = False) -> str:
    """ "chetdan 10 mm (ikkala chetdan)" yoki "chetdan: chap 10 / o'ng 25 mm"."""
    a, b = perf_margins(L, bw)
    if abs(a - b) < 0.05:
        return f"от края {f1(a)} мм (с обеих сторон)" if ru else f"chetdan {f1(a)} mm (ikkala chetdan)"
    return f"от края: слева {f1(a)} / справа {f1(b)} мм" if ru else f"chetdan: chap {f1(a)} / o'ng {f1(b)} mm"


def cols_text(L: dict, ru: bool = False) -> str:
    """Enidagi teshiklar soni: shaxmatda qatorlar navbatma-navbat N va N−1 ta (3 825 = 85×23 + 85×22)."""
    n = int(L["cols"])
    if L.get("stagger") and n > 1 and int(L.get("rows") or 0) > 1:
        return f"{uzs(n)}/{uzs(n - 1)} шт (через ряд)" if ru else f"{uzs(n)}/{uzs(n - 1)} ta (navbatma-navbat)"
    return f"{uzs(n)} шт" if ru else f"{uzs(n)} ta"


def perf_note_lines(m: dict) -> list[str]:
    L = (m.get("perf") or {}).get("layout") if m.get("perf") else None
    if not L:
        return []
    ru = is_ru(m)
    bw = m["belt"]["width"]
    cnt = m["perf"]["count"]
    st = L["stagger"] and L["cols"] > 1
    if ru:
        return [
            f"Отверстия Ø{f1(L['dia'])} мм · всего {uzs(cnt)} шт",
            f"по ширине {cols_text(L, True)}, шаг {f1(L['pitch'])} мм · {edge_text(L, bw, True)}",
            f"по длине шаг {f1(L['pitchL'])} мм" + (" · в шахматном порядке" if st else ""),
        ]
    return [
        f"Teshik Ø{f1(L['dia'])} mm · jami {uzs(cnt)} ta",
        f"enida {cols_text(L)}, qadam {f1(L['pitch'])} mm · {edge_text(L, bw)}",
        f"bo'yida qadam {f1(L['pitchL'])} mm" + (" · shaxmat tartibida" if st else ""),
    ]


def cross_note_line(m: dict) -> str | None:
    cr = m.get("cross")
    if not cr:
        return None
    ru = is_ru(m)
    cs = cr["spec"]
    h = f" · H {f1(cs['H'])} мм" if cs and ru else f" · H {f1(cs['H'])} mm" if cs else ""
    n = cr["count"]
    if ru:
        pitch = (f" · шаг {f1(cr['pitch'])} мм" if cr["pitch"] is not None else " · шаг разный") if n > 1 else ""
        first = f" · первый {f1(cr['ys'][0])} мм от начала" if cr["ys"] else ""
        return f"{cr['name']}{h} · {uzs(n)} шт{pitch}{first}"
    pitch = (f" · qadam {f1(cr['pitch'])} mm" if cr["pitch"] is not None else " · qadam har xil") if n > 1 else ""
    first = f" · birinchisi boshidan {f1(cr['ys'][0])} mm" if cr["ys"] else ""
    return f"{cr['name']}{h} · {uzs(n)} ta{pitch}{first}"


def guide_note_line(m: dict) -> str | None:
    g = m.get("guide")
    if not g:
        return None
    ru = is_ru(m)
    parts = []
    for r in _guide_rows(m):
        xs = r["xs"]
        if ru:
            side = "сверху" if r["place"] == "top" else "снизу"
            where = " (по центру)" if len(xs) == 1 and abs(xs[0] - m["belt"]["width"] / 2) < 0.5 else ""
            parts.append(f"{side} {uzs(len(xs))} шт{where}")
        else:
            side = "ustidan" if r["place"] == "top" else "ostidan"
            where = " (markazda)" if len(xs) == 1 and abs(xs[0] - m["belt"]["width"] / 2) < 0.5 else ""
            parts.append(f"{side} {uzs(len(xs))} ta{where}")
    name = g["name"].split(" (")[0].split(" - ")[0]
    label = "Направляющая" if ru else "Yo'naltiruvchi"
    return f"{label} {name} · {', '.join(parts)}"


def join_note(m: dict) -> str | None:
    """Ulash belgisi yozuvi: "Qulf: KS - SE 90/10 (FORBO)"."""
    from .marks import short_lock_name

    s = m.get("_join")
    if not s:
        return None
    ru = is_ru(m)
    if s["kind"] == "lock":
        return f"{'Замок' if ru else 'Qulf'}: {short_lock_name(s['name'])} — {'на обоих концах' if ru else 'ikkala uchida'}"
    if s["kind"] == "weld":
        j = m["belt"].get("joint") or 0
        zap = (f" (припуск +{uzs(j)} мм)" if ru else f" (+{uzs(j)} mm zapas)") if j > 0 else ""
        return f"Сварной стык: концы ленты соединяются{zap}" if ru else f"Payvand: lenta uchlari o'zaro ulanadi{zap}"
    if s["kind"] == "install":
        return "Монтаж на месте — замок/стык" if ru else "Joyida o'rnatiladi — ulash ikkala uchida"
    return None
