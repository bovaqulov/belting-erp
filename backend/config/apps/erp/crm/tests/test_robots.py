"""CRM robotlari: muddati BUGUN, javobsiz lid / taqsimlanmagan lid / muddati o'tgan vazifa eslatmalari, ish vaqti."""

from datetime import datetime, timedelta

import pytest
from django.utils import timezone

from config.apps.erp.crm import robots
from config.apps.erp.crm.models import Activity, Deal, Lead, Stage
from config.apps.staff.models import User

pytestmark = pytest.mark.django_db
# ish vaqti: Toshkent 10:00
NOON = timezone.make_aware(datetime(2026, 11, 16, 10, 0))
NIGHT = timezone.make_aware(datetime(2026, 11, 16, 23, 0))


@pytest.fixture
def sent(monkeypatch):
    got: list[tuple[int, str]] = []

    def fake(chat_id, text):
        got.append((chat_id, text))
        return True

    monkeypatch.setattr(robots, "send_message", fake)
    return got


def deal(stage: str, close: int | None, owner: int = 201) -> Deal:
    t = NOON - timedelta(days=5)
    return Deal.objects.create(
        title="Buyurtma",
        owner_tg=owner,
        stage=Stage.objects.get(code=stage),
        stage_since=t,
        created=t,
        updated=t,
        close_date=(NOON + timedelta(days=close)).date() if close is not None else None,
    )


def test_javobsiz_lid_va_taqsimlanmagan(sent, depts):
    head = User.objects.create_user(100, "Rahbar", "admin")
    old = Lead.objects.create(
        created=NOON - timedelta(minutes=40), name="Bobur", note="SPB kerak", owner_tg=201, status="new"
    )
    Lead.objects.create(created=NOON - timedelta(minutes=10), name="Yangi", owner_tg=201, status="new")  # hali erta
    Lead.objects.create(
        created=NOON - timedelta(minutes=40), name="Ishda", owner_tg=201, status="work"
    )  # javob berilgan
    free = Lead.objects.create(created=NOON - timedelta(minutes=20), name="Egasiz", status="new")
    assert robots.run(NIGHT).get("leads") is None  # kechasi — eslatma yo'q
    r = robots.run(NOON)
    assert r["leads"] == 2
    assert sent[0][0] == 201 and "Bobur" in sent[0][1] and "40 daqiqa" in sent[0][1]
    assert any(c == head.tg_id and "Taqsimlanmagan lidlar: 1" in t for c, t in sent)
    old.refresh_from_db()
    free.refresh_from_db()
    assert old.reminded_at and free.reminded_at
    sent.clear()
    assert robots.run(NOON)["leads"] == 0 and not sent  # bir marta


def test_muddati_otgan_vazifa(sent, monkeypatch):
    d = deal("offer", None)
    Activity.objects.create(
        deal=d, kind="task", ts=NOON, text="Qo'ng'iroq qilish", due=NOON - timedelta(hours=1), assignee=201
    )
    Activity.objects.create(deal=d, kind="task", ts=NOON, text="Ertaga", due=NOON + timedelta(days=1), assignee=201)
    Activity.objects.create(
        deal=d, kind="task", ts=NOON, text="Bajarilgan", due=NOON - timedelta(hours=1), assignee=201, done_at=NOON
    )
    assert robots.run(NOON)["tasks"] == 1
    assert sent == [(201, sent[0][1])] and "Qo'ng'iroq qilish" in sent[0][1]
    assert robots.run(NOON)["tasks"] == 0
    # yuborilmasa — belgilanmaydi, keyin qayta urinadi
    monkeypatch.setattr(robots, "send_message", lambda c, t: False)
    Activity.objects.create(deal=d, kind="task", ts=NOON, text="Yana", due=NOON - timedelta(hours=1), assignee=202)
    assert robots.run(NOON)["tasks"] == 0
    assert not (Activity.objects.get(text="Yana").data or {}).get("reminded")


def test_takroriy_savdo(sent):
    from config.apps.erp.crm.models import Customer

    c = Customer.objects.create(name="Navoiy Konveyer", owner_tg=201)
    items = [{"item_id": 1, "name": "SPB 1650", "qty": "10", "price": "185000", "discount": "0"}]

    def bought(days_ago: int):
        t = NOON - timedelta(days=days_ago)
        return Deal.objects.create(
            title="SPB",
            customer=c,
            owner_tg=201,
            amount=1_850_000,
            items=items,
            stage=Stage.objects.get(code="won"),
            stage_since=t,
            created=t,
            updated=t,
            closed=t,
            division="novobelt",
        )

    bought(120)
    bought(60)  # oraliq 60 kun → keyingi xarid 60 kundan keyin, 7 kun oldin — 53-kun
    assert robots.repeat_cycle([(NOON - timedelta(days=x)).date() for x in (120, 60)]) == 60
    assert robots.repeat_sales(NOON - timedelta(days=10)) == 0  # 50-kun — hali erta
    assert robots.repeat_sales(NOON) == 1
    d = Deal.objects.get(repeat=True)
    assert (
        d.stage_id == "new"
        and d.owner_tg == 201
        and d.items == items
        and d.division == "novobelt"
        and d.source == "existing"
    )
    assert Activity.objects.filter(deal=d, kind="task", assignee=201).exists()
    assert robots.repeat_sales(NOON) == 0  # ochiq bitim bor — takror yo'q
    # bitta xarid — 90 kun
    c2 = Customer.objects.create(name="Bir martalik", owner_tg=202)
    t = NOON - timedelta(days=50)
    Deal.objects.create(
        title="x",
        customer=c2,
        owner_tg=202,
        stage=Stage.objects.get(code="shipping"),
        stage_since=t,
        created=t,
        updated=t,
    )
    assert robots.repeat_sales(NOON) == 0


def test_takroriy_savdo_kuniga_bir_marta(sent, monkeypatch):
    calls: list = []
    monkeypatch.setattr(robots, "repeat_sales", lambda now: calls.append(now) or 0)
    robots.run(timezone.make_aware(datetime(2026, 11, 16, 9, 2)))
    robots.run(timezone.make_aware(datetime(2026, 11, 16, 9, 7)))
    robots.run(NOON)
    assert len(calls) == 1


def test_sla_va_qayta_qongiroq(sent):
    late = deal("contract", None)  # SLA 24 soat, bosqichda 5 kun
    late.stage_since = NOON - timedelta(hours=30)
    late.save()
    fresh = deal("new", None)
    fresh.stage_since = NOON - timedelta(hours=2)
    fresh.save()
    lead = Lead.objects.create(
        created=NOON - timedelta(days=2),
        name="Bobur",
        phone="998901234567",
        owner_tg=201,
        status="work",
        no_answer=1,
        next_call_at=NOON - timedelta(minutes=5),
    )
    r = robots.run(NOON)
    assert r["sla"] == 1 and r["callbacks"] == 1
    assert any("Bosqich muddati o'tdi" in t and "Shartnoma" in t for _, t in sent)
    assert any("Qayta qo'ng'iroq: Bobur +998901234567" in t for _, t in sent)
    sent.clear()
    r = robots.run(NOON)
    assert r["sla"] == 0 and r["callbacks"] == 0 and not sent  # bir marta
    lead.refresh_from_db()
    assert lead.call_reminded_at is not None
