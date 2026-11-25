"""Audit jurnali: yozish servisi, ro'yxat (ism bilan, bo'lim filtri), ovozli xabar yo'li tekshiruvi, ruxsat."""

import pytest

from config.apps.audit import services as audit
from config.apps.audit.models import Event

pytestmark = pytest.mark.django_db


def test_list_and_filter(admin_client):
    audit.log("answer", 1, "sotuv", detail={"tools": ["crm"], "ok": True})
    audit.log("tool", None, "it", detail="x" * 9000)
    rows = admin_client.get("/app/api/audit").json()["audit"]
    assert [r["event"] for r in rows] == ["tool", "answer"]  # yangisi oldin
    assert rows[1]["name"] == "U1" and '"crm"' in rows[1]["detail"]
    assert len(rows[0]["detail"]) == 8000  # qisqartirilgan
    assert [r["dept"] for r in admin_client.get("/app/api/audit", {"dept": "it"}).json()["audit"]] == ["it"]


def test_voice(admin_client, tmp_path, settings):
    settings.VOICES_DIR = tmp_path
    (tmp_path / "a").mkdir()
    (tmp_path / "a" / "v1.ogg").write_bytes(b"OggS")
    ok = Event.objects.create(event="voice", detail='{"file": "a/v1", "duration": 3}')
    bad = Event.objects.create(event="voice", detail='{"file": "../etc/passwd"}')
    r = admin_client.get(f"/app/api/voice/{ok.pk}")
    assert r.status_code == 200 and r["Content-Type"] == "audio/ogg" and r.content == b"OggS"
    assert admin_client.get(f"/app/api/voice/{bad.pk}").status_code == 400
    assert admin_client.get("/app/api/voice/999999").status_code == 404


def test_permission(client, make_user):
    client.force_login(make_user(7, "employee"))
    assert client.get("/app/api/audit").status_code == 403
