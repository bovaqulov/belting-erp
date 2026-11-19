"""CRM WhatsApp / Instagram (rasmiy Meta API): webhook imzosi, sotuvchiga taqsimlash, lid, 24 soat qoidasi, javob, fayl
(Graph API — httpx.MockTransport)."""

import hashlib
import hmac
import json
from datetime import timedelta

import httpx
import pytest
from django.utils import timezone

from config.apps.erp.crm import meta
from config.apps.erp.crm.models import Customer, Lead, TgChat, TgMessage
from config.apps.erp.crm.tests.test_tg import login

pytestmark = pytest.mark.django_db
W = "/app/api/erp/crm/meta/webhook"
P = "/app/api/erp/crm/tg"
SELLER, OTHER = 2001, 2002
PHONE, IGSID, IG_ME = "998901112233", "1784001", "1789999"


@pytest.fixture(autouse=True)
def events(monkeypatch):
    monkeypatch.setattr("config.apps.erp.crm.live.publish", lambda chat, seller: None)


@pytest.fixture
def graph(monkeypatch, settings):
    settings.META_APP_SECRET = "sir"
    settings.META_VERIFY_TOKEN = "tasdiq"
    settings.WA_TOKEN, settings.WA_PHONE_ID = "wa-tok", "555"
    settings.IG_TOKEN, settings.IG_USER_ID = "ig-tok", IG_ME
    calls: list[tuple[str, str, dict]] = []
    seq = iter(range(1, 100))

    def h(req: httpx.Request) -> httpx.Response:
        path = req.url.path
        try:
            body = json.loads(req.content) if req.content else {}
        except ValueError:
            body = {"multipart": True}
        calls.append((req.method, f"{req.url.host}{path}", body))
        if path.endswith("/555/messages"):
            return httpx.Response(200, json={"messages": [{"id": f"wamid.OUT{next(seq)}"}]})
        if path.endswith("/555/media"):
            return httpx.Response(200, json={"id": "media-up-1"})
        if path.endswith(f"/{IG_ME}/messages"):
            return httpx.Response(200, json={"recipient_id": IGSID, "message_id": f"mid.OUT{next(seq)}"})
        if path.endswith(f"/{IGSID}"):
            return httpx.Response(200, json={"name": "Aziza", "username": "aziza_shop"})
        if path.endswith("/media-in-1"):
            return httpx.Response(200, json={"url": "https://lookaside.fbsbx.com/wa/f1", "mime_type": "image/jpeg"})
        if path.endswith("/wa/f1"):
            assert req.headers["authorization"] == "Bearer wa-tok"
            return httpx.Response(200, content=b"JPEG", headers={"content-type": "image/jpeg"})
        return httpx.Response(400, json={"error": {"message": "Unsupported", "code": 100}})

    real = httpx.Client
    monkeypatch.setattr(httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(h), **kw))
    return calls


def hook(client, payload: dict, secret: str = "sir"):
    body = json.dumps(payload).encode()
    sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return client.post(W, data=body, content_type="application/json", headers={"X-Hub-Signature-256": sig})


def wa(mid: str, text: str = "", phone: str = PHONE, ts: int | None = None, **extra) -> dict:
    m: dict = {"from": phone, "id": mid, "timestamp": str(ts or int(timezone.now().timestamp())), "type": "text"}
    if text:
        m["text"] = {"body": text}
    m.update(extra)
    value = {"metadata": {"phone_number_id": "555"}, "contacts": [{"wa_id": phone, "profile": {"name": "Bobur"}}]}
    return {"object": "whatsapp_business_account", "entry": [{"changes": [{"value": value | {"messages": [m]}}]}]}


