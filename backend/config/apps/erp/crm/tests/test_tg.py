"""CRM Telegram (Business bot): webhook → baza, huquqlar, javob yuborish (Bot API — httpx.MockTransport)."""

import json

import httpx
import pytest

from config.apps.erp.crm import tg
from config.apps.erp.crm.models import TgChat, TgConnection, TgMessage
from config.apps.staff.models import User
from config.apps.staff.services import set_departments

pytestmark = pytest.mark.django_db
P = "/app/api/erp/crm/tg"
SELLER, OTHER, CLIENT = 2001, 2002, 9001


@pytest.fixture(autouse=True)
def events(monkeypatch):
    """Real vaqt hodisalari (Redis o'rniga ro'yxat)."""
    got: list[tuple[int, int]] = []
    monkeypatch.setattr("config.apps.erp.crm.live.publish", lambda chat, seller: got.append((chat, seller)))
    return got


@pytest.fixture
def bot(monkeypatch, settings):
    settings.BUSINESS_CONNECTION_BOT_TOKEN = "123:abc"
    calls: list[tuple[str, dict]] = []
    seq = iter(range(500, 600))

    def h(req: httpx.Request) -> httpx.Response:
        method = req.url.path.rsplit("/", 1)[-1]
        try:
            body = json.loads(req.content) if req.content else {}
        except ValueError:
            body = {}
        calls.append((method, body))
        if method == "getMe":
            return httpx.Response(200, json={"ok": True, "result": {"username": "belting_crm_bot"}})
        if method == "sendMessage":
            chat = {"id": body["chat_id"], "type": "private", "first_name": "Mijoz"}
            msg = {
                "message_id": next(seq),
                "date": 1_800_000_100,
                "chat": chat,
                "from": {"id": SELLER},
                "text": body["text"],
            }
            return httpx.Response(200, json={"ok": True, "result": msg})
        if method in ("sendPhoto", "sendDocument", "sendVideo", "sendLocation"):
            ctype = req.headers.get("content-type", "")
            if method == "sendLocation":
                body = json.loads(req.content)
            else:  # multipart: maydon nomi va fayl bor-yo'qligini tekshirish uchun xom matn
                body = {"multipart": ctype.startswith("multipart/"), "raw": req.content.decode("latin-1")}
            calls[-1] = (method, body)
            chat = {"id": CLIENT, "type": "private", "first_name": "Mijoz"}
            msg = {"message_id": next(seq), "date": 1_800_000_200, "chat": chat, "from": {"id": SELLER}}
            if method == "sendLocation":
                msg["location"] = {"latitude": body["latitude"], "longitude": body["longitude"]}
            elif method == "sendPhoto":
                msg["photo"] = [{"file_id": "p1", "width": 100, "height": 80}]
            else:
                msg["document"] = {"file_id": "d1", "file_name": "big.png", "mime_type": "image/png"}
            return httpx.Response(200, json={"ok": True, "result": msg})
        if method == "getFile":
            return httpx.Response(200, json={"ok": True, "result": {"file_path": "photos/f.jpg"}})
        if req.url.path.endswith("/photos/f.jpg"):
            return httpx.Response(200, content=b"JPEG", headers={"content-type": "image/jpeg"})
        if method == "getBusinessConnection":
            return httpx.Response(200, json={"ok": True, "result": conn_upd("bc-2", OTHER)["business_connection"]})
        return httpx.Response(200, json={"ok": False, "description": "Bad Request"})

    real = httpx.Client
    monkeypatch.setattr(httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(h), **kw))
    tg._me.clear()
    return calls


def conn_upd(cid: str, user: int, can_reply: bool = True, enabled: bool = True) -> dict:
    return {
        "business_connection": {
            "id": cid,
            "user": {"id": user, "first_name": f"Sotuvchi{user}"},
            "user_chat_id": user,
            "date": 1_800_000_000,
            "rights": {"can_reply": can_reply},
            "is_enabled": enabled,
        }
    }


def msg_upd(
    cid: str, mid: int, text: str, frm: int = CLIENT, chat: int = CLIENT, key: str = "business_message"
) -> dict:
    return {
        key: {
            "business_connection_id": cid,
            "message_id": mid,
            "date": 1_800_000_000 + mid,
            "chat": {"id": chat, "type": "private", "first_name": "Ali", "last_name": "Valiyev", "username": "ali_v"},
            "from": {"id": frm},
            "text": text,
        }
    }


