"""Differensial test: Python == TypeScript (golden: data/secret/lenta_golden.json).

Golden fayl `bash scripts/lenta_oracle/run.sh` bilan yasaladi; yo'q bo'lsa test o'tkazib yuboriladi.
Ataylab qilingan farqlar faqat `divergences.py` (docs/lenta/09_divergences.md) orqali.
"""

from __future__ import annotations

import json

import pytest
from django.conf import settings as _s

_ROOT = _s.BASE_DIR

from .divergences import apply_case, apply_func
from .oracle_py import first_diff, run_case, run_func

GOLDEN = _ROOT / "data" / "secret" / "lenta_golden.json"
_DATA = json.loads(GOLDEN.read_text(encoding="utf-8")) if GOLDEN.exists() else {"cases": [], "funcs": []}

pytestmark = pytest.mark.skipif(not GOLDEN.exists(), reason="golden fayl yo'q (scripts/lenta_oracle/run.sh)")


def _is_err(out: object) -> bool:
    return isinstance(out, dict) and "__error" in out


@pytest.mark.parametrize("i", range(len(_DATA["cases"])))
def test_case(i: int) -> None:
    c = _DATA["cases"][i]
    if _is_err(c["out"]):
        with pytest.raises(Exception):  # noqa: B017 — TS ham xato bergan
            run_case(c["raw"])
        return
    got = run_case(c["raw"])
    diff = first_diff(apply_case(c["out"], got), got)  # faqat 09_divergences.md dagi farqlar
    assert diff is None, f"case {i} raw={json.dumps(c['raw'], ensure_ascii=False)[:400]}\n{diff}"


@pytest.mark.parametrize("i", range(len(_DATA["funcs"])))
def test_func(i: int) -> None:
    c = _DATA["funcs"][i]
    if _is_err(c["out"]):
        with pytest.raises(Exception):  # noqa: B017 — TS ham xato bergan
            run_func(c["fn"], c["args"])
        return
    got = run_func(c["fn"], c["args"])
    diff = first_diff(apply_func(c["fn"], c["args"], c["out"], got), got)
    assert diff is None, f"{c['fn']}({json.dumps(c['args'], ensure_ascii=False)[:300]})\n{diff}"


def test_golden_size() -> None:
    assert len(_DATA["cases"]) >= 500


def test_divergence_registry_is_used() -> None:
    """D1 ro'yxati haqiqatan ishlaydi: golden'da perfEdge>0 avtomatik holatlar bor."""
    hit = [
        c
        for c in _DATA["cases"]
        if isinstance(c["out"], dict)
        and "__error" not in c["out"]
        and (c["out"]["drawing"].get("perf") or {}).get("layout")
        and c["out"]["drawing"]["perf"]["layout"].get("manualEdge")
        and not c["out"]["drawing"]["perf"]["layout"].get("grid")
    ]
    assert len(hit) >= 10
