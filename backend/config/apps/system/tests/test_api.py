"""Tizim holati: faqat ega/admin; log — nom tekshiruvi, LOG_DIR'dan chiqmaydi, tokenlar yashiriladi."""

import pytest

pytestmark = pytest.mark.django_db


@pytest.fixture
def logs(tmp_path, settings):
    settings.LOG_DIR = tmp_path
    settings.JARVIS_PUBLIC_URL = ""
    settings.CELERY_TASK_ALWAYS_EAGER = True  # ping o'rniga log yoshi
    (tmp_path / "celery-worker.log").write_text("ok\nbot 123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawQ yuborildi\n")
    return tmp_path


def test_status_and_log(admin_client, logs):
    s = admin_client.get("/app/api/system/status").json()
    assert s["db"]["ok"] and s["worker"]["ok"] and s["public"]["ok"] is False
    assert [x["name"] for x in s["logs"]] == ["celery-worker.log"]
    r = admin_client.get("/app/api/system/log", {"name": "celery-worker.log"}).json()
    assert r["lines"][-1] == "bot <BOT_TOKEN> yuborildi"
    assert admin_client.get("/app/api/system/log", {"name": "../x.log"}).status_code == 400
    assert admin_client.get("/app/api/system/log", {"name": "yoq.log"}).status_code == 404


def test_only_admin(client, make_user, logs):
    client.force_login(make_user(5, "employee"))
    assert client.get("/app/api/system/status").status_code == 403
