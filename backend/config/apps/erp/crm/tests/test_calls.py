"""Telefon qo'ng'iroqlari: qo'lda yozish, mijoz tarixi (huquq), IP-telefoniya webhook'i (token, raqam → mijoz, takror)."""

import json

import pytest

from config.apps.erp.crm.models import Activity, Call, Customer
from config.apps.erp.crm.tests.test_tg import login

pytestmark = pytest.mark.django_db
C = "/app/api/erp/crm"
ME, OTHER = 2001, 2002


def post(client, url, body, **h):
    return client.post(url, json.dumps(body), content_type="application/json", **h)


def setup_customer(client) -> tuple[dict, dict]:
    login(client, OTHER)
    login(client, ME)
    c = post(client, f"{C}/customers", {"name": "Chinoz Un", "phones": ["90 123 45 67"], "inn": "305112847"}).json()
    d = post(client, f"{C}/deals", {"counterparty_id": c["id"], "title": "Remen"}).json()
    return c, d


def test_qolda_yozish_va_tarix(client):
    c, d = setup_customer(client)
    r = post(
        client,
        f"{C}/calls",
        {"customer_id": c["id"], "direction": "out", "status": "answered", "duration": 125, "note": "Narx kelishildi"},
    )
    assert r.status_code == 200
    j = r.json()
    assert (j["phone"], j["duration"], j["deal_id"], j["owner_tg"]) == ("998901234567", 125, d["id"], ME)
    a = Activity.objects.get(kind="call")
    assert a.deal_id == d["id"] and a.text == "Chiquvchi qo'ng'iroq +998901234567: gaplashildi 2:05 — Narx kelishildi"
    # javobsiz — davomiylik 0
    post(client, f"{C}/calls", {"customer_id": c["id"], "direction": "in", "status": "missed", "duration": 30})
    rows = client.get(f"{C}/calls?customer={c['id']}").json()
    assert [(x["direction"], x["status"], x["duration"]) for x in rows] == [
        ("in", "missed", 0),
        ("out", "answered", 125),
    ]
    assert post(client, f"{C}/calls", {"customer_id": c["id"], "direction": "x"}).status_code == 400
    # begona mijoz (boshqa sotuvchi) — 404
    login(client, OTHER)
    assert client.get(f"{C}/calls?customer={c['id']}").status_code == 404


def test_webhook(client, settings):
    settings.CRM_CALLS_TOKEN = "sir"
    settings.CRM_CALLS_OPERATORS = '{"101": 2002}'
    c, d = setup_customer(client)
    body = {
        "id": "pbx-1",
        "phone": "+998 90 123-45-67",
        "direction": "in",
        "status": "answered",
        "duration": 61,
        "started_at": "2026-11-16T10:00:00+05:00",
        "recording_url": "https://pbx.example/rec/1.mp3",
        "operator": "101",
        "provider": "onlinepbx",
    }
    assert post(client, f"{C}/calls/webhook", body).status_code == 403
    assert post(client, f"{C}/calls/webhook", body, HTTP_X_CALLS_TOKEN="xato").status_code == 403
    r = post(client, f"{C}/calls/webhook", body, HTTP_X_CALLS_TOKEN="sir").json()
    call = Call.objects.get()
    assert (call.customer_id, call.deal_id, call.owner_tg, call.source, r["recording_url"]) == (
        c["id"],
        d["id"],
        OTHER,
        "onlinepbx",
        "https://pbx.example/rec/1.mp3",
    )
    # takror — yangilanadi, ikki marta yozilmaydi
    post(client, f"{C}/calls/webhook", {**body, "duration": 90}, HTTP_X_CALLS_TOKEN="sir")
    assert Call.objects.count() == 1 and Call.objects.get().duration == 90
    assert Activity.objects.filter(kind="call").count() == 1
    # notanish raqam — mijozsiz saqlanadi; http havola — saqlanmaydi
    post(
        client,
        f"{C}/calls/webhook",
        {**body, "id": "pbx-2", "phone": "998907770000", "recording_url": "http://x"},
        HTTP_X_CALLS_TOKEN="sir",
    )
    x = Call.objects.get(ext_id="pbx-2")
    assert x.customer_id is None and x.recording_url == ""
    assert post(client, f"{C}/calls/webhook", {"phone": "12"}, HTTP_X_CALLS_TOKEN="sir").status_code == 400
    assert Customer.objects.count() == 1
