"""1C nomlaridan texnik oila va ko'rsatkichlar (haqiqiy nomlar namunasi)."""

import pytest

from config.apps.erp.catalog import parse as P
from config.apps.erp.catalog import specs as S


@pytest.mark.parametrize(
    ("name", "hint", "fam", "mark", "brand"),
    [
        ("1040 HTD 8M NOVOBELT", "Зубчатые ремни", "timing", "1040-8M", "NOVOBELT"),
        ("1000 RPP8 ширина: 25 мм", "Зубчатые ремни", "timing", "1000-RPP8-25", ""),
        ("270 XL MEGADYNE", "", "timing", "270XL", "MEGADYNE"),
        ("1152 STS DS8M NB", "", "timing", "1152-DS8M", "NOVOBELT"),
        ("600 HTD D8M 25mm Dynabelt", "", "timing", "600-D8M-25", "DYNABELT"),
        ("MEGAPOWER2 BELT 30 АT10 610 STEEL CORD", "Зубчатые ремни", "timing", "610-AT10-30", ""),
        ("PU T10 1100*50 MM", "Зубчатые ремни", "timing", "1100-T10-50", ""),
        ("14GTR-3500-20MM", "", "timing", "3500-14GTR-20", ""),
        ("Рукав 1690 D5M ширина: 215мм", "Рукава Тип RPP5 / 5M", "sleeve", "1690-D5M", ""),
        ("Рукав 420 H MEGADYNE", "", "sleeve", "420H", "MEGADYNE"),
        ("SPB-2650 Lp PIX", "Клиновые ремни", "vbelt", "SPB-2650 Lp", "PIX"),
        ("C 4750 Lp MEGADYNE BASIC NR V BELT", "Клиновые ремни", "vbelt", "C-4750 Lp", "MEGADYNE"),
        ("АА 160 Lw REXBELT нал", "Клиновые ремни", "vbelt", "AA-160 Lw", "REXBELT"),
        ("PV BELT 6 PJ 1780 MEGADYNE", "Поликлиновые ремни", "ribbed", "6PJ-1780", "MEGADYNE"),
        ("10PJ-838 Le PIX", "", "ribbed", "10PJ-838 Le", "PIX"),
        ("Круглый ремень - 5 мм (Smooth White) - M/NB", "", "round", "Ø5 PU", ""),
        ("Лента конвейерная EP-400/3", "", "conveyor", "EP 400/3", ""),
        ("NB/F21/P25-25N FDA", "Материалы для конвейерных лент", "light", "F21/P25-25N FDA", ""),
        ("Зездочка тип XP254SQ40Z18-PA", "", "modular", "XP254SQ40Z18-PA", ""),
        ("SW30-WHITE H40mm - M/NB", "", "profile", "SW30-WHITE H40mm", ""),
    ],
)
def test_parse(name, hint, fam, mark, brand):
    p = P.parse(name, hint)
    assert p is not None
    f, spec, errs = P.to_spec(p)
    assert not errs and f.key == fam and S.designation(f, spec) == mark and p.brand == brand


@pytest.mark.parametrize("name", ["Клей - K2000 500 гр", "Резинотканевая лента 2-650", "PIX ANGLE GAUGE"])
def test_unknown(name):
    assert P.parse(name) is None
