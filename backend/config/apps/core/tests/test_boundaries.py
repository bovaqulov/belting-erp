"""check_boundaries: importlar faqat <app>.services/core orqali; core domenga bog'lanmaydi; TYPE_CHECKING — mumkin."""

from config.apps.core.management.commands.check_boundaries import fk_violations, import_violations


def _put(base, rel, text):
    p = base / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)


def test_import_rules(tmp_path):
    _put(tmp_path, "config/apps/erp/crm/a.py", "from config.apps.staff.models import User\n")
    _put(
        tmp_path,
        "config/apps/erp/crm/b.py",
        "from config.apps.staff.services import User\nfrom config.apps.core.http import ok\n",
    )
    _put(
        tmp_path,
        "config/apps/erp/crm/c.py",
        "from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    from config.apps.staff.models import User\n",
    )
    _put(tmp_path, "config/apps/erp/crm/d.py", "from config.apps.staff import services, models\n")
    _put(tmp_path, "config/apps/core/e.py", "def f():\n    from config.apps.erp.crm.access import is_sales_head\n")
    _put(tmp_path, "config/apps/erp/crm/tests/test_x.py", "from config.apps.jarvis.models import Agent\n")
    bad = import_violations(tmp_path)
    assert len(bad) == 3, bad
    assert any("a.py:1" in b and "staff.models" in b for b in bad)
    assert any("d.py:1" in b and "staff.models" in b for b in bad)
    assert any("core/e.py:2" in b and "core domen" in b for b in bad)


def test_real_code_is_clean(settings):
    from pathlib import Path

    assert import_violations(Path(settings.BASE_DIR)) == []
    assert fk_violations() == []
