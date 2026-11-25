"""Bir varaqli ishlab chiqarish chizmasi: har lenta — 1 varaq; texnik talablar ish tartibi bo'yicha
(kesish → teshik → profil → ulash → nazorat); toleranslar faqat sozlamadan (o'ylab topilmaydi)."""

from __future__ import annotations

import json

import pytest

from config.apps.conveyor.lenta.catalog import available as catalog_available
from config.apps.conveyor.lenta.render import production as PR
from config.apps.conveyor.lenta.render import render_sheets, to_pdf

pytestmark = pytest.mark.skipif(not catalog_available(), reason="katalog yo'q (data/secret)")

PERF = {
    "width": 360,
    "length": 2380,
    "perfOn": True,
    "perfDia": 4,
    "lockOn": True,
    "joinMethod": "weld",
    "projectName": "Teshikli lenta",
    "author": "Muhammadali",
}
COMPLEX = {
    "width": 860,
    "length": 11500,
    "guideOn": True,
    "guideName": "DKC17-P (TOOTHED) - M/NB",
    "guideBottomOn": True,
    "guideBottomQty": 2,
    "guideBottomInset": 25,
    "crossOn": True,
    "crossName": "Профиль L 30 XT30-P (PETROL)",
    "crossLen": 560,
    "crossPos": [240, 480, 720, 960, 1200],
    "gofroOn": True,
    "gofroQty": 2,
    "perfOn": True,
    "perfDia": 12,
    "perfQty": 60,
    "lockOn": True,
    "joinMethod": "weld",
}


def _text(sh) -> str:
    return " ".join(" ".join(sh.texts).split())


@pytest.mark.parametrize("st", [{"width": 400, "length": 3000}, PERF, COMPLEX])
def test_single_sheet_with_steps(monkeypatch, st):
    monkeypatch.setattr(PR, "tolerances", lambda: {})
    sh = render_sheets(st, today="09.11.2026")
    assert [s.key for s in sh] == ["prod"] and sh[0].full and sh[0].pages == 1
    t = _text(sh[0])
    for want in (
        "Ishlab chiqarish chizmasi",
        "TEXNIK TALABLAR",
        "KESISH",
        "ULASH",
        "NAZORAT",
        "Ustidan ko'rinish",
        "Ko'ndalang kesim",
        "List 1 / 1",
    ):
        assert want in t, want
    order = [t.index(k) for k in ("KESISH", "ULASH", "NAZORAT")]
    assert order == sorted(order)
    assert to_pdf(sh)[:4] == b"%PDF"


def test_steps_content_perf_and_profiles(monkeypatch):
    monkeypatch.setattr(PR, "tolerances", lambda: {})
    t = _text(render_sheets(PERF, today="")[0])
    assert "Kesish o'lchami: 360 × 2 490 mm" in t and "+ 110 mm ulash zapasi" in t
    assert "TESHIK OCHISH" in t and "B — teshiklar joylashuvi" in t
    assert t.index("KESISH") < t.index("TESHIK OCHISH") < t.index("ULASH")
    assert "Toleranslar sozlanmagan" in t and "±" not in t  # o'ylab topilmaydi
    c = _text(render_sheets(COMPLEX, today="")[0])
    assert "PROFIL O'RNATISH" in c and c.index("TESHIK OCHISH") < c.index("PROFIL O'RNATISH") < c.index("ULASH")
    assert "Yo'naltiruvchi: DKC17-P" in c and "Ko'ndalang profil:" in c and "Gofrobort:" in c


def test_tolerances_from_settings(monkeypatch):
    monkeypatch.setattr(
        PR,
        "tolerances",
        lambda: {"width": "±1 mm", "length": "±0,5%", "hole_pos": "±0,5 mm", "hole_dia": "±0,2 mm", "profile": "±1 mm"},
    )
    t = _text(render_sheets(COMPLEX, today="")[0])
    assert "860 (±1 mm)" in t and "(±0,5%)" in t and "Ø12 (±0,2 mm)" in t and "Profil o'rni va qadami: ±1 mm" in t
    assert "Toleranslar sozlanmagan" not in t


def test_tolerances_setting(settings, tmp_path):
    settings.BASE_DIR = tmp_path
    if hasattr(settings, "LENTA_TOLERANCES"):
        del settings.LENTA_TOLERANCES
    assert PR.tolerances() == {}
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "lenta_tolerances.json").write_text(json.dumps({"width": "±1 mm", "length": " "}))
    assert PR.tolerances() == {"width": "±1 mm"}
    settings.LENTA_TOLERANCES = {"hole_dia": "±0,2 mm"}
    assert PR.tolerances() == {"hole_dia": "±0,2 mm"}


def test_single_guide_from_right_edge():
    """'profil ostida o'ng tomondan 25 mm' — yakka yo'naltiruvchi chap chetdan eni−25 da."""
    from config.apps.conveyor.lenta import parse as P

    notes, unk = [], []
    patch = P._coerce_fields({"guideOn": True, "guideBottomFromRight": 25}, unk)
    st = P.merge({"width": 360, "length": 2380}, patch, {}, notes, unk)
    assert st["guideBottomAt"] == 335 and st["guideBottomQty"] == 1 and st["guideBottomOn"] and not unk
    assert "guideBottomFromRight" not in st and any("o'ng chetdan 25" in n for n in notes)
    t = _text(render_sheets({**st, "guideName": "UDK8-W (TOOTHED) - Полиуретан"}, today="")[0])
    assert "chapdan 335 / o'ngdan 25 mm" in t and "335" in t
    # eni noma'lum — so'raladi
    unk2: list = []
    P.merge({"length": 2380}, P._coerce_fields({"guideOn": True, "guideBottomFromRight": 25}, unk2), {}, [], unk2)
    assert any("eni" in u for u in unk2)