def ig(mid: str, text: str, out: bool = False, **msg) -> dict:
    ev = {
        "sender": {"id": IG_ME if out else IGSID},
        "recipient": {"id": IGSID if out else IG_ME},
        "timestamp": int(timezone.now().timestamp() * 1000),
        "message": {"mid": mid, "text": text, **({"is_echo": True} if out else {}), **msg},
    }
    return {"object": "instagram", "entry": [{"id": IG_ME, "messaging": [ev]}]}


def test_tasdiqlash_va_imzo(client, graph):
    q = {"hub.mode": "subscribe", "hub.verify_token": "tasdiq", "hub.challenge": "42"}
    r = client.get(W, q)
    assert r.status_code == 200 and r.content == b"42"
    assert client.get(W, q | {"hub.verify_token": "xato"}).status_code == 403
    login(client, SELLER)
    assert hook(client, wa("wamid.1", "Salom"), secret="xato").status_code == 403
    assert not TgChat.objects.exists()


def test_whatsapp_taqsimlash_lid_va_royxat(client, graph):
    login(client, OTHER)
    login(client, SELLER)
    # CRM mijozi (telefon bo'yicha) — chat uning menejeriga, mijozga biriktiriladi
    c = Customer.objects.create(name="Chinoz Un", phones=[f"+{PHONE}"], owner_tg=OTHER)
    assert hook(client, wa("wamid.1", "Remen kerak")).status_code == 200
    chat = TgChat.objects.select_related("connection").get()
    assert (chat.connection.channel, chat.connection.user_tg, chat.customer_id) == ("wa", OTHER, c.pk)
    assert (chat.title, chat.chat_id, chat.unread) == ("Bobur", int(PHONE), 1)
    # notanish raqam — navbat bo'yicha sotuvchiga, «whatsapp» manbali lid
    hook(client, wa("wamid.2", "Narxi qancha?", phone="998907778899"))
    new = TgChat.objects.exclude(pk=chat.pk).select_related("connection").get()
    lead = Lead.objects.get(tg_chat=new)
    assert (lead.source, lead.owner_tg, lead.note) == ("whatsapp", new.connection.user_tg, "Narxi qancha?")
    # ro'yxat: kanal filtri va o'qilmaganlar
    login(client, new.connection.user_tg)
    r = client.get(f"{P}/chats?ch=wa").json()
    assert [(x["id"], x["channel"], x["can_send"]) for x in r["chats"]] == [(new.pk, "wa", True)]
    assert r["channels"]["wa"] == {"enabled": True, "unread": 1} and r["channels"]["ig"]["unread"] == 0
    assert client.get(f"{P}/chats?ch=ig").json()["chats"] == []
    # takror kelgan xabar (Meta qayta yuboradi) — ikki marta yozilmaydi
    hook(client, wa("wamid.2", "Narxi qancha?", phone="998907778899"))
    assert TgMessage.objects.filter(chat=new).count() == 1


def test_whatsapp_javob_va_24_soat(client, graph):
    login(client, SELLER)
    hook(client, wa("wamid.1", "Salom"))
    chat = TgChat.objects.get()
    r = client.post(f"{P}/chats/{chat.pk}/send", {"text": "Assalomu alaykum!"}, content_type="application/json")
    assert r.status_code == 200 and r.json()["out"] and r.json()["via_crm"]
    sent = [b for m, u, b in graph if u.endswith("/555/messages")][-1]
    assert (sent["to"], sent["type"], sent["text"]["body"]) == (PHONE, "text", "Assalomu alaykum!")
    # javob (reply) — asl wamid context'da
    first = TgMessage.objects.get(raw__id="wamid.1")
    client.post(f"{P}/chats/{chat.pk}/send", {"text": "ha", "reply_to": first.pk}, content_type="application/json")
    assert [b for m, u, b in graph if u.endswith("/555/messages")][-1]["context"] == {"message_id": "wamid.1"}
    # mijoz 24 soatdan beri yozmagan — 409, Meta'ga so'rov ketmaydi
    TgMessage.objects.filter(chat=chat, out=False).update(date=timezone.now() - timedelta(hours=25))
    n = len(graph)
    r = client.post(f"{P}/chats/{chat.pk}/send", {"text": "salom"}, content_type="application/json")
    assert r.status_code == 409 and "24 soat" in r.json()["detail"] and len(graph) == n


