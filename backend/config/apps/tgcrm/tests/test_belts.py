"""AI yordamchi: remen belgisi tahlili (eski Jarvis testlaridagi misollar) va o'lcham mosligi."""

import pytest

from config.apps.tgcrm.belts import Spec, same_size
from config.apps.tgcrm.belts import parse as _parse


def parse(text: str) -> Spec:
    sp = _parse(text)
    assert sp is not None, text
    return sp


@pytest.mark.parametrize(
    "text,family,profile,length,extra",
    [
        ("SPB1650", "v", "SPB", 1650, {}),
        ("B 1450 Li", "v", "B", 1450, {"lstd": "li"}),
        ("Ремень B-1900 Lp PIX", "v", "B", 1900, {"lstd": "lp"}),
        ("B56", "v", "B", 1422, {"lstd": "li"}),  # dyuym
        ("17x1450", "v", "B", 1450, {}),
        ("Б-2000", "v", "B", 2000, {}),
        ("AVX13-1000", "v", "A", 1000, {"lstd": "la"}),
        ("8PK2553", "rib", "PK", 2553, {"ribs": 8}),
        ("PJ 610", "rib", "PJ", 610, {"ribs": 0}),
        ("500 5m", "timing", "5M", 500, {}),
        ("600-S8M-20", "timing", "S8M", 600, {"width": 20}),
        ("1600 8M 30", "timing", "8M", 1600, {"width": 30}),
        ("1000 STS S5M NOVOBELT", "timing", "S5M", 1000, {"width": 0}),
        ("1025 STS S5M 35mm", "timing", "S5M", 1025, {"width": 35}),
        ("10-TT5-6600", "timing", "TT5", 6600, {"width": 10}),
        ("1600 8M 10 ta", "timing", "8M", 1600, {"width": 0}),  # 10 ta — dona soni, kenglik emas
    ],
)
def test_parse(text, family, profile, length, extra):
    sp = parse(text)
    assert (sp.family, sp.profile, sp.length) == (family, profile, length)
    for k, v in extra.items():
        assert getattr(sp, k) == v


@pytest.mark.parametrize("text", ["salom", "konveyer lenta kerak", "narxi qancha?", "12 ta", ""])
def test_parse_none(text):
    assert _parse(text) is None


def test_labels():
    assert parse("PJ 610").label() == "PJ 610"
    assert parse("7PJ 610").label() == "7PJ 610"
    assert parse("600-S8M-20").label() == "600 S8M × 20 mm"
    assert parse("B 1450 Li").label() == "B 1450 Li"


def test_same_size():
    want = parse("B 1450")
    assert same_size(parse("Ремень B 1450 Lp MEGADYNE"), want)
    assert not same_size(parse("B 1500 Lp"), want)
    assert not same_size(parse("SPB 1450"), want)
    # Li 1450 ≈ Lp 1490 (B: +40) — Lp 1490 mos, Lp 1450 mos emas
    li = parse("B 1450 Li")
    assert same_size(parse("B 1490 Lp"), li)
    assert not same_size(parse("B 1450 Lp"), li)
    # poliklinli: qovurg'a soni farq qilsa — boshqa remen
    assert not same_size(parse("6PK2553"), parse("8PK2553"))
    assert same_size(parse("PK 2553"), parse("8PK2553"))  # 1C nomida qovurg'a yo'q — uzunlik bo'yicha
    # tishli: kenglik ikkalasida bo'lsa — mos bo'lsin
    assert not same_size(parse("1600 8M 20"), parse("1600 8M 30"))
    assert same_size(parse("1600-8M"), parse("1600 8M 30"))
    assert not same_size(Spec(), want)
