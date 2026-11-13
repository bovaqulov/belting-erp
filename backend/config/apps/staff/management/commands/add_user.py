from django.core.management.base import BaseCommand, CommandError

from config.apps.jarvis.models import Agent
from config.apps.staff.models import Role, User


class Command(BaseCommand):
    help = "Xodim qo'shish/yangilash: add_user <tg_id> --name 'Ism' --role owner --dept it --dept rahbariyat"

    def add_arguments(self, parser):
        parser.add_argument("tg_id", type=int)
        parser.add_argument("--name", default="")
        parser.add_argument("--username", default="")
        parser.add_argument("--role", default=Role.EMPLOYEE, choices=[r.value for r in Role])
        parser.add_argument("--dept", action="append", default=[], help="bo'lim agenti kaliti (bir necha marta)")

    def handle(self, *args, tg_id: int, name: str, username: str, role: str, dept: list[str], **opts):
        u, created = User.objects.get_or_create(tg_id=tg_id, defaults={"name": name, "role": role})
        u.name, u.role = name or u.name, role
        u.username = username or u.username
        u.save()
        if dept:
            found = list(Agent.objects.filter(key__in=dept, kind=Agent.Kind.DEPT))
            missing = set(dept) - {a.key for a in found}
            if missing:
                raise CommandError(f"Bo'lim topilmadi: {', '.join(sorted(missing))} (avval: manage.py seed_agents)")
            u.departments.set(found)
        self.stdout.write(
            f"{'Qoʻshildi' if created else 'Yangilandi'}: {u.name} ({u.role}) — {', '.join(u.dept_keys()) or 'bo‘limsiz'}"
        )
