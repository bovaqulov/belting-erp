"""Narx formulalari (Excel nusxasi) — `lib/calc.ts` ekvivalenti. Sof funksiyalar.

Katalog narxlari faqat shu yerda ishlatiladi; natija — qatorlar (UZS) va jami.
"""

from __future__ import annotations

from typing import Any

from ._js import is_finite, jceil, jfloor, jmax, jmin, jround, js_str
from .catalog import catalog
from .format import n2, n4

JOINT_CASES = ["lock", "meter", "install", "weldZinali", "weldOddiy", "weld60"]

JOINT_CASE_LABEL = {
    "lock": "Mexanik qulf",
    "meter": "Metrajom",
    "install": "O'rnatib berish",
    "weldZinali": "Ulab berish · zinali",
    "weldOddiy": "Ulab berish · oddiy",
    "weld60": "Ulab berish · 60°",
}

JOINT_CASE_LABEL_RU = {
    "lock": "Механический замок",
    "meter": "Метраж",
    "install": "Установка",
    "weldZinali": "Стыковка · ступенчатая",
    "weldOddiy": "Стыковка · простая",
    "weld60": "Стыковка · 60°",
}

# Gofra narxi hisoblanadigan eng kichik balandlik, mm
GOFRO_BILLED_MIN = 40


def default_settings() -> dict[str, Any]:
    """Boshlang'ich sozlamalar (kurs, QQS %, xizmatlar katalogdan)."""
    c = catalog()
    return {
        "rate": c["rate"],
        "vat": c["vat"] * 100,
        "discount": 0,
        "serviceGuide": c["services"]["guide"],
        "serviceCross": c["services"]["cross"],
        "serviceGofro": c["services"]["gofro"],
        "beltRoundPlus1000": True,
        "jointFactor": {"lock": 0, "meter": 0, "install": 1, "weldZinali": 1, "weldOddiy": 1, "weld60": 1},
    }


def _nearly(x: float) -> float:
    return jround(x * 1e9) / 1e9


def round_up_to(x: float, step: float) -> float:
    """Excel ROUNDUP/CEILING: `step` ga yuqoriga (1e-9 gacha tozalab)."""
    if not is_finite(x) or step <= 0:
        return 0
    return jceil(_nearly(x / step)) * step


def joint_case_of(method: str, weld_type: str) -> str:
    """Ulanish usuli + ulab berish turi -> zapas kaliti."""
    if method != "weld":
        return method
    return "weldZinali" if weld_type == "zinali" else "weld60" if weld_type == "60" else "weldOddiy"


def joint_mm(belt_joint: float, enabled: bool, method: str, weld_type: str, s: dict[str, Any]) -> float:
    """Lentaga qo'shiladigan ulash zapasi, mm."""
    if not enabled or belt_joint <= 0:
        return 0
    f = s["jointFactor"].get(joint_case_of(method, weld_type))
    if f is None:
        f = 0
    return jround(belt_joint * jmax(0, f))


def _row(label: str, ru: str, value: str) -> dict[str, str]:
    return {"label": label, "ru": ru, "value": value}


def calc_belt(
    belt: dict[str, Any] | None, width_mm: float, length_mm: float, s: dict[str, Any], joint: float = 0
) -> dict[str, Any]:
    """Lenta narxi."""
    details: list[dict[str, str]] = []
    if not belt or width_mm <= 0 or length_mm <= 0:
        return {"key": "belt", "total": 0, "details": details}
    rounded_width = round_up_to(width_mm, 50)
    area = (rounded_width * (length_mm + joint)) / 1_000_000
    small = 50 if area <= 0.5 else 20 if area <= 1 else 0
    unit_usd = round_up_to(belt["base"] * (1 + belt["zapas"] / 100), 1)
    total_pct = belt["markup"] + small
    usd = unit_usd * area * (1 + total_pct / 100)
    uzs_v = usd * s["rate"]
    plus = 1000 if s["beltRoundPlus1000"] else 0
    total = round_up_to(uzs_v, 10_000) if belt["rounding"] == "ceil10000" else round_up_to(uzs_v, 1000) + plus
    if belt["rounding"] == "ceil10000":
        rnd = "10 000 so'mgacha"
    elif plus:
        rnd = "1 000 so'mgacha + 1 000"
    else:
        rnd = "1 000 so'mgacha"
    details += [
        _row("Hisobga olingan eni (CEILING 50 mm)", "Учтённая ширина (CEILING 50 мм)", f"{n2(rounded_width)} mm"),
        _row("Ulash uchun zapas", "Запас на соединение", f"+{n2(joint)} mm" if joint > 0 else "yo'q (ulanmaydi)"),
        _row("Maydon", "Площадь", f"{n4(area)} m²"),
        _row("1 m² narxi (zapas bilan, yaxlitlangan)", "Цена 1 м² (с запасом, округл.)", f"${n2(unit_usd)}"),
        _row("Ustama", "Наценка", f"{n2(belt['markup'])}%" + (f" + kichik o'lcham {small}%" if small else "")),
        _row("Jami valyutada", "Итого в валюте", f"${n2(usd)}"),
        _row("Yaxlitlash", "Округление", rnd),
    ]
    return {"key": "belt", "total": total, "details": details}


