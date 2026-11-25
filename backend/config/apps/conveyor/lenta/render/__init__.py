"""Konveyer lenta texnik chizmasi (A4 albom listlar) — `BeltDrawing.tsx` nusxasi.

Oqim (bitta manba): `revive(raw)` -> `effective_config` -> `build_drawing_model`
-> list chizuvchilari (`Pen`) -> `to_svg` (Mini App) / `to_pdf` (vektor PDF).

    sheets = render_sheets(raw_state)
    svg = to_svg(sheets[0])
    pdf = to_pdf(sheets)            # blocked bo'lsa DrawingBlocked
    name = pdf_file_name(raw_state)

Chizmada narx YO'Q (asl chizmada ham yo'q). Chizma tili doim o'zbekcha
(sarlavha jadvalida uz/ru juft yozuvlar); `lang` faqat xabar matniga ta'sir qiladi.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date as _date
from pathlib import Path
from typing import Any

from .._js import js_str
from ..drawing_model import build_drawing_model, col_window
from ..effective import BEND_TINY_PREFIX, PLAUSIBLE_PREFIX, effective_config
from ..format import format_date
from ..model import revive
from .common import BRAND_W, CONTENT_BOT, CONTENT_X, NO_SCALE, PAD, C, H, W, is_ok
from .cross import cross_section_sheet
from .curve_sheet import curve_scale, curve_sheet, cut_sheet
from .general import general_scale, general_sheet, is_flat_perf, main_iso_box, main_sheet
from .iso import iso_geometry
from .pdf import render_pdf
from .pen import Node, Pen, iter_text
from .perf import perf_sheet
from .plan import plan_sheet
from .production import production_sheet
from .side import side_section_sheet
from .svg import render_svg
from .title_block import mini_title_block, title_block

__all__ = ["DrawingBlocked", "Sheet", "pdf_file_name", "render_drawing", "render_sheets", "to_pdf", "to_svg"]

LOGO_PNG = (Path(__file__).with_name("logo.png")).read_bytes()
LOGO_W, LOGO_H = 411, 60
LOGO_LEN = 210


class DrawingBlocked(ValueError):
    """Konfiguratsiyada xato bor — asl ilovada PDF tugmasi o'chiq bo'ladi."""


@dataclass
class Sheet:
    key: str  # general | main | plan | cross | side | perf | curve | cut | message
    title: str
    page: int
    pages: int
    full: bool
    root: Node
    blocked: bool = False
    issues: list[dict] = field(default_factory=list)

    @property
    def texts(self) -> list[str]:
        return list(iter_text(self.root))


@dataclass
class Drawing:
    sheets: list[Sheet]
    message: str | None
    blocked: bool
    issues: list[dict]
    model: dict


def _bend_message(bend: Any, lang: str) -> str:
    b = js_str(bend)
    if lang == "ru":
        return f"Лента не сгибается на {b}° — внутренний радиус отрицательный. Уменьшите угол или увеличьте длину."
    return f"Lenta {b}° ga bukilmaydi — ichki radius manfiy. Burchakni kamaytiring yoki uzunlikni oshiring."


# Chizmaga sig'adigan element soni (haqiqiy zakazlarda: yo'naltiruvchi 1–6, teshik ustunlari o'nlab, bo'lak 1–6).
# Bundan ko'pi chizilmaydi: har bir element o'lcham zanjiri/yozuv beradi — minglab element sekundlab CPU va
# megabaytlab SVG/PDF (veb jarayonni band qiladi).
MAX_DRAW_GUIDES = 200  # ikkala tomon jami
MAX_DRAW_PERF_COLS = 2000  # lenta eniga tushadigan teshik ustunlari (guruhlar × ustunlar + yakka qatorlar)
MAX_DRAW_CROSS_PARTS = 24  # ko'ndalang profil bo'laklari (en bo'ylab)


def _perf_cols_on_belt(L: dict, bw: float, stop: int) -> int:
    n = len(L.get("lines") or [])
    for g in L.get("groups") or [0]:
        n += len(col_window(g, L["edge"], L["cols"], L["pitch"], 0, bw))
        if n > stop:
            break
    return n


def complexity_issue(m: dict) -> dict[str, str] | None:
    """Chizib bo'lmaydigan darajada ko'p element — bloklovchi xato (issue) yoki None."""
    g = m.get("guide")
    n_g = sum(len(r["xs"]) for r in ((g or {}).get("bottom"), (g or {}).get("top")) if r)
    if n_g > MAX_DRAW_GUIDES:
        return {
            "tab": "guide",
            "field": "guideBottomQty",
            "level": "error",
            "message": f"Yo'naltiruvchilar juda ko'p ({n_g} ta) — chizmaga ko'pi bilan {MAX_DRAW_GUIDES} ta sig'adi, "
            "sonini kamaytiring",
            "ru": f"Слишком много направляющих ({n_g} шт) — на чертеже не более {MAX_DRAW_GUIDES}, "
            "уменьшите количество",
        }
    cr = m.get("cross")
    if cr and len(cr.get("spans") or []) > MAX_DRAW_CROSS_PARTS:
        return {
            "tab": "cross",
            "field": "crossParts",
            "level": "error",
            "message": f"Ko'ndalang profil bo'laklari juda ko'p ({len(cr['spans'])} ta) — ko'pi bilan "
            f"{MAX_DRAW_CROSS_PARTS} ta, bo'laklar sonini kamaytiring",
            "ru": f"Слишком много отрезков поперечного профиля ({len(cr['spans'])} шт) — не более "
            f"{MAX_DRAW_CROSS_PARTS}, уменьшите количество",
        }
    L = (m.get("perf") or {}).get("layout") if m.get("perf") else None
    if L and _perf_cols_on_belt(L, m["belt"]["width"], MAX_DRAW_PERF_COLS) > MAX_DRAW_PERF_COLS:
        return {
            "tab": "perf",
            "field": "perfCols",
            "level": "error",
            "message": f"Teshik ustunlari juda ko'p — chizmaga ko'pi bilan {MAX_DRAW_PERF_COLS} ta sig'adi, "
            "ustunlar/guruhlar sonini kamaytiring yoki qadamni oshiring",
            "ru": f"Слишком много столбцов отверстий — на чертеже не более {MAX_DRAW_PERF_COLS}, "
            "уменьшите число столбцов/групп или увеличьте шаг",
        }
    return None


def _message_drawing(msg: str, issues: list[dict], m0: dict) -> Drawing:
    p = Pen()
    p.text(CONTENT_X, PAD + 40, msg, 14, fill=C.dim)
    sh = Sheet("message", "Xato", 1, 1, False, p.root, True, issues)
    return Drawing([sh], msg, True, issues, m0)


def _frame(p: Pen) -> None:
    p.rect(PAD, PAD, W - 2 * PAD, H - 2 * PAD, fill="none", stroke=C.line, stroke_width=2)
    p.rect(CONTENT_X, PAD, W - PAD - CONTENT_X, H - 2 * PAD, fill="none", stroke=C.line, stroke_width=1.25)
    lh = LOGO_LEN * (LOGO_H / LOGO_W)
    p.image(
        LOGO_PNG,
        0,
        0,
        LOGO_LEN,
        lh,
        transform=[("translate", PAD + BRAND_W / 2 - lh / 2, H / 2 + LOGO_LEN / 2), ("rotate", -90)],
    )


def render_drawing(raw_state: Any, lang: str = "uz", today: _date | str | None = None, album: bool = False) -> Drawing:
    """To'liq natija: listlar + (bo'lsa) xabar, blocked bayrog'i va issues.

    Standart — BIR varaqli ishlab chiqarish chizmasi (2026-11-09 egasining qarori). album=True — eski ko'p varaqli
    albom (faqat ichki: testlar va qismlarni tekshirish uchun; foydalanuvchiga chiqarilmaydi)."""
    eff = effective_config(revive(raw_state))
    m0 = build_drawing_model(eff["state"])
    blocked = bool(eff.get("blocked"))
    issues = list(eff.get("issues") or [])
    if isinstance(today, _date):
        date_s = format_date(today)
    elif isinstance(today, str):
        date_s = today
    else:
        date_s = format_date(_date.today())
    heavy = complexity_issue(m0)
    if heavy:  # chizishdan OLDIN: aks holda minglab element chiziladi (CPU/xotira)
        issues.append(heavy)
        return _message_drawing(heavy["ru"] if lang == "ru" else heavy["message"], issues, m0)
    tiny = next((i for i in issues if i["level"] == "error" and i["message"].startswith(BEND_TINY_PREFIX)), None)
    if tiny:  # radius cheksizga yaqin — chizib bo'lmaydi
        return _message_drawing(tiny["ru"] if lang == "ru" else tiny["message"], issues, m0)
    m = render_model(m0, eff["state"], lang, date_s, issues)
    ok = is_ok(m)
    curve = m.get("curve")

    if ok and m["belt"]["bend"] > 0 and not curve:
        return _message_drawing(_bend_message(m["belt"]["bend"], lang), issues, m0)

    plan: list[tuple[str, str, bool, float, Callable[[Pen, int], None]]] = []
    if ok and curve:
        plan.append(("curve", "Bukilgan lenta", True, curve_scale(m), lambda p, n: curve_sheet(p, m, n)))
        plan.append(("cut", "Kesish shabloni", False, 0, lambda p, n: cut_sheet(p, m, n)))
    if not curve and not album:
        # 2026-11-09: har lenta uchun BIR varaqli ishlab chiqarish chizmasi
        plan.append(("prod", "Ishlab chiqarish chizmasi", True, NO_SCALE, lambda p, n: production_sheet(p, m, n)))
    if album and ok and not curve:
        plan.append(("general", "Umumiy chizma", True, general_scale(m), lambda p, n: general_sheet(p, m, n)))
    if album and not curve:
        iso_scale = 0.0
        if ok:
            box = main_iso_box(m)
            k = iso_geometry(m, box.w, box.h)["k"]
            iso_scale = 4 / k if k > 0 else 0
        plan.append(("main", "Umumiy ko'rinish (3D)", True, iso_scale, lambda p, n: main_sheet(p, m, n)))
    if album and ok and not curve:
        plan.append(("plan", "Ustidan ko'rinish", False, 0, lambda p, n: plan_sheet(p, m, n)))
        plan.append(("cross", "Ko'ndalang kesim", False, 0, lambda p, n: cross_section_sheet(p, m, n)))
        if m.get("cross") or m.get("guide") or m.get("gofro"):
            plan.append(("side", "Yon kesim", False, 0, lambda p, n: side_section_sheet(p, m, n)))
    perf_l = (m.get("perf") or {}).get("layout") if album and ok and not curve and m.get("perf") else None
    if perf_l and not is_flat_perf(m):
        count = m["perf"]["count"] or 0
        plan.append(("perf", "Perforatsiya", False, 0, lambda p, n: perf_sheet(p, m, n, perf_l, count)))

    sheets: list[Sheet] = []
    pages = len(plan)
    for i, (key, title, full, scale, body) in enumerate(plan):
        n = i + 1
        p = Pen()
        _frame(p)
        body(p, n)
        if full:
            p.line(CONTENT_X, CONTENT_BOT, W - PAD, CONTENT_BOT, stroke=C.line, stroke_width=1.25)
            title_block(p, m, scale, ok, title, n, pages, date_s)
        else:
            mini_title_block(p, m, title, n, pages, date_s)
        sheets.append(Sheet(key, title, n, pages, full, p.root, blocked, issues))
    return Drawing(sheets, None, blocked, issues, m0)


def drawing_number(state: dict, date_s: str) -> str:
    """Avtomatik chizma raqami: "L-<YYMMDD>-<xesh>" (holatdan deterministik)."""
    import hashlib

    from .._js import js_json

    h = hashlib.sha1(js_json(state).encode("utf-8")).hexdigest()[:4].upper()
    mt = re.fullmatch(r"(\d{2})\.(\d{2})\.\d{2}(\d{2})", date_s or "")
    return f"L-{mt.group(3)}{mt.group(2)}{mt.group(1)}-{h}" if mt else f"L-{h}"


def render_model(m: dict, state: dict, lang: str, date_s: str, issues: list[dict] | None = None) -> dict:
    """Faqat chizish uchun qo'shimchalar (domen modeli o'zgarmaydi): til, ulash turi, chizma raqami.

    Ehtimoli past o'lchamlar ogohlantirishi (D9) chizmadagi ⚠ izohlarga ham qo'shiladi.
    """
    jm = state.get("joinMethod")
    join = None
    if state.get("lockOn"):
        kind = jm if jm in ("lock", "weld", "install") else "meter"
        join = {"kind": kind, "name": state.get("lockName") or ""}
    plaus = [
        (i.get("ru") if lang == "ru" else None) or i["message"]
        for i in (issues or [])
        if str(i.get("message", "")).startswith(PLAUSIBLE_PREFIX)
    ]
    out = {**m, "_lang": lang, "_join": join, "_drawingNo": drawing_number(state, date_s)}
    if plaus:
        out["warnings"] = [*m["warnings"], *plaus]
    return out


def render_sheets(
    raw_state: Any, lang: str = "uz", today: _date | str | None = None, album: bool = False
) -> list[Sheet]:
    """Chizma listlari (A4 albom). `today` — sarlavhadagi sana ("" -> "—"). album — ichki, ko'p varaqli."""
    return render_drawing(raw_state, lang, today, album).sheets