def hook(client, settings, upd: dict, secret: str | None = None):
    return client.post(
        f"{P}/webhook",
        data=json.dumps(upd),
        content_type="application/json",
        headers={"X-Telegram-Bot-Api-Secret-Token": settings.CRM_TG_WEBHOOK_SECRET if secret is None else secret},
    )


def login(client, tg_id: int, role: str = "employee") -> User:
    from config.apps.jarvis.models import Agent

    u = User.objects.filter(tg_id=tg_id).first() or User.objects.create_user(tg_id, f"U{tg_id}", role)
    sotuv, _ = Agent.objects.get_or_create(key="sotuv", defaults={"kind": "dept", "name": "Sotuv", "persona": "p" * 25})
    set_departments(u, [*u.dept_keys(), sotuv.key])  # CRM moduli — Sotuv bo'limi
    client.force_login(u)
    return u


def test_webhook_sir_tekshiriladi(client, settings, bot):
    assert hook(client, settings, conn_upd("bc-1", SELLER), secret="xato").status_code == 403
    assert not TgConnection.objects.exists()


def test_xabarlar_bazaga_va_tahrir_ochirish(client, settings, bot):
    hook(client, settings, conn_upd("bc-1", SELLER))
    hook(client, settings, msg_upd("bc-1", 1, "Salom, remen bormi?"))
    hook(client, settings, msg_upd("bc-1", 2, "Bor, qaysi o'lcham?", frm=SELLER))
    hook(client, settings, msg_upd("bc-1", 3, "SPB 1650"))
    chat = TgChat.objects.get()
    assert (chat.title, chat.username, chat.unread, chat.last_text) == ("Ali Valiyev", "ali_v", 1, "SPB 1650")
    assert [m.out for m in TgMessage.objects.filter(chat=chat)] == [False, True, False]
    hook(client, settings, msg_upd("bc-1", 3, "SPB 1650, 25 dona", key="edited_business_message"))
    m3 = TgMessage.objects.get(message_id=3)
    assert m3.text == "SPB 1650, 25 dona" and m3.edited_at is not None
    hook(
        client,
        settings,
        {"deleted_business_messages": {"business_connection_id": "bc-1", "chat": {"id": CLIENT}, "message_ids": [1]}},
    )
    assert TgMessage.objects.get(message_id=1).deleted


def test_nomalum_ulanish_telegramdan_olinadi(client, settings, bot):
    hook(client, settings, msg_upd("bc-2", 1, "Salom"))
    assert TgConnection.objects.get(id="bc-2").user_tg == OTHER
    assert TgChat.objects.get().connection_id == "bc-2"


def test_sotuvchi_faqat_ozinikini_rahbar_hammasini(client, settings, bot, depts):
    hook(client, settings, conn_upd("bc-1", SELLER))
    hook(client, settings, conn_upd("bc-2", OTHER))
    hook(client, settings, msg_upd("bc-1", 1, "birinchi"))
    hook(client, settings, msg_upd("bc-2", 1, "ikkinchi", chat=9002))
    mine = TgChat.objects.get(connection_id="bc-1")
    other = TgChat.objects.get(connection_id="bc-2")

    login(client, SELLER)
    r = client.get(f"{P}/chats").json()
    assert [c["id"] for c in r["chats"]] == [mine.pk]
    assert (
        r["head"] is False and r["connection"] == {"enabled": True, "can_reply": True} and r["bot"] == "belting_crm_bot"
    )
    assert client.get(f"{P}/chats/{other.pk}/messages").status_code == 404
    assert client.post(f"{P}/chats/{other.pk}/send", {"text": "x"}, content_type="application/json").status_code == 404

    # rahbar ham boshqalarning yozishmalarini ko'rmaydi (yozishmalar shaxsiy)
    head = login(client, 3001)
    set_departments(head, [depts["rahbariyat"].key])
    r = client.get(f"{P}/chats").json()
    assert r["chats"] == [] and r["head"] is True
    assert client.get(f"{P}/chats/{mine.pk}/messages").status_code == 404


