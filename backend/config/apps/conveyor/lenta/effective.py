"""EFFEKTIV KONFIGURATSIYA — bitta manba (`lib/effective.ts` nusxasi).

`effective_config(raw)` -> {state, joint, crossMax, crossSeg, crossPitch, issues, blocked}.
Narx, chizma va jadval FAQAT `state` dan oladi; `issues` — xato/ogohlantirishlar.
"""

from __future__ import annotations

import math
from typing import Any

from ._js import INF, jround, js_str
from .calc import joint_mm
from .catalog import by_name, catalog
from .curve import apply_curve, bend_too_tight, curve_geom, curve_holes_overlap, is_curve
from .drawing_model import (
    cross_free,
    cross_max_length_for,
    cross_max_segment,
    fit_cross_segs,
    gofro_bands,
    guide_side_of,
    perf_align_info,
    perf_alignment,
    perf_hole_points,
    perf_layout_for,
)
from .format import uzs
from .items import normalize_positions
from .locks import lock_fits, lock_thickness_range
from .specs import (
    CROSS_TO_SIDEWALL_GAP,
    CROSS_TO_SIDEWALL_MIN,
    GOFRO_MIN_INSET,
    GUIDE_SPECS,
    SIDEWALL_SPEC,
    cleat_spec_for,
)

State = dict[str, Any]


def _issue(level: str, tab: str, field: str, message: str, ru: str) -> dict[str, str]:
    return {"tab": tab, "field": field, "message": message, "ru": ru, "level": level}


def _err(tab: str, field: str, message: str, ru: str) -> dict[str, str]:
    return _issue("error", tab, field, message, ru)


def _warn(tab: str, field: str, message: str, ru: str) -> dict[str, str]:
    return _issue("warning", tab, field, message, ru)


PLAUSIBLE_PREFIX = "O'lchamlar g'ayrioddiy"
CURVE_MAX_WIDTH = 1500  # mm — burilish lentasining radial eni (odatda 300–1000)
CURVE_MAX_OUTER_D = 6000  # mm — tashqi diametr
STRAIGHT_MAX_WIDTH = 3000  # mm
STRAIGHT_MAX_LENGTH = 200_000  # mm


def _m(v: float) -> str:
    return f"{v / 1000:.1f}".replace(".", ",").replace(",0", "") + " m"


def plausibility_issues(raw: State) -> list[dict[str, str]]:
    """Ehtimoli past o'lchamlar — ogohlantirish (bloklamaydi): kiritishdagi xatoni ushlash uchun."""
    w, ln = raw.get("width") or 0, raw.get("length") or 0
    if not (w > 0 and ln > 0):
        return []
    if is_curve(raw):
        g = curve_geom(raw)
        if not g:
            return []
        D = g["R"] * 2
        if w > CURVE_MAX_WIDTH or D > CURVE_MAX_OUTER_D or g["r"] < w / 10:
            return [
                _warn(
                    "belt",
                    "width",
                    f"{PLAUSIBLE_PREFIX}: eni {uzs(round(w))} mm, tashqi diametr {_m(D)} — eni va uzunligi to'g'ri "
                    "ekanini tekshiring (burilish konveyerlarida eni odatda 300–1000 mm)",
                    f"Необычные размеры: ширина {uzs(round(w))} мм, наружный диаметр {_m(D).replace(' m', ' м')} — "
                    "проверьте ширину и длину (у поворотных конвейеров ширина обычно 300–1000 мм)",
                )
            ]
        return []
    if w > STRAIGHT_MAX_WIDTH or ln > STRAIGHT_MAX_LENGTH:
        return [
            _warn(
                "belt",
                "width" if w > STRAIGHT_MAX_WIDTH else "length",
                f"{PLAUSIBLE_PREFIX}: eni {uzs(round(w))} mm, uzunligi {_m(ln)} — o'lchamlar to'g'ri ekanini tekshiring",
                f"Необычные размеры: ширина {uzs(round(w))} мм, длина {_m(ln).replace(' m', ' м')} — проверьте размеры",
            )
        ]
    return []


