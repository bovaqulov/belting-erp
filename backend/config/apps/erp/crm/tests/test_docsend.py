"""Hujjatni yuborish: PDF, mijoz chatiga (Telegram — fayl, Instagram — matn), Didox qoralamasi va holati (httpx Mock)."""

import json

import httpx
import pytest

from config.apps.erp.catalog import services as catalog
from config.apps.erp.crm import tg
from config.apps.erp.crm.models import Activity, Customer, Deal, Doc, TgChat, TgConnection
from config.apps.erp.crm.tests.test_tg import login

pytestmark = pytest.mark.django_db
C = "/app/api/erp/crm"
ME = 2001


@pytest.fixture(autouse=True)
def quiet(monkeypatch):
    monkeypatch.setattr("config.apps.erp.crm.live.publish", lambda chat, seller: None)


def make_doc(client, inn: str = "305112847") -> dict:
    catalog.demo_seed()
    h = catalog.find("Ремень клиновой SPB 1650")
    assert h is not None
    login(client, ME)
    c = client.post(
        f"{C}/customers",
        {"name": "Chinoz Un", "phones": ["90 123 45 67"], "inn": inn, "kind": "company" if inn else "person"},
        content_type="application/json",
    ).json()
    items = [{"item_id": h["item_id"], "name": h["name"], "unit": "dona", "qty": 10, "price": h["price"]}]
    d = client.post(
        f"{C}/deals", {"counterparty_id": c["id"], "title": "PDF", "items": items}, content_type="application/json"
    ).json()
    return client.post(f"{C}/deals/{d['id']}/doc", {"kind": "quote"}, content_type="application/json").json()


def chat(channel: str, customer_id: int) -> TgChat:
    conn = TgConnection.objects.create(id=f"{channel}:{ME}", channel=channel, user_tg=ME, can_reply=True)
    return TgChat.objects.create(connection=conn, chat_id=777, title="Mijoz", customer_id=customer_id)


def test_pdf_yuklab_olish(client):
    doc = make_doc(client)
    r = client.get(f"{C}/docs/{doc['id']}/pdf")
    assert r.status_code == 200 and r["Content-Type"] == "application/pdf" and r.content[:5] == b"%PDF-"
    assert doc["number"] in r["Content-Disposition"]


def test_chatga_yuborish(client, monkeypatch):
    doc = make_doc(client)
    cust = Deal.objects.get(pk=doc["deal_id"]).customer
    assert cust is not None
    sent: list[tuple] = []

    def fake_file(ch, name, mime, data, caption, as_file, reply_to):
        sent.append(("file", name, mime, data[:5], caption))
        return type("M", (), {"pk": 1})()

    monkeypatch.setattr(tg, "send_file", fake_file)
    monkeypatch.setattr(
        tg, "send", lambda ch, text, reply_to=None: sent.append(("text", text)) or type("M", (), {"pk": 2})()
    )
    t = chat("tg", cust.pk)
    r = client.post(f"{C}/docs/{doc['id']}/send", {"chat_id": t.pk}, content_type="application/json")
    assert r.status_code == 200 and r.json()["channel"] == "tg"
    assert sent[0][:4] == ("file", f"{doc['number']}.pdf", "application/pdf", b"%PDF-")
    # Instagram — matn (fayl yo'q)
    TgChat.objects.all().delete()
    TgConnection.objects.all().delete()
    i = chat("ig", cust.pk)
    client.post(f"{C}/docs/{doc['id']}/send", {"chat_id": i.pk}, content_type="application/json")
    assert sent[-1][0] == "text" and "Jami: 1 850 000 so'm" in sent[-1][1]
    assert Activity.objects.filter(kind="message", text__contains="Instagram").exists()
    # begona chat — 404
    assert (
        client.post(f"{C}/docs/{doc['id']}/send", {"chat_id": 99999}, content_type="application/json").status_code
        == 404
    )