def test_whatsapp_fayl_kelishi_va_yuborish(client, graph):
    login(client, SELLER)
    hook(client, wa("wamid.9", type="image", image={"id": "media-in-1", "mime_type": "image/jpeg", "caption": "shu"}))
    m = TgMessage.objects.get()
    assert (m.kind, m.text) == ("photo", "shu")
    msgs = client.get(f"{P}/chats/{m.chat_id}/messages").json()["messages"]
    assert "file_id" not in msgs[0]["media"] and msgs[0]["media"]["url"].endswith(f"/messages/{m.pk}/file")
    r = client.get(f"{P}/messages/{m.pk}/file")
    assert r.status_code == 200 and r.content == b"JPEG"
    up = client.post(f"{P}/chats/{m.chat_id}/send-file", {"file": _file("narx.pdf", b"%PDF", "application/pdf")})
    assert up.status_code == 200 and up.json()["kind"] == "document"
    sent = [b for _, u, b in graph if u.endswith("/555/messages")][-1]
    assert sent["type"] == "document" and sent["document"] == {"id": "media-up-1", "filename": "narx.pdf"}


def test_instagram_kelishi_echo_va_javob(client, graph):
    login(client, SELLER)
    hook(client, ig("mid.1", "Lenta bormi?"))
    chat = TgChat.objects.select_related("connection").get()
    assert (chat.connection.channel, chat.title, chat.username) == ("ig", "Aziza", "aziza_shop")
    assert Lead.objects.get(tg_chat=chat).source == "instagram"
    # Instagram ilovasidan yozilgan javob (echo) — chiquvchi
    hook(client, ig("mid.2", "Bor", out=True))
    assert list(TgMessage.objects.order_by("date", "pk").values_list("out", flat=True)) == [False, True]
    r = client.post(f"{P}/chats/{chat.pk}/send", {"text": "Narxi 90 000"}, content_type="application/json")
    assert r.status_code == 200
    sent = [b for _, u, b in graph if u.endswith(f"/{IG_ME}/messages")][-1]
    assert sent == {"recipient": {"id": IGSID}, "message": {"text": "Narxi 90 000"}}
    # yuborilgan xabarning echo'si qayta yozilmaydi
    ext = (TgMessage.objects.get(via_crm=True).raw or {})["id"]
    hook(client, ig(ext, "Narxi 90 000", out=True))
    assert TgMessage.objects.filter(chat=chat).count() == 3
    # o'chirilgan xabar — belgilanadi
    hook(client, ig("mid.1", "", is_deleted=True))
    assert TgMessage.objects.get(raw__id="mid.1").deleted
    # Instagram'ga fayl — tushunarli 400
    r = client.post(f"{P}/chats/{chat.pk}/send-file", {"file": _file("a.pdf", b"%PDF", "application/pdf")})
    assert r.status_code == 400


def test_instagram_fayl_faqat_meta_domenidan(client, graph):
    login(client, SELLER)
    hook(client, ig("mid.5", "", attachments=[{"type": "image", "payload": {"url": "https://evil.example/x.jpg"}}]))
    m = TgMessage.objects.get()
    assert m.kind == "photo"
    assert client.get(f"{P}/messages/{m.pk}/file").status_code == 404


def test_kalitsiz_ulanmagan(client, settings):
    settings.WA_TOKEN = ""
    assert not meta.enabled("wa")
    assert meta.msg_id("wamid.A") == meta.msg_id("wamid.A") != meta.msg_id("wamid.B")
    assert 0 <= meta.msg_id("x") < 2**63


def _file(name: str, data: bytes, mime: str):
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile(name, data, content_type=mime)
