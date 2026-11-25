"""AI yordamchini haqiqiy chatlarda quruq sinash: javob yozadi, lekin HECH NARSA yubormaydi va bazaga yozmaydi.

    manage.py tgcrm_ai_dryrun --account 3 --limit 10 [--days 7] [--peer 123] [--stock-max-age 999]

Tanlov: shaxsiy chatlar, oxirgi xabari mijozdan (javobsiz) va `--days` ichida. `--peer` — bitta chat (holatidan qat'i nazar).
"""

from __future__ import annotations

import time
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from config.apps.tgcrm import assistant, bizbot, stock
from config.apps.tgcrm.models import Account, Dialog, Message, PeerKind


class Command(BaseCommand):
    help = "AI yordamchi — quruq sinov (yubormaydi)"

    def add_arguments(self, parser):
        parser.add_argument("--account", type=int, required=True)
        parser.add_argument("--limit", type=int, default=10)
        parser.add_argument("--days", type=int, default=7)
        parser.add_argument("--peer", type=int)
        parser.add_argument(
            "--stock-max-age", type=int, help="1C qoldig'i eskirish chegarasi (soat) — faqat shu sinov uchun"
        )

    def handle(self, *args, **o):
        a = Account.objects.filter(pk=o["account"]).first()
        if a is None:
            raise CommandError("Akkaunt topilmadi.")
        if o["stock_max_age"]:
            settings.TGCRM_STOCK_MAX_AGE_H = o["stock_max_age"]
        self.stdout.write(f"Kanal: {bizbot.status(a.tg_user_id)['detail']} · 1C: {stock.source()}\n")
        qs = Dialog.objects.filter(account=a, peer__kind=PeerKind.USER, peer__is_self=False).select_related("peer")
        if o["peer"]:
            qs = qs.filter(peer__peer_id=o["peer"])
        else:
            qs = qs.filter(last_out=False, last_date__gte=timezone.now() - timedelta(days=o["days"])).order_by(
                "-last_date"
            )
        for d in qs[: o["limit"]]:
            last = Message.objects.filter(peer_id=d.peer_id, out=False).order_by("-msg_id").first()
            why = assistant.eligible(a, d, sandbox=True)  # AI o'chiq bo'lsa ham qolgan tekshiruvlar bilan sinaladi
            self.stdout.write(f"── {d.peer.title or d.peer.peer_id} (#{d.peer.peer_id})")
            self.stdout.write(f"   mijoz: {(last.text if last else '')[:300]}")
            if why:
                self.stdout.write(f"   o'tkazildi: {why}\n")
                continue
            t = time.time()
            try:
                text, actions = assistant.draft(a, d, dry=True)
            except Exception as e:
                self.stdout.write(f"   XATO: {e}\n")
                continue
            self.stdout.write(f"   AI ({time.time() - t:.1f} s): {text}")
            if actions:
                self.stdout.write(f"   amallar: {'; '.join(actions)}")
            self.stdout.write("")