def test_sotuvchi_javob_yozadi(client, settings, bot):
    hook(client, settings, conn_upd("bc-1", SELLER))
    hook(client, settings, msg_upd("bc-1", 1, "Narxi qancha?"))
    chat = TgChat.objects.get()
    login(client, SELLER)
    assert chat.unread == 1
    assert client.get(f"{P}/chats/{chat.pk}/messages").json()["chat"]["unread"] == 0
    assert TgChat.objects.get().unread == 0  # egasi ochdi — o'qilgan
    r = client.post(f"{P}/chats/{chat.pk}/send", {"text": "185 000 so'm"}, content_type="application/json")
    assert r.status_code == 200 and r.json()["out"] and r.json()["via_crm"]
    assert ("sendMessage", {"business_connection_id": "bc-1", "chat_id": CLIENT, "text": "185 000 so'm"}) in bot
    assert TgChat.objects.get().last_text == "185 000 so'm"


def test_24_soat_qoidasi_va_rad_etish(client, settings, bot, monkeypatch):
    """Telegram Business: mijoz 24 soatdan beri yozmagan — oldindan 409 (Telegram'ga so'rov ketmaydi);
    Telegram PEER_ID_INVALID qaytarsa ham — 409 tushunarli matn bilan (502 emas)."""
    from datetime import timedelta

    from django.utils import timezone

    hook(client, settings, conn_upd("bc-1", SELLER))
    hook(client, settings, msg_upd("bc-1", 1, "Salom"))
    chat = TgChat.objects.get()
    login(client, SELLER)
    TgMessage.objects.filter(chat=chat).update(date=timezone.now() - timedelta(hours=30))
    n = len(bot)
    r = client.post(f"{P}/chats/{chat.pk}/send", {"text": "x"}, content_type="application/json")
    assert r.status_code == 409 and "24 soat" in r.json()["detail"] and len(bot) == n
    # sotuvchining o'zi Telegram'dan yozgan (jonli) xabar ham chatni «faol» qiladi
    hook(client, settings, msg_upd("bc-1", 2, "salom", frm=SELLER))
    TgMessage.objects.filter(chat=chat, message_id=2).update(date=timezone.now())
    assert client.post(f"{P}/chats/{chat.pk}/send", {"text": "y"}, content_type="application/json").status_code == 200
    # CRM boti yuborgani hisoblanmaydi
    TgMessage.objects.filter(chat=chat, via_crm=False).update(date=timezone.now() - timedelta(hours=30))
    assert client.post(f"{P}/chats/{chat.pk}/send", {"text": "z"}, content_type="application/json").status_code == 409
    TgMessage.objects.filter(chat=chat).update(date=timezone.now())
    monkeypatch.setattr(tg, "call", lambda *a, **k: (_ for _ in ()).throw(tg.reject("Bad Request: PEER_ID_INVALID")))
    r = client.post(f"{P}/chats/{chat.pk}/send", {"text": "x"}, content_type="application/json")
    assert r.status_code == 409 and "24 soat" in r.json()["detail"]
    assert tg.reject("Bad Request: chat not found").detail == "Telegram rad etdi: Bad Request: chat not found"


def test_javob_huquqi_yoq(client, settings, bot):
    hook(client, settings, conn_upd("bc-1", SELLER, can_reply=False))
    hook(client, settings, msg_upd("bc-1", 1, "Salom"))
    chat = TgChat.objects.get()
    login(client, SELLER)
    r = client.post(f"{P}/chats/{chat.pk}/send", {"text": "x"}, content_type="application/json")
    assert r.status_code == 403 and "javob berish" in r.json()["detail"]
    assert not any(m == "sendMessage" for m, _ in bot)


def test_botga_start_yoriqnoma(client, settings, bot):
    hook(
        client,
        settings,
        {"message": {"message_id": 1, "date": 1, "chat": {"id": SELLER, "type": "private"}, "text": "/start"}},
    )
    assert bot[-1][0] == "sendMessage" and "Telegram Business" in bot[-1][1]["text"]


def test_bot_bilan_ozi_chati_crmga_yozilmaydi(client, settings, bot):
    hook(client, settings, conn_upd("bc-1", SELLER))
    hook(client, settings, msg_upd("bc-1", 1, "/start", frm=SELLER, chat=123))  # 123 — bot ID (token "123:abc")
    assert not TgChat.objects.exists()
    hook(
        client,
        settings,
        {"message": {"message_id": 2, "date": 1, "chat": {"id": SELLER, "type": "private"}, "text": "salom"}},
    )
    assert not any(m == "sendMessage" for m, _ in bot)  # /start emas — javob yo'q


