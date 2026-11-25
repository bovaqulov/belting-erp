"""AI yordamchi: remen.uz (narxsiz, in_stock yo'q), vositalar (mahsulot, buyurtma, uzatish), himoyalar, Business bot
orqali yuborish, xodim savoli, sozlamalar API."""

from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone

from config.apps.core import llm
from config.apps.staff.models import User
from config.apps.staff.services import set_departments
from config.apps.tgcrm import assistant, bizbot, remen, stock
from config.apps.tgcrm.models import (
    Account,
    AccountEvent,
    Contact,
    Dialog,
    Kind,
    Message,
    Note,
    Peer,
    PeerKind,
    Stage,
    Task,
)

pytestmark = pytest.mark.django_db
OWNER = 201
ACC_TG = 5574


def test_queries():
    assert remen.queries("Spz 1500 bormi sizlarda?") == ["Spz 1500"]
    assert remen.queries("177-S3M") == ["177 S3M"]
    assert remen.queries("6PK 1500 va 8M-1040 kerak 5 dona") == ["6PK 1500", "8M 1040"]
    assert remen.queries("Привет, ремень A-1250 есть?") == ["A 1250"]
    assert remen.queries("Assalomu alaykum, qalaysiz?") == []


def test_remen_search_no_price_no_stock_and_cache(monkeypatch):
    calls = []

    class R:
        def json(self):
            return {
                "data": [{"id": 4284, "slug": "spz-1500", "name": "SPZ 1500", "in_stock": 100, "current_price": 50000}]
            }

    monkeypatch.setattr(remen.httpx, "get", lambda *a, **k: calls.append(k) or R())
    remen._cache.clear()
    assert remen.search("SPZ 1500") == [{"name": "SPZ 1500", "url": "https://remen.uz/product/4284-spz-1500"}]
    remen.search("spz 1500")
    assert len(calls) == 1  # kesh


@pytest.fixture
def setup(monkeypatch, depts):
    owner = User.objects.create_user(OWNER, "Muhammadali", "employee")
    set_departments(owner, [depts["sotuv"].key])
    a = Account.objects.create(
        kind=Kind.PERSONAL,
        owner_tg=OWNER,
        tg_user_id=ACC_TG,
        status="active",
        ai_enabled=True,
        ai_quiet_min=30,
        ai_max_per_hour=2,
    )
    p = Peer.objects.create(account=a, peer_id=5, kind=PeerKind.USER, title="Sherzod")
    d = Dialog.objects.create(account=a, peer=p, top_msg_id=1, last_date=timezone.now())
    sent: list[dict[str, Any]] = []
    msgs: list[str] = []
    prompts: list[str] = []
    answer: dict[str, Any] = {"text": "Ha, SPZ 1500 omborda bor. Nechta kerak va telefon raqamingiz?", "tools": []}
    channel = {"ok": True}

    def fake_send(owner_tg, chat_id, text):
        if not channel["ok"]:
            raise bizbot.NotSent("chat Business bot ro'yxatida emas")
        sent.append({"owner": owner_tg, "chat": chat_id, "text": text})
        n = Message.objects.filter(peer=p).count() + 100
        Message.objects.create(account=a, peer=p, msg_id=n, date=timezone.now(), text=text, out=True, by_ai=True)
        return n

    def fake_agent(system, prompt, ctx):
        prompts.append(system + prompt)
        for name, *args in answer["tools"]:
            getattr(assistant, name)(ctx, *args)
        return answer["text"]

    monkeypatch.setattr(bizbot, "send", fake_send)
    monkeypatch.setattr(bizbot, "status", lambda owner_tg: {"ok": channel["ok"], "detail": ""})
    monkeypatch.setattr(assistant, "agent_reply", fake_agent)
    from config.apps.core import telegram

    monkeypatch.setattr(telegram, "send_message", lambda chat_id, text: msgs.append(f"{chat_id}:{text}") or True)
    return {
        "a": a,
        "p": p,
        "d": d,
        "sent": sent,
        "msgs": msgs,
        "prompts": prompts,
        "answer": answer,
        "channel": channel,
    }


def incoming(s, mid, text="Spz 1500 bormi?", minutes_ago=0):
    Message.objects.create(
        account=s["a"], peer=s["p"], msg_id=mid, date=timezone.now() - timedelta(minutes=minutes_ago), text=text
    )


