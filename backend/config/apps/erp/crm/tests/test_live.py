"""CRM Telegram WebSocket: kirish (sessiya cookie), Origin tekshiruvi, huquqsizni yopish."""

import pytest
from django.conf import settings

from config.apps.erp.crm import live
from config.apps.staff.models import User
from config.apps.staff.services import set_departments

pytestmark = pytest.mark.django_db  # transaction=True — migratsiya ma'lumotlarini (bosqichlar) tozalab yuborardi


def test_origin(settings):
    settings.CSRF_TRUSTED_ORIGINS = ["https://x.trycloudflare.com"]
    assert live.origin_ok({"host": "localhost:3000", "origin": "http://localhost:3000"})
    assert live.origin_ok({"host": "127.0.0.1:8000", "origin": "https://x.trycloudflare.com"})
    assert live.origin_ok({"host": "127.0.0.1:8000", "x-forwarded-host": "a.b", "origin": "https://a.b"})
    assert not live.origin_ok({"host": "localhost:3000", "origin": "https://evil.example"})


def test_sessiya_bilan_foydalanuvchi(client, depts):
    seller = User.objects.create_user(201, "Sotuvchi", "employee")
    set_departments(seller, [depts["sotuv"].key])
    client.force_login(seller)
    cookie = f"{settings.SESSION_COOKIE_NAME}={client.cookies[settings.SESSION_COOKIE_NAME].value}"
    assert live._user_sync(cookie, "") == {"tg_id": 201, "head": False}
    other = User.objects.create_user(202, "Omborchi", "employee")  # CRM moduli yo'q
    client.force_login(other)
    cookie = f"{settings.SESSION_COOKIE_NAME}={client.cookies[settings.SESSION_COOKIE_NAME].value}"
    assert live._user_sync(cookie, "") is None
    assert live._user_sync("", "") is None


@pytest.mark.asyncio
async def test_kirmaganni_yopadi():
    sent: list[dict] = []
    msgs = iter([{"type": "websocket.connect"}])

    async def receive():
        return next(msgs)

    async def send(m):
        sent.append(m)

    scope = {
        "type": "websocket",
        "path": "/app/api/erp/crm/tg/ws/",
        "headers": [(b"host", b"localhost")],
        "query_string": b"",
    }
    await live.wrap(None)(scope, receive, send)
    assert sent == [{"type": "websocket.close", "code": 4403}]
    sent.clear()
    msgs = iter([{"type": "websocket.connect"}])
    await live.wrap(None)({**scope, "path": "/boshqa"}, receive, send)
    assert sent == [{"type": "websocket.close", "code": 4404}]