@pytest.fixture
def didox_api(monkeypatch, settings):
    settings.DIDOX_PARTNER_TOKEN, settings.DIDOX_TIN, settings.DIDOX_PASSWORD = "ptok", "301234567", "parol"
    settings.DIDOX_URL = "https://testapi3.didox.uz"
    calls: list[tuple[str, str, dict, dict]] = []
    state = {"status": 0}

    def h(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content) if req.content else {}
        calls.append((req.method, req.url.path, dict(req.headers), body))
        p = req.url.path
        if p == "/v1/auth/301234567/password/ru":
            return httpx.Response(200, json={"token": "ukey-1"})
        if p == "/v1/profile":
            return httpx.Response(200, json={"tin": "301234567", "shortName": "BELTING REZINA", "address": "Toshkent"})
        if p == "/v1/utils/info/305112847":
            return httpx.Response(200, json={"shortName": "CHINOZ UN MCHJ", "address": "Chinoz"})
        if p == "/v1/utils/info/111111111":
            return httpx.Response(200, json={})
        if p == "/v1/documents/000/create":
            return httpx.Response(200, json={"_id": "dx-42"})
        if p == "/v1/documents/dx-42":
            return httpx.Response(200, json={"data": {"document": {"doc_status": state["status"]}}})
        return httpx.Response(404, json={"message": "not found"})

    real = httpx.Client
    monkeypatch.setattr(httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(h), **kw))
    from django.core.cache import cache

    cache.clear()
    return calls, state


def test_didox_kalitsiz_503(client):
    doc = make_doc(client)
    r = client.post(f"{C}/docs/{doc['id']}/didox", {"subtype": 4}, content_type="application/json")
    assert r.status_code == 503 and "DIDOX_PARTNER_TOKEN" in r.json()["detail"]
    full = client.get(f"{C}/docs/{doc['id']}").json()
    assert full["didox"]["enabled"] is False and full["didox"]["id"] is None


def test_didox_qoralama_va_holat(client, didox_api):
    calls, state = didox_api
    doc = make_doc(client)
    r = client.post(f"{C}/docs/{doc['id']}/didox", {"subtype": 4}, content_type="application/json").json()
    assert (r["didox"]["id"], r["didox"]["status"]) == ("dx-42", 0)
    create = next(c for c in calls if c[1] == "/v1/documents/000/create")
    assert create[2]["partner-authorization"] == "ptok" and create[2]["user-key"] == "ukey-1"
    data = create[3]["data"]
    assert (data["Subtype"], data["SellerTin"], data["BuyerTin"], data["Buyer"]["Name"]) == (
        4,
        "301234567",
        "305112847",
        "CHINOZ UN MCHJ",
    )
    assert data["Document"]["DocumentNo"] == doc["number"] and create[3]["document"].startswith(
        "data:application/pdf;base64,"
    )
    # qayta yuborish — 409; token keshlangan (login bir marta)
    assert client.post(f"{C}/docs/{doc['id']}/didox", {}, content_type="application/json").status_code == 409
    state["status"] = 3
    r2 = client.post(f"{C}/docs/{doc['id']}/didox-status", {}, content_type="application/json").json()
    assert r2["didox"]["status"] == 3 and r2["didox"]["status_text"] == "Ikki tomon imzolagan"
    assert Deal.objects.get(pk=doc["deal_id"]).sign_status == "signed"
    assert sum(1 for c in calls if c[1].startswith("/v1/auth/")) == 1


def test_didox_stirsiz_va_notogri_stir(client, didox_api):
    doc = make_doc(client, inn="")
    r = client.post(f"{C}/docs/{doc['id']}/didox", {"subtype": 4}, content_type="application/json")
    assert r.status_code == 400 and "STIR" in r.json()["detail"]
    Customer.objects.update(inn="111111111")
    Doc.objects.update(meta={**Doc.objects.get(pk=doc["id"]).meta, "inn": "111111111"})
    r = client.post(f"{C}/docs/{doc['id']}/didox", {"subtype": 4}, content_type="application/json")
    assert r.status_code == 400 and "topilmadi" in r.json()["detail"]