def test_reply_and_guards(setup):
    s = setup
    incoming(s, 1)
    assert assistant.reply(s["a"].pk, 5, 1) == "javob"
    assert s["sent"][-1] == {"owner": ACC_TG, "chat": 5, "text": s["answer"]["text"]}
    assert AccountEvent.objects.filter(kind="ai_reply").count() == 1  # egasidan yashirilmaydi
    assert (
        "Narx — qat'iy taqiq" in s["prompts"][-1]
        and "SKIP" in s["prompts"][-1]
        and "Spz 1500 bormi?" in s["prompts"][-1]
    )
    # javob berildi — oxirgi xabar chiquvchi
    assert assistant.reply(s["a"].pk, 5, 1) == "yangiroq xabar bor yoki javob berilgan"
    # ketma-ket: eski xabar uchun vazifa — o'tkazib yuboriladi, oxirgisiga javob
    incoming(s, 200)
    incoming(s, 201)
    assert assistant.reply(s["a"].pk, 5, 200) == "yangiroq xabar bor yoki javob berilgan"
    assert assistant.reply(s["a"].pk, 5, 201) == "javob"
    incoming(s, 300)
    assert assistant.reply(s["a"].pk, 5, 300) == "soatlik limit"  # soatiga 2 ta
    # odam yozgan — AI jim (bot xabarlari "odam" hisoblanmaydi)
    AccountEvent.objects.filter(kind="ai_reply").update(at=timezone.now() - timedelta(hours=2))
    assert assistant.reply(s["a"].pk, 5, 300) == "javob"
    Message.objects.create(
        account=s["a"], peer=s["p"], msg_id=301, date=timezone.now(), text="Men javob beraman", out=True
    )
    incoming(s, 302)
    assert assistant.reply(s["a"].pk, 5, 302) == "odam yozmoqda"


def test_stale_reply_not_sent(setup, monkeypatch):
    """Agent ishlayotganda mijoz yana yozsa — eskirgan javob yuborilmaydi (keyingi vazifa javob beradi)."""
    s = setup

    def slow_agent(system, prompt, ctx):
        incoming(s, 2, "yana savol")
        return "javob"

    incoming(s, 1)
    monkeypatch.setattr(assistant, "agent_reply", slow_agent)
    assert assistant.reply(s["a"].pk, 5, 1) == "yangiroq xabar bor yoki javob berilgan" and not s["sent"]


def test_skip_off_channel_and_chat_types(setup):
    s = setup
    incoming(s, 1, "Uka, kechqurun choyga kelasanmi?")
    s["answer"]["text"] = "SKIP"
    assert assistant.reply(s["a"].pk, 5, 1) == "skip" and not s["sent"]
    s["answer"]["text"] = "Salom!"
    s["channel"]["ok"] = False  # Business bot ulanmagan — Telethon orqali yuborilmaydi
    assert assistant.reply(s["a"].pk, 5, 1) == "kanal yo'q" and not s["sent"]
    s["channel"]["ok"] = True
    Dialog.objects.filter(pk=s["d"].pk).update(ai_off=True)
    assert assistant.reply(s["a"].pk, 5, 1) == "chatda o'chiq"
    Dialog.objects.filter(pk=s["d"].pk).update(ai_off=False)
    colleague = User.objects.create_user(5, "Sherzod", "employee")  # hamkasb — AI aralashmaydi
    assert assistant.reply(s["a"].pk, 5, 1) == "xodim"
    colleague.delete()
    Peer.objects.filter(pk=s["p"].pk).update(kind=PeerKind.BOT)
    assert assistant.reply(s["a"].pk, 5, 1) == "chat turi"
    Account.objects.filter(pk=s["a"].pk).update(ai_enabled=False)
    assert assistant.reply(s["a"].pk, 5, 1) == "o'chiq"
    assert assistant.schedule(s["a"].pk, 5, 1) is False


def test_send_error_logged(setup, monkeypatch):
    s = setup
    incoming(s, 1)
    s["channel"]["ok"] = True

    def refuse(owner_tg, chat_id, text):
        raise bizbot.NotSent("chat Business bot ro'yxatida emas yoki mijoz 24 soatdan beri yozmagan")

    monkeypatch.setattr(bizbot, "send", refuse)
    assert assistant.reply(s["a"].pk, 5, 1) == "yuborilmadi"
    assert AccountEvent.objects.get(kind="ai_error").detail.endswith("24 soatdan beri yozmagan")


def test_order_and_handoff(setup):
    s = setup
    incoming(s, 1, "SPZ 1500 2 ta kerak, 90 123 45 67")
    s["answer"].update(
        text="Buyurtma qabul qilindi, menejer bog'lanadi.", tools=[("take_order", "SPZ 1500 — 2 dona", "90 123 45 67")]
    )
    assert assistant.reply(s["a"].pk, 5, 1) == "javob"
    c = Contact.objects.get(tg_user_id=5)
    assert c.phone == "+998 90 123 45 67" and c.stage == Stage.QUALIFIED
    assert Note.objects.filter(contact=c, text__contains="SPZ 1500 — 2 dona").exists()
    t = Task.objects.get()
    assert t.assignee_tg == OWNER and t.title.startswith("AI: buyurtma")
    assert s["msgs"][0].startswith(f"{OWNER}:") and "+998 90 123 45 67" in s["msgs"][0]
    # ikkinchi chaqiruv — yangi vazifa yaratilmaydi (ochiq AI vazifasi bor), xabar boradi
    incoming(s, 500, "narxi qancha?")
    s["answer"].update(text="Narxni menejer yozadi.", tools=[("handoff", "narx so'rayapti")])
    assert assistant.reply(s["a"].pk, 5, 500) == "javob"
    assert Task.objects.count() == 1 and len(s["msgs"]) == 2
    assert AccountEvent.objects.filter(kind__in=["ai_order", "ai_handoff"]).count() == 2