def to_svg(sheet: Sheet) -> str:
    return render_svg(sheet.root, sheet.title)


def to_pdf(sheets: list[Sheet], *, allow_blocked: bool = False) -> bytes:
    """Vektor PDF (A4 albom, har list — sahifa). Xatoli konfiguratsiya: `DrawingBlocked`."""
    if not sheets:
        raise ValueError("chizma listi yo'q")
    if not allow_blocked and any(s.blocked for s in sheets):
        errs = [i.get("message", "") for i in (sheets[0].issues or []) if i.get("level") == "error"]
        raise DrawingBlocked("; ".join(e for e in errs if e) or "konfiguratsiyada xato bor")
    return render_pdf([(s.root, s.title) for s in sheets])


_NAME_RE = re.compile(r"[^\w-]+", re.ASCII)
NAME_MAX = 80


def pdf_file_name(state: Any) -> str:
    """`{nm}_{width}x{length}.pdf` — asl `exportDrawing` qoidasi (JS `\\w` ASCII)."""
    s = revive(state)
    # nom uzunligi chegaralangan: fayl tizimi/Telegram 255 baytdan uzun nomni qabul qilmaydi
    nm = _NAME_RE.sub("_", s["projectName"] or "chizma")[:NAME_MAX] or "chizma"
    return f"{nm}_{js_str(s['width'])}x{js_str(s['length'])}.pdf"