def test_real_vaqt_hodisalari(client, settings, bot, events, django_capture_on_commit_callbacks):
    hook(client, settings, conn_upd("bc-1", SELLER))
    with django_capture_on_commit_callbacks(execute=True):
        hook(client, settings, msg_upd("bc-1", 1, "Salom"))
    chat = TgChat.objects.get()
    assert events == [(chat.pk, SELLER)]
    hook(
        client,
        settings,
        {"deleted_business_messages": {"business_connection_id": "bc-1", "chat": {"id": CLIENT}, "message_ids": [1]}},
    )
    assert events[-1] == (chat.pk, SELLER) and len(events) == 2


def test_media_va_fayl(client, settings, bot):
    hook(client, settings, conn_upd("bc-1", SELLER))
    upd = msg_upd("bc-1", 1, "")
    m = upd["business_message"]
    del m["text"]
    m["caption"] = "Eski remen"
    m["photo"] = [
        {"file_id": "small", "width": 90, "height": 60, "file_size": 1},
        {"file_id": "big", "width": 1280, "height": 853, "file_size": 99},
    ]
    hook(client, settings, upd)
    hook(
        client,
        settings,
        {
            "business_message": {
                **msg_upd("bc-1", 2, "")["business_message"],
                "text": None,
                "poll": {"question": "Qaysi?", "options": [{"text": "A"}, {"text": "B"}]},
            }
        },
    )
    hook(
        client,
        settings,
        {"business_message": {**msg_upd("bc-1", 3, "")["business_message"], "text": None, "something_new": {}}},
    )
    chat = TgChat.objects.get()
    login(client, SELLER)
    msgs = client.get(f"{P}/chats/{chat.pk}/messages").json()["messages"]
    photo, poll, other = msgs
    assert photo["kind"] == "photo" and photo["text"] == "Eski remen" and "file_id" not in photo["media"]
    assert photo["media"]["width"] == 1280 and photo["media"]["url"].endswith(f"/messages/{photo['id']}/file")
    assert poll["kind"] == "poll" and poll["text"] == "Qaysi?\n• A\n• B"
    assert other["kind"] == "other" and TgChat.objects.get().last_text == "Xabar"
    assert (TgMessage.objects.get(message_id=1).raw or {}).get("caption") == "Eski remen"
    r = client.get(photo["media"]["url"])
    assert r.status_code == 200 and r.content == b"JPEG" and r["Content-Type"] == "image/jpeg"
    assert ("getFile", {"file_id": "big"}) in bot
    login(client, OTHER)
    assert client.get(photo["media"]["url"]).status_code == 404


def post_json(client, path, body):
    return client.post(path, body, content_type="application/json")


def test_fayl_va_joylashuv_yuborish(client, settings, bot):
    from django.core.files.uploadedfile import SimpleUploadedFile

    from config.apps.erp.crm import tg as T

    hook(client, settings, conn_upd("bc-1", SELLER))
    hook(client, settings, msg_upd("bc-1", 1, "Rasm yuboring"))
    chat = TgChat.objects.get()
    login(client, SELLER)
    img = SimpleUploadedFile("remen.jpg", b"\xff\xd8JPEGDATA", content_type="image/jpeg")
    r = client.post(f"{P}/chats/{chat.pk}/send-file", {"file": img, "caption": "Mana shu"})
    assert r.status_code == 200 and r.json()["kind"] == "photo" and r.json()["out"] and r.json()["via_crm"]
    method, body = bot[-1]
    assert method == "sendPhoto" and body["multipart"] and 'name="photo"' in body["raw"]
    assert "Mana shu" in body["raw"] and "bc-1" in body["raw"]
    # 10 MB dan katta rasm, PDF, "fayl sifatida" — hujjat
    assert T.upload_method("image/png", T.PHOTO_MAX + 1, False) == ("sendDocument", "document")
    assert T.upload_method("application/pdf", 10, False) == ("sendDocument", "document")
    assert T.upload_method("image/jpeg", 10, True) == ("sendDocument", "document")
    r = post_json(client, f"{P}/chats/{chat.pk}/send", {"latitude": 41.3111, "longitude": 69.2797})
    assert r.status_code == 200 and r.json()["kind"] == "location"
    assert r.json()["media"] == {"lat": 41.3111, "lon": 69.2797}
    assert bot[-1] == (
        "sendLocation",
        {"business_connection_id": "bc-1", "chat_id": CLIENT, "latitude": 41.3111, "longitude": 69.2797},
    )
    assert post_json(client, f"{P}/chats/{chat.pk}/send", {"latitude": 200, "longitude": 0}).status_code == 400
    assert client.post(f"{P}/chats/{chat.pk}/send-file", {}).status_code == 400
    login(client, OTHER)
    img = SimpleUploadedFile("x.jpg", b"x", content_type="image/jpeg")
    assert client.post(f"{P}/chats/{chat.pk}/send-file", {"file": img}).status_code == 404