# Bloklovchi chegaralar (LentaCUD'da yo'q — 09_divergences D13): chizma/narx yiqilmasin, absurd o'lcham narxlanmasin
MIN_BEND_ANGLE = 0.5  # ° — bundan kichik burchak: radius cheksizga yaqin (chizma masshtabi 0/NaN)
HARD_FACTOR = 10  # ehtimoliy maksimumdan shuncha marta katta — xato (ogohlantirish emas)
HARD_PREFIX = "O'lcham haddan tashqari katta"
BEND_TINY_PREFIX = "Bukish burchagi juda kichik"


def hard_limit_issues(raw: State) -> list[dict[str, str]]:
    """Bloklovchi xatolar: juda kichik bukish burchagi / cheksiz radius, absurd o'lcham, sig'maydigan gofra."""
    out: list[dict[str, str]] = []
    w, ln = raw.get("width") or 0, raw.get("length") or 0
    bend = raw.get("bendAngle") or 0
    if is_curve(raw):
        g = curve_geom(raw) if w > 0 and ln > 0 else None
        bad_r = bool(g) and not all(math.isfinite(g[k]) for k in ("R", "r", "outerArc", "innerArc"))
        if w > 0 and ln > 0 and (bend < MIN_BEND_ANGLE or bad_r):
            out.append(
                _err(
                    "belt",
                    "bendAngle",
                    f"{BEND_TINY_PREFIX} ({js_str(bend)}°) — kamida {js_str(MIN_BEND_ANGLE)}° bo'lsin "
                    "yoki to'g'ri lenta uchun 0 qiling",
                    f"Угол изгиба слишком мал ({js_str(bend)}°) — не менее {js_str(MIN_BEND_ANGLE)}° "
                    "или 0 для прямой ленты",
                )
            )
        elif g:
            D = g["R"] * 2
            if w > HARD_FACTOR * CURVE_MAX_WIDTH or D > HARD_FACTOR * CURVE_MAX_OUTER_D:
                out.append(
                    _err(
                        "belt",
                        "width" if w > HARD_FACTOR * CURVE_MAX_WIDTH else "length",
                        f"{HARD_PREFIX}: eni {uzs(round(w))} mm, tashqi diametr {_m(D)} — o'lchamlarni tuzating",
                        f"Размер слишком большой: ширина {uzs(round(w))} мм, наружный диаметр "
                        f"{_m(D).replace(' m', ' м')} — исправьте размеры",
                    )
                )
    elif w > HARD_FACTOR * STRAIGHT_MAX_WIDTH or ln > HARD_FACTOR * STRAIGHT_MAX_LENGTH:
        out.append(
            _err(
                "belt",
                "width" if w > HARD_FACTOR * STRAIGHT_MAX_WIDTH else "length",
                f"{HARD_PREFIX}: eni {uzs(round(w))} mm, uzunligi {_m(ln)} — o'lchamlarni tuzating",
                f"Размер слишком большой: ширина {uzs(round(w))} мм, длина {_m(ln).replace(' m', ' м')} — "
                "исправьте размеры",
            )
        )
    if raw.get("gofroOn") and w > 0:
        # gofro_bands chetdan qochishni lenta eniga qarab qisadi (10 mm dan kam ham) — bu yerda ushlanadi
        bands = gofro_bands(raw)
        eps = 1e-6
        out_of = any(b["from"] < GOFRO_MIN_INSET - eps or b["to"] > w - GOFRO_MIN_INSET + eps for b in bands)
        overlap = len(bands) > 1 and bands[0]["to"] > bands[1]["from"] + eps
        if out_of or overlap:
            need = 2 * (SIDEWALL_SPEC["baseWidth"] + GOFRO_MIN_INSET)
            out.append(
                _err(
                    "gofro",
                    "gofroQty",
                    f"Gofrobort lentaga sig'maydi — eni kamida {js_str(need)} mm bo'lishi kerak "
                    f"(band {js_str(SIDEWALL_SPEC['baseWidth'])} mm + chetdan {GOFRO_MIN_INSET} mm)",
                    f"Борт не помещается на ленту — ширина не менее {js_str(need)} мм "
                    f"(полоса {js_str(SIDEWALL_SPEC['baseWidth'])} мм + отступ {GOFRO_MIN_INSET} мм)",
                )
            )
    return out