def calc_lock(
    lock: dict[str, Any] | None, enabled: bool, length_mm: float, qty: float, install_price: float = 0
) -> dict[str, Any]:
    """Mexanik qulf narxi (eni bo'yicha metr × soni)."""
    details: list[dict[str, str]] = []
    if not lock or not enabled:
        return {"key": "lock", "total": 0, "details": details}
    install = jmax(0, install_price)
    ln = max(0, length_mm)
    material = lock["pricePerM"] * (ln / 1000) * qty
    total = round_up_to(material + install, 10_000)
    details += [
        _row("1 metr narxi", "Цена 1 метра", f"{n2(lock['pricePerM'])} so'm"),
        _row("Uzunlik × soni", "Длина × кол-во", f"{n2(ln)} mm × {js_str(qty)}"),
        _row("Qulf narxi", "Цена замка", f"{n2(material)} so'm"),
        _row("O'rnatib berish", "Установка", f"{n2(install)} so'm" if install > 0 else "kiritilmagan"),
        _row("Yaxlitlashdan oldin", "До округления", f"{n2(material + install)} so'm"),
    ]
    return {"key": "lock", "total": total, "details": details}


def calc_lock_tool(tool: dict[str, Any] | None, enabled: bool, qty: float) -> dict[str, Any]:
    """Asbob (dona hisobida)."""
    details: list[dict[str, str]] = []
    if not tool or not enabled:
        return {"key": "tool", "total": 0, "details": details}
    n = jmax(0, jfloor(qty))
    total = round_up_to(tool["pricePerM"] * n, 10_000)
    details += [
        _row("Asbob", "Инструмент", tool["name"]),
        _row("1 dona narxi", "Цена 1 шт", f"{n2(tool['pricePerM'])} so'm"),
        _row("Soni", "Количество", f"{js_str(n)} dona"),
    ]
    return {"key": "tool", "total": total, "details": details}


def calc_install(enabled: bool, price: float) -> dict[str, Any]:
    """Faqat o'rnatish xizmati (yaxlitlanmaydi)."""
    details: list[dict[str, str]] = []
    p = jmax(0, price)
    if not enabled or p <= 0:
        return {"key": "lock", "total": 0, "details": details}
    details.append(_row("O'rnatish xizmati", "Услуга установки", f"{n2(p)} so'm"))
    return {"key": "lock", "total": p, "details": details}


def calc_guide(
    p: dict[str, Any] | None, enabled: bool, length_mm: float, qty: float, s: dict[str, Any]
) -> dict[str, Any]:
    """Yo'naltiruvchi profil narxi."""
    details: list[dict[str, str]] = []
    if not p or not enabled:
        return {"key": "guide", "total": 0, "details": details}
    ln = max(0, length_mm)
    material = p["pricePerM"] * (ln / 1000) * qty * s["rate"]
    service = (ln / 1000) * s["serviceGuide"] * qty
    total = round_up_to(material + service, 10_000)
    details += [
        _row("1 metr narxi", "Цена 1 метра", f"${n2(p['pricePerM'])}"),
        _row("Uzunlik × soni", "Длина × кол-во", f"{n2(ln)} mm × {js_str(qty)}"),
        _row("Profil narxi", "Цена профиля", f"{n2(material)} so'm"),
        _row("Ishlov xizmati (1 m uchun)", "Обработка (за 1 м)", f"{n2(service)} so'm"),
        _row("Yaxlitlashdan oldin", "До округления", f"{n2(material + service)} so'm"),
    ]
    return {"key": "guide", "total": total, "details": details}


