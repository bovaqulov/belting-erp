"""TelegramCRM tekshiruvi: `uv run python manage.py tgcrm_doctor` — prod'ga chiqarishdan oldin va muammo bo'lganda.

Xato bo'lsa — chiqish kodi 1 (skriptlarda ishlatish mumkin).
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from config.apps.tgcrm.health import checks

ICON = {"ok": "✓", "warn": "!", "error": "✗"}


class Command(BaseCommand):
    help = (
        "TelegramCRM sozlamalari va holatini tekshiradi (API, sessiya kaliti, Redis, shlyuz, ffmpeg, kesh, akkauntlar)"
    )

    def handle(self, *args, **opts) -> None:
        rows = checks()
        for r in rows:
            style = {"ok": self.style.SUCCESS, "warn": self.style.WARNING, "error": self.style.ERROR}[r["level"]]
            self.stdout.write(style(f"{ICON[r['level']]} {r['name']}: ") + r["detail"])
        errors = sum(r["level"] == "error" for r in rows)
        if errors:
            raise CommandError(f"{errors} ta xato.")
        self.stdout.write(self.style.SUCCESS("Hammasi joyida."))