def test_chatni_mijozga_biriktirish(client, settings, bot):
    from config.apps.erp.crm.models import Customer, Deal

    hook(client, settings, conn_upd("bc-1", SELLER))
    hook(client, settings, msg_upd("bc-1", 1, "Remen kerak"))
    chat = TgChat.objects.get()
    login(client, SELLER)
    c = post_json(
        client, "/app/api/erp/crm/customers", {"name": "Ali Valiyev", "kind": "person", "phones": ["90 777 00 11"]}
    ).json()
    r = post_json(client, "/app/api/erp/crm/deals", {"counterparty_id": c["id"], "title": "SPB", "tg_chat_id": chat.pk})
    assert r.status_code == 200
    assert TgChat.objects.get().customer_id == c["id"]
    assert client.get(f"{P}/chats").json()["chats"][0]["customer"] == {"id": c["id"], "name": "Ali Valiyev"}
    assert post_json(client, f"{P}/chats/{chat.pk}/link", {"customer_id": None}).json()["customer"] is None
    foreign = Customer.objects.create(name="Begona", owner_tg=OTHER)
    assert post_json(client, f"{P}/chats/{chat.pk}/link", {"customer_id": foreign.pk}).status_code == 404
    # begona chat bilan bitim — 404 va bitim yaratilmaydi
    login(client, OTHER)
    n = Deal.objects.count()
    oc = post_json(
        client, "/app/api/erp/crm/customers", {"name": "O'zimniki", "kind": "person", "phones": ["90 777 00 12"]}
    ).json()
    assert (
        post_json(client, "/app/api/erp/crm/deals", {"counterparty_id": oc["id"], "tg_chat_id": chat.pk}).status_code
        == 404
    )
    assert Deal.objects.count() == n


def test_telegramdan_avtomatik_lid(client, settings, bot):
    from config.apps.erp.crm.models import Customer, Lead

    hook(client, settings, conn_upd("bc-1", SELLER))
    hook(client, settings, msg_upd("bc-1", 1, "SPB 1650 bormi?"))
    hook(client, settings, msg_upd("bc-1", 2, "Narxi?"))
    lead = Lead.objects.get()  # bitta chat — bitta lid
    assert (lead.status, lead.owner_tg, lead.source, lead.name, lead.note) == (
        "new",
        SELLER,
        "telegram",
        "Ali Valiyev",
        "SPB 1650 bormi?",
    )
    login(client, SELLER)
    got = client.get("/app/api/erp/crm/leads").json()
    assert got[0]["tg"] == {"chat_id": lead.tg_chat_id, "username": "ali_v", "unread": 2, "channel": "tg"}
    # sotuvchi javob berdi — «Ishda», javob vaqti
    hook(client, settings, msg_upd("bc-1", 3, "Bor, 185 ming", frm=SELLER))
    lead.refresh_from_db()
    assert lead.status == "work" and lead.first_touch is not None
    # «Qiziqish bildirdi» → bitim: chat mijozga biriktiriladi
    assert (
        post_json(client, f"/app/api/erp/crm/leads/{lead.pk}/status", {"status": "interested"}).json()["status"]
        == "interested"
    )
    assert post_json(client, f"/app/api/erp/crm/leads/{lead.pk}/status", {"status": "converted"}).status_code == 400
    post_json(client, f"/app/api/erp/crm/leads/{lead.pk}/edit", {"product": "SPB 1650"})
    d = post_json(client, f"/app/api/erp/crm/leads/{lead.pk}/convert", {}).json()
    chat = TgChat.objects.get()
    assert chat.customer is not None and chat.customer.name == "Ali Valiyev" and d["customer"] == "Ali Valiyev"
    assert Customer.objects.count() == 1
    # mijozga bog'langan chat — yangi lid ochilmaydi
    hook(client, settings, msg_upd("bc-1", 4, "Rahmat"))
    assert Lead.objects.count() == 1


