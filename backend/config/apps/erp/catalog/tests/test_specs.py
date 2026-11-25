"""Texnik oilalar reestri: standart belgilari (ISO 5296 / 13050 / 17396 tishli, ISO 4184 klinli, ISO 9982 poliklinli,
ISO 14890 konveyer), hisoblar (qadam, tishlar soni, eni), analog kaliti (8M ≡ RPP8), TIF TN taklifi, tekshiruv va
frontend JSON (bitta manba)."""

import json
from pathlib import Path

import pytest
from django.conf import settings

from config.apps.erp.catalog import specs as S


def make(fam, **raw):
    f = S.BY_KEY[fam]
    spec, errs = S.clean(f, raw)
    assert not errs, errs
    return f, spec


@pytest.mark.parametrize(
    ("fam", "raw", "mark"),
    [
        ("timing", {"profile": "8m", "length": "1040", "width": 30}, "1040-8M-30"),
        ("timing", {"profile": "XL", "length": 270}, "270XL"),
        ("timing", {"profile": "H", "length": 540, "width": 25}, "540H 25mm"),
        ("timing", {"profile": "AT10", "length": "610,0", "material": "pu"}, "610-AT10"),
        ("timing", {"profile": "T10", "material": "pu", "build": "open", "width": 25}, "T10-25 rulon"),
        ("sleeve", {"profile": "S8M", "length": 1200}, "1200-S8M"),
        ("vbelt", {"section": "spb", "length": 1650, "lref": "Lp"}, "SPB-1650 Lp"),
        ("vbelt", {"section": "B", "length": 2000, "lref": "Li", "bands": 3}, "3/B-2000 Li"),
        ("ribbed", {"profile": "PK", "ribs": 8, "length": 1795, "lref": "Le"}, "8PK-1795 Le"),
        (
            "conveyor",
            {"carcass": "EP", "strength": 400, "plies": 3, "top": 4, "bottom": 2, "grade": "Y"},
            "EP 400/3 4+2 Y",
        ),
        ("conveyor", {"carcass": "ST", "strength": 1000, "top": 8, "bottom": 5, "width": 1000}, "B1000 ST 1000 8+5"),
        ("light", {"series": "E 3/1 U0/U0", "food": True}, "E 3/1 U0/U0 FDA"),
        ("round", {"diameter": 5, "material": "PU", "hardness": 85}, "Ø5 PU 85ShA"),
        ("pulley", {"part": "taper", "code": "2012", "bore": 35}, "2012 Ø35"),
    ],
)
def test_designation(fam, raw, mark):
    f, spec = make(fam, **raw)
    assert S.designation(f, spec) == mark


def test_calc_teeth_and_width():
    f, spec = make("timing", profile="8M", length=1040)
    calc = {x["label"]: x["value"] for x in S.computed(f, spec)}
    assert calc["Qadam"] == "8 mm" and calc["Tishlar soni"] == "130"
    f, spec = make("timing", profile="XL", length=270)  # 27,0″ = 685,8 mm, qadam 5,08
    calc = {x["label"]: x["value"] for x in S.computed(f, spec)}
    assert calc["Qadam bo'yicha uzunlik"] == "685,8 mm" and calc["Tishlar soni"] == "135"
    f, spec = make("timing", profile="8M", length=1043)
    assert "butun emas" in {x["label"]: x["value"] for x in S.computed(f, spec)}["Tishlar soni"]
    f, spec = make("ribbed", profile="PK", ribs=8, length=1795)
    assert {x["label"]: x["value"] for x in S.computed(f, spec)}["Remen eni"] == "28,48 mm"


def test_match_key_compatible_profiles():
    f, a = make("timing", profile="8M", length=1040)
    _, b = make("timing", profile="RPP8", length=1040)
    _, c = make("timing", profile="S8M", length=1040)  # STD — boshqa tish shakli
    assert S.match_key(f, a) == S.match_key(f, b) != S.match_key(f, c)
    fs, sl = make("sleeve", profile="8M", length=1040)
    assert S.match_key(fs, sl) != S.match_key(f, a)  # rukav va tayyor remen — analog emas


@pytest.mark.parametrize(
    ("fam", "raw", "hs"),
    [
        ("timing", {"profile": "8M", "length": 1040}, "4010.35"),
        ("timing", {"profile": "8M", "length": 1800}, "4010.36"),
        ("timing", {"profile": "T10", "length": 900, "material": "pu"}, "3926.90"),
        ("vbelt", {"section": "SPB", "length": 1650}, "4010.32"),
        ("vbelt", {"section": "SPB", "length": 2000}, "4010.34"),
        ("ribbed", {"profile": "PK", "length": 1200}, "4010.31"),
        ("conveyor", {"carcass": "EP", "strength": 400}, "4010.12"),
        ("conveyor", {"carcass": "ST", "strength": 1000}, "4010.11"),
    ],
)
def test_hs_hint(fam, raw, hs):
    f, spec = make(fam, **raw)
    assert S.hs_hint(f, spec) == hs


def test_clean_errors():
    f = S.BY_KEY["vbelt"]
    _, errs = S.clean(f, {"section": "Q", "length": "x"})
    assert errs == {"section": "Kesim: ro'yxatdan tanlang", "length": "Uzunlik: son kiriting"}
    _, errs = S.clean(S.BY_KEY["timing"], {"profile": "8M"})
    assert errs == {"length": "Uzunlik kerak (ochiq rulondan tashqari)"}
    _, errs = S.clean(S.BY_KEY["ribbed"], {"profile": "PK", "length": 1200, "ribs": "2.5"})
    assert errs == {"ribs": "Qovurg'alar soni: butun son"}


def test_frontend_json_in_sync():
    """Forma JSON'i reestrdan: `manage.py catalog_specs --export-json` bilan yangilanadi."""
    path = Path(settings.BASE_DIR).parent / "frontend" / "src" / "erp" / "finance" / "lib" / "specs.json"
    assert json.loads(path.read_text()) == S.export()