def effective_config(raw: State) -> dict[str, Any]:
    """Tekshirilgan (clamp qilingan) holat + xatolar ro'yxati — `effectiveConfig` AYNAN."""
    issues: list[dict[str, str]] = []
    s = apply_curve(raw)
    if bend_too_tight(raw):
        issues.append(
            _err(
                "belt",
                "bendAngle",
                "Lenta bu burchakka bukilmaydi — ichki radius manfiy (burchakni kamaytiring yoki uzunlikni oshiring)",
                "Лента не изгибается на этот угол — внутренний радиус отрицателен (уменьшите угол или увеличьте длину)",
            )
        )
    if curve_holes_overlap(raw):
        issues.append(
            _err(
                "perf",
                "curveHoleCount",
                "Teshiklar bir-birining ustiga chiqadi — sonini, qatorlar orasini yoki diametrini o'zgartiring",
                "Отверстия накладываются — измените количество, шаг рядов или диаметр",
            )
        )
    if is_curve(raw) and raw["curveHoleCount"] > 0:
        g = curve_geom(raw)
        if g and not g["holes"]:
            issues.append(
                _warn(
                    "perf",
                    "curveHoleEdge",
                    "Teshiklar lentadan tashqarida — chetdan masofa va qatorlar sonini tekshiring",
                    "Отверстия вне ленты — проверьте расстояние от края и число рядов",
                )
            )

    c = catalog()
    belt = by_name(c["belts"], s["beltName"])
    nxt: State = dict(s)

    # ---------------------------- LENTA
    belt_joint = belt["joint"] if belt and belt.get("joint") is not None else 0
    joint = joint_mm(belt_joint, s["lockOn"], s["joinMethod"], s["weldType"], s["settings"])

    # ---------------------------- ULANISH
    if s["lockOn"] and s["joinMethod"] == "lock":
        lock = by_name(c["locks"], s["lockName"])
        thick = belt.get("thickness") if belt else None
        if lock and lock_fits(lock, thick) is False:
            r = lock_thickness_range(lock)
            issues.append(
                _warn(
                    "lock",
                    "lock",
                    f"Qulf {js_str(r['min'])}–{js_str(r['max'])} mm lentaga mo'ljallangan, "
                    f"tanlangan lenta {js_str(belt['thickness'])} mm",
                    f"Замок рассчитан на ленту {js_str(r['min'])}–{js_str(r['max'])} мм, "
                    f"выбранная лента {js_str(belt['thickness'])} мм",
                )
            )

    # ---------------------------- YO'NALTIRUVCHI
    spec = GUIDE_SPECS.get(s["guideName"]) if isinstance(s["guideName"], str) else None
    g_b = spec["B"] if spec else 0
    if s["guideOn"]:
        for place in ("bottom", "top"):
            top = place == "top"
            on = s["guideTopOn"] if top else s["guideBottomOn"]
            if not on:
                continue
            qty = s["guideTopQty"] if top else s["guideBottomQty"]
            inset = s["guideTopInset"] if top else s["guideBottomInset"]
            field = "guideTopInset" if top else "guideBottomInset"
            where = "ustidagi" if top else "ostidagi"
            where_ru = "сверху" if top else "снизу"
            if s["width"] <= 0:
                continue
            if g_b > s["width"]:
                issues.append(
                    _err(
                        "guide",
                        field,
                        f"Profil eni {js_str(g_b)} mm lenta eniga ({js_str(s['width'])} mm) sig'maydi",
                        f"Ширина профиля {js_str(g_b)} мм не помещается на ленту ({js_str(s['width'])} мм)",
                    )
                )
                continue
            if qty < 2:
                continue
            manual = s.get("guideTopPos") if top else s.get("guideBottomPos")
            if manual is not None and isinstance(manual, list) and len(manual) == qty:
                row = guide_side_of(s, place)
                xs = row["xs"] if row else []
                tight = any(i > 0 and u - xs[i - 1] < g_b - 0.05 for i, u in enumerate(xs))
                out = bool(xs) and (xs[0] < g_b / 2 - 0.05 or xs[-1] > s["width"] - g_b / 2 + 0.05)
                if tight:
                    issues.append(
                        _err(
                            "guide",
                            field,
                            f"Yo'naltiruvchilar ({where}) bir-birining ustiga chiqqan",
                            f"Направляющие ({where_ru}) накладываются друг на друга",
                        )
                    )
                elif out:
                    issues.append(
                        _err(
                            "guide",
                            field,
                            f"Yo'naltiruvchi ({where}) lenta qirrasidan chiqib ketgan",
                            f"Направляющая ({where_ru}) выходит за край ленты",
                        )
                    )
                continue
            if 2 * inset + g_b > s["width"]:
                tot = js_str(2 * inset + g_b)
                issues.append(
                    _err(
                        "guide",
                        field,
                        f"Chetdan qochish ({where}): 2 × {js_str(inset)} + {js_str(g_b)} = {tot} mm "
                        f"> lenta eni {js_str(s['width'])} mm",
                        f"Отступ от края ({where_ru}): 2 × {js_str(inset)} + {js_str(g_b)} = {tot} мм "
                        f"> ширина ленты {js_str(s['width'])} мм",
                    )
                )
            elif inset < g_b / 2:
                issues.append(
                    _err(
                        "guide",
                        field,
                        f"Chetdan qochish ({where}) kamida {js_str(g_b / 2)} mm — profil qirradan chiqib ketadi",
                        f"Отступ от края ({where_ru}) не менее {js_str(g_b / 2)} мм — иначе профиль выходит за край",
                    )
                )
        if not s["guideBottomOn"] and not s["guideTopOn"]:
            issues.append(
                _err(
                    "guide",
                    "guideBottomOn",
                    "Kamida bitta tomonni tanlang (ostidan yoki ustidan)",
                    "Выберите хотя бы одну сторону (снизу или сверху)",
                )
            )

    # ---------------------------- KO'NDALANG PROFIL
    cross_max = cross_max_length_for(s)
    cross_seg = cross_max_segment(cross_max, s["crossParts"], s["crossGap"])
    segs = fit_cross_segs(s["crossSegs"], cross_free(s)) if s["crossOn"] and s.get("crossSegs") else None
    if segs:
        nxt["crossSegs"] = segs
        nxt["crossParts"] = len(segs)
        nxt["crossLen"] = sum(b - a for a, b in segs) / len(segs)
    elif s["crossOn"]:
        nxt["crossSegs"] = None
        a_in, b_in = 0.0, s["width"]
        for band in gofro_bands(s):
            if band["side"] == "left":
                a_in = max(a_in, band["from"] + SIDEWALL_SPEC["width"])
            else:
                b_in = min(b_in, band["to"] - SIDEWALL_SPEC["width"])
        split = []
        if cross_max <= 0 and s["width"] > 0:
            split = [[a, b] for a, b in cross_free(s) if b - a >= 20 and (a + b) / 2 > a_in and (a + b) / 2 < b_in]
        if split:
            nxt["crossSegs"] = split
            nxt["crossParts"] = len(split)
            nxt["crossLen"] = sum(b - a for a, b in split) / len(split)
            issues.append(
                _warn(
                    "cross",
                    "crossLen",
                    f"Markazda ustidagi yo'naltiruvchi — ko'ndalang profil {len(split)} bo'lakka bo'lindi",
                    f"В центре верхняя направляющая — поперечный профиль разделён на {len(split)} части",
                )
            )
        elif cross_max <= 0 and s["width"] > 0:
            issues.append(
                _err(
                    "cross",
                    "crossLen",
                    "Ko'ndalang profilga joy yo'q — ustidagi yo'naltiruvchi markazni egallagan",
                    "Нет места для поперечного профиля — центр занят верхней направляющей",
                )
            )
        elif cross_seg <= 0 and s["width"] > 0:
            p1 = uzs(s["crossParts"] - 1)
            gp = uzs(s["crossGap"])
            issues.append(
                _err(
                    "cross",
                    "crossGap",
                    f"Tirqishlar ({p1} × {gp} mm) butun joyni egallagan — bo'lakka uzunlik qolmadi",
                    f"Зазоры ({p1} × {gp} мм) занимают всё место — на отрезки длины не осталось",
                )
            )
        elif s["crossLenAuto"]:
            nxt["crossLen"] = cross_seg
        elif s["crossLen"] > cross_seg and (fit_gap := _wall_gap_for_len(s)) is not None:
            # so'ralgan uzunlik gofra devorigacha zazorni (minimal 10 mm gacha) kamaytirsa sig'adi —
            # uzunlik kesilmaydi, zazor kamayadi (egasi: "270 emas 300 qil" — 2026-11-12)
            old = s.get("crossWallGap")
            old = CROSS_TO_SIDEWALL_GAP if old is None else old
            nxt["crossWallGap"] = fit_gap
            issues.append(
                _warn(
                    "cross",
                    "crossWallGap",
                    f"Profil {js_str(s['crossLen'])} mm sig'ishi uchun gofra devorigacha zazor "
                    f"{js_str(old)} → {js_str(fit_gap)} mm qilindi",
                    f"Чтобы профиль {js_str(s['crossLen'])} мм поместился, зазор до стенки гофры "
                    f"{js_str(old)} → {js_str(fit_gap)} мм",
                )
            )
        elif s["crossLen"] > cross_seg:
            nxt["crossLen"] = cross_seg
            ln = js_str(s["crossLen"])
            if s["crossParts"] > 1:
                seg = js_str(jround(cross_seg))
                msg = f"Bo'lak uzunligi {ln} mm maksimaldan katta — hisobda va chizmada {seg} mm ishlatildi"
                ru = f"Длина отрезка {ln} мм больше максимума — в расчёте и чертеже {seg} мм"
            else:
                mx = js_str(cross_max)
                msg = f"Uzunlik {ln} mm maksimaldan katta — hisobda va chizmada {mx} mm ishlatildi"
                ru = f"Длина {ln} мм больше максимума — в расчёте и чертеже {mx} мм"
                mn = cross_max_length_for({**s, "crossWallGap": CROSS_TO_SIDEWALL_MIN}) if gofro_bands(s) else cross_max
                if mn > cross_max + 0.5:
                    msg += f" (gofra devorigacha zazor {CROSS_TO_SIDEWALL_MIN} mm bo'lsa — {js_str(mn)} mm gacha)"
                    ru += f" (при зазоре до стенки {CROSS_TO_SIDEWALL_MIN} мм — до {js_str(mn)} мм)"
            issues.append(_warn("cross", "crossLen", msg, ru))

    cross_pos = normalize_positions(s["crossPos"], s["length"])
    nxt["crossPos"] = cross_pos
    foot_spec = cleat_spec_for(s["crossName"]) if s["crossOn"] else None
    cross_foot = foot_spec["B"] if foot_spec else 0
    if cross_foot > 0 and len(cross_pos) > 1:
        hits = sum(1 for i in range(1, len(cross_pos)) if cross_pos[i] - cross_pos[i - 1] < cross_foot)
        if hits > 0:
            issues.append(
                _err(
                    "cross",
                    "crossPos",
                    f"{hits} ta ko'ndalang profil bir-birining ustiga chiqqan — markazlar orasi kamida "
                    f"{js_str(cross_foot)} mm bo'lishi kerak",
                    f"{hits} поперечных профилей накладываются — расстояние между центрами не менее "
                    f"{js_str(cross_foot)} мм",
                )
            )
    cross_pitch = s["length"] / len(cross_pos) if cross_pos and s["length"] > 0 else 0

    # ---------------------------- GOFROBORT
    min_h = SIDEWALL_SPEC["minHeight"]
    if s["gofroOn"] and s["gofroHeight"] < min_h:
        nxt["gofroHeight"] = min_h
        issues.append(
            _warn(
                "gofro",
                "gofroHeight",
                f"Gofrobort balandligi eng kami {min_h} mm — hisobda va chizmada shu qiymat ishlatildi",
                f"Минимальная высота борта {min_h} мм — в расчёте и чертеже использовано это значение",
            )
        )
    if s["gofroOn"] and s["guideOn"] and s["guideTopOn"] and s["width"] > 0:
        bands = gofro_bands(s)
        row = guide_side_of(s, "top")
        for u in row["xs"] if row else []:
            if any(u + g_b / 2 > b["from"] and u - g_b / 2 < b["to"] for b in bands):
                issues.append(
                    _warn(
                        "guide",
                        "guideTopInset",
                        "Ustidagi yo'naltiruvchi gofrobort bandiga tushadi — uni gofradan tashqariga suring",
                        "Верхняя направляющая попадает на полосу борта — сдвиньте её за борт",
                    )
                )
                break

    # ---------------------------- PERFORATSIYA
    if s["perfOn"] and not is_curve(s) and s["width"] > 0 and s["length"] > 0 and s["perfDia"] > 0:
        layout = perf_layout_for(s)
        if s["perfGrid"] and s["perfAlign"] and not perf_alignment(s):
            info = perf_align_info(s)
            issues.append(
                _warn(
                    "perf",
                    "perfAlign",
                    "Profillar oralig'iga moslab bo'lmaydi — ko'ndalang profillar teng qadamda emas (kamida 2 ta kerak)"
                    if not info
                    else "Profillar orasiga teshik sig'maydi — oraliq juda tor",
                    "Нельзя выровнять по профилям — поперечные профили стоят не с равным шагом (нужно минимум 2)"
                    if not info
                    else "Между профилями отверстие не помещается — слишком узкий шаг",
                )
            )
        if layout and s["perfGrid"]:
            nxt["perfQty"] = layout["count"]
            r = layout["dia"] / 2
            last_g = layout["groups"][-1] if layout["groups"] else 0
            right = last_g + layout["edge"] + (layout["cols"] - 1) * layout["pitch"]
            group_gap = layout["groups"][1] - layout["groups"][0] if len(layout["groups"]) > 1 else INF
            end = layout["start"] + (layout["rows"] - 1) * layout["pitchL"]
            if layout["edge"] - r < 0 or right + r > s["width"]:
                issues.append(
                    _err(
                        "perf",
                        "perfCols",
                        "Teshiklar lenta enidan chiqib ketgan — guruhlar/ustunlar sonini, orasini yoki chetdan "
                        "masofani kamaytiring",
                        "Отверстия выходят за ширину ленты — уменьшите число групп/столбцов, шаг или отступ",
                    )
                )
            elif group_gap < (layout["cols"] - 1) * layout["pitch"] + layout["dia"]:
                issues.append(
                    _err(
                        "perf",
                        "perfGroupPitch",
                        "Teshiklar guruhlari bir-birining ustiga chiqqan — guruhlar orasini oshiring",
                        "Группы отверстий накладываются — увеличьте расстояние между группами",
                    )
                )
            elif layout["start"] - r < 0 or end + r > s["length"]:
                issues.append(
                    _err(
                        "perf",
                        "perfRows",
                        "Teshiklar lenta uzunligidan chiqib ketgan",
                        "Отверстия выходят за длину ленты",
                    )
                )
            else:
                bands = gofro_bands(s)
                us = list(dict.fromkeys(h["u"] for h in perf_hole_points(layout, s["length"], s["width"], 20000)))
                if any(any(u + r > bd["from"] and u - r < bd["to"] for u in us) for bd in bands):
                    issues.append(
                        _warn(
                            "perf",
                            "perfEdge",
                            "Teshiklar gofrobort bandiga tushadi",
                            "Отверстия попадают на полосу борта",
                        )
                    )
        elif layout and layout["count"] != s["perfQty"]:
            nxt["perfQty"] = layout["count"]
            cnt = js_str(layout["count"])
            issues.append(
                _warn(
                    "perf",
                    "perfQty",
                    f"Joylashuvga {cnt} ta teshik sig'adi — hisobda va chizmada shu son ishlatildi "
                    f"({js_str(s['perfQty'])} emas)",
                    f"Помещается {cnt} отверстий — в расчёте и чертеже использовано это число "
                    f"(не {js_str(s['perfQty'])})",
                )
            )

    issues += plausibility_issues(raw)  # D9 (09_divergences.md) — yangi, LentaCUD'da yo'q
    issues += hard_limit_issues(raw)  # D13 — bloklovchi, eng oxirida
    return {
        "state": nxt,
        "joint": joint,
        "crossMax": cross_max,
        "crossSeg": cross_seg,
        "crossPitch": cross_pitch,
        "issues": issues,
        "blocked": any(i["level"] == "error" for i in issues),
    }


def _wall_gap_for_len(s: dict[str, Any]) -> float | None:
    """Bitta bo'lakli ko'ndalang profil so'ralgan uzunlikka sig'ishi uchun gofra devorigacha eng katta zazor
    (butun mm, minimal CROSS_TO_SIDEWALL_MIN gacha). Zazor kamaytirib ham sig'masa yoki gofra bo'lmasa — None."""
    if s["crossParts"] != 1 or not gofro_bands(s):
        return None
    cur = s.get("crossWallGap")
    cur = CROSS_TO_SIDEWALL_GAP if cur is None else cur
    g = int(cur)
    while g >= CROSS_TO_SIDEWALL_MIN:
        if g < cur and cross_max_length_for({**s, "crossWallGap": g}) >= s["crossLen"] - 1e-6:
            return float(g)
        g -= 1
    return None