def test_shaxsiy_chat_va_sotuvchi_boshlagan_suhbat(client, settings, bot):
    from config.apps.erp.crm.models import Lead

    hook(client, settings, conn_upd("bc-1", SELLER))
    hook(client, settings, msg_upd("bc-1", 1, "Salom do'stim"))
    lead = Lead.objects.get()
    login(client, SELLER)
    post_json(client, f"/app/api/erp/crm/leads/{lead.pk}/junk", {"reason": "Shaxsiy chat"})
    hook(client, settings, msg_upd("bc-1", 2, "Qalaysan"))
    assert Lead.objects.count() == 1  # yaroqsiz qilingan chatdan qayta ochilmaydi
    # sotuvchi o'zi yozgan, mijoz keyin javob berdi — lid darhol «Ishda»
    hook(client, settings, msg_upd("bc-1", 10, "Assalomu alaykum, remen kerakmi?", frm=SELLER, chat=7777))
    hook(client, settings, msg_upd("bc-1", 11, "Ha, kerak", chat=7777))
    l2 = Lead.objects.get(tg_chat__chat_id=7777)
    assert l2.status == "work" and l2.first_touch is not None


def test_bot_chatlari_crmga_tushmaydi(client, settings, bot):
    from config.apps.erp.crm.models import Lead

    hook(client, settings, conn_upd("bc-1", SELLER))
    upd = msg_upd("bc-1", 1, "✅ Kirish tasdiqlandi", chat=555)
    upd["business_message"]["chat"]["username"] = "belting_login_bot"
    hook(client, settings, upd)
    upd2 = msg_upd("bc-1", 2, "Salom", chat=556)
    upd2["business_message"]["from"] = {"id": 556, "is_bot": True}
    upd2["business_message"]["chat"]["username"] = None
    hook(client, settings, upd2)
    assert not TgChat.objects.exists() and not Lead.objects.exists()
    # avval saqlangan bot chati ro'yxatda ko'rinmaydi
    conn = TgConnection.objects.get()
    TgChat.objects.create(connection=conn, chat_id=557, title="Eski bot", username="SomeBot")
    login(client, SELLER)
    assert client.get(f"{P}/chats").json()["chats"] == []


def test_javob_tahrir_tarixi_va_ochirilgan(client, settings, bot):
    hook(client, settings, conn_upd("bc-1", SELLER))
    hook(client, settings, msg_upd("bc-1", 1, "SPB 1650 bormi?"))
    # mijoz o'z xabarini tahrirladi — eski matn tarixda
    hook(client, settings, msg_upd("bc-1", 1, "SPB 1650 25 dona bormi?", key="edited_business_message"))
    hook(client, settings, msg_upd("bc-1", 1, "SPB 1650 30 dona bormi?", key="edited_business_message"))
    # sotuvchi Telegram'da shu xabarga javob yozdi
    upd = msg_upd("bc-1", 2, "Bor", frm=SELLER)
    upd["business_message"]["reply_to_message"] = {
        "message_id": 1,
        "from": {"id": CLIENT},
        "text": "SPB 1650 30 dona bormi?",
    }
    hook(client, settings, upd)
    hook(client, settings, msg_upd("bc-1", 3, "Narxi?"))
    hook(
        client,
        settings,
        {"deleted_business_messages": {"business_connection_id": "bc-1", "chat": {"id": CLIENT}, "message_ids": [3]}},
    )
    chat = TgChat.objects.get()
    login(client, SELLER)
    m1, m2, m3 = client.get(f"{P}/chats/{chat.pk}/messages").json()["messages"]
    assert m1["text"] == "SPB 1650 30 dona bormi?" and m1["edited"]
    assert [h["text"] for h in m1["history"]] == ["SPB 1650 bormi?", "SPB 1650 25 dona bormi?"]
    assert m2["reply"] == {"text": "SPB 1650 30 dona bormi?", "kind": "text", "out": False, "ref": m1["id"]}
    assert m3["deleted"] and m3["deleted_at"] and m3["text"] == "Narxi?"  # o'chirilgan — matni saqlanadi
    # CRM'dan javob (reply) — Telegram'ga reply_parameters bilan
    r = post_json(client, f"{P}/chats/{chat.pk}/send", {"text": "Ertaga tayyor", "reply_to": m3["id"]})
    assert r.status_code == 200
    assert bot[-1] == (
        "sendMessage",
        {
            "business_connection_id": "bc-1",
            "chat_id": CLIENT,
            "text": "Ertaga tayyor",
            "reply_parameters": {"message_id": 3, "allow_sending_without_reply": True},
        },
    )
    assert post_json(client, f"{P}/chats/{chat.pk}/send", {"text": "x", "reply_to": 999999}).status_code == 400