def test_tools_direct(setup, monkeypatch):
    s = setup
    ctx = assistant.Ctx(s["a"], s["d"], dry=True)
    assert assistant.take_order(ctx, "B 1450", "12345").startswith("Xato: telefon")
    assert assistant.take_order(ctx, "", "+998901234567").startswith("Xato: nima")
    assert "sinov" in assistant.take_order(ctx, "B 1450", "+998 90 123-45-67")
    assert not Task.objects.exists() and not Contact.objects.exists()  # quruq sinov — hech narsa yozilmaydi
    assert assistant.norm_phone("901234567") == "+998 90 123 45 67"
    assert assistant.norm_phone("+7 999 123 45 67") is None
    monkeypatch.setattr(
        stock, "check", lambda sp: {"status": stock.ORDER, "near": [{"label": "SPB 1600", "diff_mm": -50}]}
    )
    monkeypatch.setattr(
        remen, "search", lambda q, limit=5: [{"name": "SPB 1650", "url": "https://remen.uz/product/1-x"}]
    )
    out = assistant.find_product("SPB1650")
    assert "klinli" in out and "zakazga" in out and "SPB 1600 (-50 mm)" in out and "remen.uz" in out
    monkeypatch.setattr(stock, "check", lambda sp: {"status": stock.UNKNOWN, "near": []})
    assert "menejer tekshirib" in assistant.find_product("B 1450")
    monkeypatch.setattr(remen, "search", lambda q, limit=5: [])
    assert "aniqlanmadi" in assistant.find_product("konveyer lenta")


def test_schedule_uses_delay(setup, monkeypatch):
    from config.apps.tgcrm import tasks

    got = []
    monkeypatch.setattr(tasks.ai_reply, "apply_async", lambda args, countdown: got.append((args, countdown)))
    assert assistant.schedule(setup["a"].pk, 5, 7) is True and got == [((setup["a"].pk, 5, 7), 8)]


def test_api(setup, client, monkeypatch, depts):
    s = setup
    base = f"/app/api/tgcrm/accounts/{s['a'].pk}"
    other = User.objects.create_user(202, "Dilshod", "employee")
    set_departments(other, [depts["sotuv"].key])
    client.force_login(other)
    assert client.get(f"{base}/ai").status_code == 404  # birovning shaxsiy akkaunti
    client.force_login(User.objects.get(tg_id=OWNER))
    r = client.get(f"{base}/ai").json()
    assert r["ai_enabled"] and r["can_edit"] and r["replies_24h"] == 0
    assert r["channel"]["ok"] is True and r["stock"]["ok"] is False and r["log"] == []
    s["channel"]["ok"] = False  # Business bot ulanmagan — yoqib bo'lmaydi
    assert client.patch(f"{base}/ai", {"ai_enabled": True}, content_type="application/json").status_code == 400
    s["channel"]["ok"] = True
    r = client.patch(
        f"{base}/ai",
        {"ai_enabled": False, "ai_instructions": "Ish vaqti 9–18", "ai_delay_sec": 1},
        content_type="application/json",
    )
    assert r.status_code == 400
    r = client.patch(
        f"{base}/ai", {"ai_enabled": False, "ai_instructions": "Ish vaqti 9–18"}, content_type="application/json"
    ).json()
    assert r["ai_enabled"] is False and r["ai_instructions"] == "Ish vaqti 9–18"
    assert client.post(f"{base}/chats/5/ai-off", {"off": True}, content_type="application/json").json() == {
        "ai_off": True
    }
    monkeypatch.setattr(llm, "complete", lambda system, prompt, model=None: "Mijoz SPZ 1500 so'radi.")
    incoming(s, 1)
    assert (
        client.post(f"{base}/chats/5/ai", {"mode": "summary"}, content_type="application/json").json()["answer"]
        == "Mijoz SPZ 1500 so'radi."
    )
    assert client.post(f"{base}/chats/5/ai", {}, content_type="application/json").status_code == 400
    # avtomatik javob ko'rinishi — yubormasdan, vositalar hech narsa yozmaydi; chatda AI o'chiq bo'lsa — aytadi
    assert (
        "chatda o'chiq"
        in client.post(f"{base}/chats/5/ai", {"mode": "auto"}, content_type="application/json").json()["answer"]
    )
    Dialog.objects.filter(pk=s["d"].pk).update(ai_off=False)
    s["answer"].update(text="Buyurtma qabul qilindi.", tools=[("take_order", "B 1450 — 2 dona", "901234567")])
    ans = client.post(f"{base}/chats/5/ai", {"mode": "auto"}, content_type="application/json").json()["answer"]
    assert ans.startswith("Buyurtma qabul qilindi.") and "sinovda bajarilmadi" in ans and "B 1450" in ans
    assert not s["sent"] and not Task.objects.exists()
    s["answer"].update(text="SKIP", tools=[])
    assert (
        "javob bermaydi"
        in client.post(f"{base}/chats/5/ai", {"mode": "auto"}, content_type="application/json").json()["answer"]
    )
