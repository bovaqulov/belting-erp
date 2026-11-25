"""LLM'siz (regex) zaxira tahlil: LLM ishlamasa yoki vaqti tugasa shu yo'l ishlaydi — xatosi jim noto'g'ri narx beradi."""

from __future__ import annotations

import pytest

from config.apps.conveyor.lenta.parse import fallback_parse


def P(text: str) -> tuple[dict, dict]:
    patch, helpers, _notes, _unknown = fallback_parse(text)
    return patch, helpers


@pytest.mark.parametrize(
    "text,width,length",
    [
        ("U13 800x12000 metraj", 800, 12000),  # "metraj" — ulanish turi, metr birligi emas (x1000 bo'lardi)
        ("eni 800 uzunligi 12000 metraj", 800, 12000),
        ("800x12000 mexanik qulf", 800, 12000),
        ("800х12000 материал ПВХ", 800, 12000),
        ("800x12 500 mm", 800, 12500),  # minglik bo'shliq bilan
        ("eni 800, uzunligi 8 500 mm", 800, 8500),
        ("1 200 x 12000", 1200, 12000),
        ("800x12 m", 800, 12000),
        ("uzunligi 12 metr, eni 800", 800, 12000),
    ],
)
def test_sizes(text, width, length):
    p, _ = P(text)
    assert (p.get("width"), p.get("length")) == (width, length)


@pytest.mark.parametrize(
    "text,pitch",
    [
        ("800x12000 L50 profil har 300 mm", 300),
        ("800x12000 L50 profil har 30 sm", 300),
        ("800x12000 L50 profil har 1 m da", 1000),  # avval 1 mm deb olinardi -> 12000 ta profil
        ("800x12000 L50 profil har 0,5 metrda", 500),
    ],
)
def test_cross_pitch_units(text, pitch):
    p, h = P(text)
    if not p.get("crossOn"):
        pytest.skip("profil katalogda topilmadi")
    assert h.get("crossPitch") == pitch


@pytest.mark.parametrize(
    "text,height",
    [
        ("800x12000 борт 60", 60),  # son kalit so'zdan keyin; uzunlik (12000) balandlik emas
        ("800x12000 gofra 80 mm", 80),
        ("гофроборт высотой 80 мм", 80),
        ("800x12000 ikki chetiga 50 mm gofra", 50),
    ],
)
def test_gofro_height(text, height):
    p, _ = P(text)
    assert p.get("gofroOn") and p.get("gofroHeight") == height


def test_gofro_sides_not_height():
    p, _ = P("800x12000 gofra 2 tomonga")
    assert p.get("gofroOn") and "gofroHeight" not in p
