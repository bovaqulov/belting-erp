"""Testlar: LLM o'rniga echo, Celery darhol (Redis'siz), Telegram yuborish yo'q."""

import pytest

from config.celery import app as celery_app


@pytest.fixture(autouse=True)
def _env(settings):
    settings.JARVIS_LLM = "echo"
    settings.TELEGRAM_BOT_TOKEN = ""
    settings.JARVIS_MAGIC_LOGIN = True
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True


@pytest.fixture
def depts(db):
    from config.apps.jarvis.models import Agent

    lead = Agent.objects.create(key="rahbariyat", kind="dept", name="Rahbariyat", persona="p" * 25, sees_all=True)
    it = Agent.objects.create(key="it", kind="dept", name="IT", persona="p" * 25, parent=lead)
    sotuv = Agent.objects.create(key="sotuv", kind="dept", name="Sotuv", persona="p" * 25, parent=lead)
    return {"rahbariyat": lead, "it": it, "sotuv": sotuv}


def _user(tg_id, role, *deps):
    from config.apps.staff.models import User
    from config.apps.staff.services import set_departments

    u = User.objects.create_user(tg_id, f"U{tg_id}", role)
    set_departments(u, [d.key for d in deps])  # bo'lim agentlari → staff.Department (kalit bo'yicha)
    return u


@pytest.fixture
def admin_client(client, depts):
    client.force_login(_user(1, "admin"))
    return client


@pytest.fixture
def make_user(depts):
    return _user
