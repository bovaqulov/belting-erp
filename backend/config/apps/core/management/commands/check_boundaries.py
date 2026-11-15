"""Applar chegaralari (kelajakda mikroservislarga ajratish uchun). `scripts/check.sh` ichida ishlaydi.

Qoidalar:
1. Import: boshqa appga faqat `config.apps.<app>.services` (ochiq interfeys) va `config.apps.core` (umumiy yadro)
   orqali. `core` hech bir domen appini import qilmaydi. `if TYPE_CHECKING:` ichidagi (faqat tip) importlar,
   testlar va migratsiyalar hisobga olinmaydi.
2. Model: boshqa app modeliga ForeignKey/ManyToMany yo'q — ID bilan ishora qilinadi (CRM'dagi `owner_tg` kabi).
   Bugungi foydalanuvchiga (AUTH_USER_MODEL) bog'lanishlar — LEGACY ro'yxatida; yangisi qo'shilmaydi.
"""

from __future__ import annotations

import ast
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

ROOT = "config.apps"
CORE = f"{ROOT}.core"

# applararo FK — mavjudlari (foydalanuvchiga); ajratishda ID (tg_id) ga o'tkaziladi. Yangi qo'shmang.
LEGACY_FK = {
    "core.LoginToken.user",
    "memory.Fact.created_by",
    "knowledge.Doc.created_by",
    "jarvis.Agent.owner",
    "jarvis.AgentSchedule.created_by",
    "jarvis.AgentTask.created_by",
    "jarvis.AgentRun.user",
    "jarvis.ChatSession.user",
    "erp_marketplace.Log.actor",
}


def _app_modules() -> list[str]:
    return sorted(c.name for c in apps.get_app_configs() if c.name.startswith(f"{ROOT}."))


def _owner(module: str, names: list[str]) -> str | None:
    """Modul qaysi appga tegishli (eng uzun mos prefiks)."""
    best = [n for n in names if module == n or module.startswith(n + ".")]
    return max(best, key=len) if best else None


def _type_checking(node: ast.If) -> bool:
    t = node.test
    return (isinstance(t, ast.Name) and t.id == "TYPE_CHECKING") or (
        isinstance(t, ast.Attribute) and t.attr == "TYPE_CHECKING"
    )


def _imports(tree: ast.AST) -> list[tuple[int, str]]:
    """(qator, to'liq modul nomi) — TYPE_CHECKING bloklarisiz. `from X import y` → X.y ham (y modul bo'lishi mumkin)."""
    out: list[tuple[int, str]] = []

    def walk(node: ast.AST) -> None:
        for ch in ast.iter_child_nodes(node):
            if isinstance(ch, ast.If) and _type_checking(ch):
                for x in ch.orelse:
                    walk(x)
                continue
            if isinstance(ch, ast.Import):
                out.extend((ch.lineno, a.name) for a in ch.names)
            elif isinstance(ch, ast.ImportFrom) and ch.module and ch.level == 0:
                out.extend((ch.lineno, f"{ch.module}.{a.name}") for a in ch.names)
            walk(ch)

    walk(tree)
    return out


def import_violations(base: Path) -> list[str]:
    names = _app_modules()
    bad = []
    for path in sorted((base / "config" / "apps").rglob("*.py")):
        rel = path.relative_to(base)
        if {"tests", "migrations"} & set(rel.parts):
            continue
        module = ".".join(rel.with_suffix("").parts)
        src = _owner(module, names)
        if src is None:
            continue
        for line, target in _imports(ast.parse(path.read_text(), str(path))):
            dst = _owner(target, names)
            if dst is None or dst == src:
                continue
            rest = target[len(dst) + 1 :]
            if src == CORE:
                bad.append(f"{rel}:{line}: core domen appini import qilmaydi → {target}")
            elif dst != CORE and rest.split(".")[0] != "services":
                bad.append(f"{rel}:{line}: {dst} ga faqat {dst}.services orqali → {target}")
    return bad


def fk_violations() -> list[str]:
    names = set(_app_modules())
    bad = []
    for model in apps.get_models():
        app = model._meta.app_config
        if app.name not in names:
            continue
        for f in model._meta.get_fields():
            if not (f.is_relation and getattr(f, "concrete", False)) or f.related_model is None:
                continue
            other = f.related_model._meta.app_config  # type: ignore[union-attr]
            key = f"{app.label}.{model.__name__}.{f.name}"
            if other.label != app.label and key not in LEGACY_FK:
                target = f.related_model._meta.label  # type: ignore[union-attr]
                hint = " (foydalanuvchi — tg_id bilan)" if target == settings.AUTH_USER_MODEL else ""
                bad.append(f"{key} → {target}: boshqa app modeliga FK o'rniga ID saqlang{hint}")
    return bad


class Command(BaseCommand):
    help = "Applar chegaralarini tekshirish: importlar faqat <app>.services/core orqali, applararo FK yo'q."

    def handle(self, *args, **opts):
        bad = import_violations(Path(settings.BASE_DIR)) + fk_violations()
        if bad:
            raise CommandError("Chegara buzildi:\n  " + "\n  ".join(bad))
        self.stdout.write("Chegaralar toza.")
