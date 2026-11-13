"""Boshlang'ich bo'lim agentlari — eski jarvis departments.yaml dan (faqat o'qiladi). Qayta ishga tushirsa — yangilaydi.

Daraxt: sees_all bo'lim (Rahbariyat) eng yuqorida, qolganlari uning ostida (bugungi org chart). access → scopes.
"""

from pathlib import Path

import yaml
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from config.apps.jarvis.constants import MODELS, SCOPE_AREAS, SCOPE_LEVELS, TOOLS
from config.apps.jarvis.models import Agent

DEFAULT_YAML = settings.BASE_DIR.parent.parent / "jarvis" / "backend" / "departments.yaml"


class Command(BaseCommand):
    help = "departments.yaml dan bo'lim agentlarini yaratish/yangilash"

    def add_arguments(self, parser):
        parser.add_argument("--yaml", dest="yaml_path", default=str(DEFAULT_YAML))

    @transaction.atomic
    def handle(self, *args, yaml_path: str, **opts):
        path = Path(yaml_path)
        if not path.is_file():
            raise CommandError(f"Fayl topilmadi: {path}")
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        d = raw.get("defaults", {})
        depts = raw["departments"]
        lead = next((k for k, v in depts.items() if v.get("sees_all")), None)
        made = {}
        for i, (key, v) in enumerate(depts.items()):
            model = v.get("model", d.get("model"))
            scopes = {a: lvl for a, lvl in (v.get("access") or {}).items() if a in SCOPE_AREAS and lvl in SCOPE_LEVELS}
            a, created = Agent.objects.update_or_create(
                key=key,
                defaults={
                    "kind": Agent.Kind.DEPT,
                    "name": v["name"],
                    "name_ru": v.get("name_ru", v["name"]),
                    "icon": v.get("icon", "folder"),
                    "color": v.get("color", "#8e8e93"),
                    "model": model if model in MODELS else MODELS[0],
                    "effort": v.get("effort", d.get("effort", "low")),
                    "persona": v["persona"].strip(),
                    "tools": [t for t in v.get("tools", d.get("tools", [])) if t in TOOLS],
                    "sees_all": bool(v.get("sees_all")),
                    "scopes": scopes,
                    "position": i,
                },
            )
            made[key] = a
            self.stdout.write(f"{'+' if created else '~'} {key}: {a.name}")
        for key, a in made.items():
            parent = None if (a.sees_all or key == lead or lead is None) else made[lead]
            if a.parent_id != (parent.pk if parent else None):
                a.parent = parent
                a.save(update_fields=["parent"])
        self.stdout.write(self.style.SUCCESS(f"{len(made)} bo'lim agenti tayyor ({path})"))