def calc_cross(
    p: dict[str, Any] | None, enabled: bool, length_mm: float, qty: float, s: dict[str, Any], has_belt: bool = True
) -> dict[str, Any]:
    """Ko'ndalang profil narxi (yaxlitlanmaydi)."""
    details: list[dict[str, str]] = []
    if not p or not enabled or not has_belt:
        return {"key": "cross", "total": 0, "details": details}
    ln = max(0, length_mm)
    material = p["pricePerM"] * (ln / 1000) * qty * s["rate"]
    service = s["serviceCross"] * qty
    total = material + service
    details += [
        _row("1 metr narxi", "Цена 1 метра", f"${n2(p['pricePerM'])}"),
        _row("Uzunlik × soni", "Длина × кол-во", f"{n2(ln)} mm × {js_str(qty)}"),
        _row("Profil narxi", "Цена профиля", f"{n2(material)} so'm"),
        _row("Ishlov xizmati (1 dona uchun)", "Обработка (за 1 шт)", f"{n2(service)} so'm"),
    ]
    return {"key": "cross", "total": total, "details": details}


def calc_gofro(
    p: dict[str, Any] | None, enabled: bool, belt_length_mm: float, qty: float, s: dict[str, Any], height_mm: float = 0
) -> dict[str, Any]:
    """Gofrobort narxi (maydon bo'yicha, 40 mm dan past — 40 kabi)."""
    details: list[dict[str, str]] = []
    if not p or not enabled:
        return {"key": "gofro", "total": 0, "details": details}
    belt_len = max(0, belt_length_mm)
    factor = p.get("lengthFactor") if p.get("lengthFactor") is not None else 3.2
    height = height_mm if height_mm > 0 else (p.get("height") if p.get("height") is not None else 0)
    billed = jmax(GOFRO_BILLED_MIN, height)
    developed = belt_len * factor
    area = (developed * billed) / 1_000_000 * qty
    material = p["pricePerM"] * area * s["rate"]
    service = (belt_len / 1000) * s["serviceGofro"] * qty
    total = material + service
    details += [
        _row("Lenta uzunligi", "Длина ленты", f"{n2(belt_len)} mm"),
        _row(
            f"Gofra yoyilgan uzunligi (×{js_str(factor)})",
            f"Развёрнутая длина борта (×{js_str(factor)})",
            f"{n2(developed)} mm",
        ),
        _row("Balandlik", "Высота", f"{n2(height)} mm"),
    ]
    if billed > height:
        details.append(
            _row("Hisobdagi balandlik", "Расчётная высота", f"{n2(billed)} mm ({GOFRO_BILLED_MIN} mm gacha bir xil)")
        )
    details += [
        _row("Maydon (soni bilan)", "Площадь (с кол-вом)", f"{n4(area)} m²"),
        _row("1 m² narxi", "Цена 1 м²", f"${n2(p['pricePerM'])}"),
        _row("Gofrobort narxi", "Цена борта", f"{n2(material)} so'm"),
        _row(f"Ishlov xizmati ({n2(qty)} tomon)", f"Обработка ({n2(qty)} стор.)", f"{n2(service)} so'm"),
    ]
    return {"key": "gofro", "total": total, "details": details}


def perf_tier_for(diameter_mm: float) -> dict[str, Any]:
    """Diametrga qarab narx guruhi: [1-9, 10-15, 16+]."""
    lst = catalog()["perforation"]
    if diameter_mm <= 0 or diameter_mm <= 9:
        return lst[0]
    if diameter_mm <= 15:
        return lst[1]
    return lst[2]


def calc_perf(enabled: bool, diameter_mm: float, qty: float, has_belt: bool = True) -> dict[str, Any]:
    """Perforatsiya narxi (dona)."""
    details: list[dict[str, str]] = []
    if not enabled or not has_belt:
        return {"key": "perf", "total": 0, "details": details}
    tier = perf_tier_for(diameter_mm)
    total = tier["pricePerPiece"] * qty
    details += [
        _row("Narx guruhi", "Ценовая группа", tier["name"]),
        _row("1 teshik narxi", "Цена 1 отверстия", f"{n2(tier['pricePerPiece'])} so'm"),
        _row("Soni", "Количество", f"{js_str(qty)} dona"),
    ]
    return {"key": "perf", "total": total, "details": details}


def calc_totals(lines: list[dict[str, Any]], s: dict[str, Any]) -> dict[str, float]:
    """Jami → Chegirma → QQS'siz → QQS → Yakuniy."""
    subtotal = 0
    for ln in lines:
        subtotal = subtotal + ln["total"]
    discount = subtotal * (jmin(100, jmax(0, s["discount"])) / 100)
    net = subtotal - discount
    vat = net * (jmax(0, s["vat"]) / 100)
    return {
        "subtotal": subtotal,
        "discountAmount": discount,
        "netAfterDiscount": net,
        "vatAmount": vat,
        "final": net + vat,
    }
