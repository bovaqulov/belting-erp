"""CRM API: kontrakt (frontend demo server.lib bilan bir xil), huquqlar (rahbar / sotuvchi), bosqich, lidlar, reja."""

from datetime import timedelta

import pytest
from django.utils import timezone

from config.apps.erp.crm.models import Activity, Customer, Deal, Lead, Stage
from config.apps.staff.models import User
from config.apps.staff.services import set_departments

pytestmark = pytest.mark.django_db
C = "/app/api/erp/crm"
HEAD, S1, S2 = 100, 201, 202


@pytest.fixture
def team(depts):
    head = User.objects.create_user(HEAD, "Rahbar", "employee")
    set_departments(head, [depts["sotuv"].key])
    sellers = []
    for tg, name in ((S1, "Akmal"), (S2, "Dilshod")):
        u = User.objects.create_user(tg, name, "employee", manager=head)
        set_departments(u, [depts["sotuv"].key])
        sellers.append(u)
    return {"head": head, "s1": sellers[0], "s2": sellers[1]}


def as_(client, u):
    client.force_login(u)
    return client


def post(client, path, body=None):
    return client.post(path, body or {}, content_type="application/json")


def deal(owner, title="Bitim", stage="new", days_ago=0, customer=None, amount=1_000_000):
    t = timezone.now() - timedelta(days=days_ago)
    return Deal.objects.create(
        title=title,
        owner_tg=owner,
        stage=Stage.objects.get(code=stage),
        stage_since=t,
        created=t,
        updated=t,
        customer=customer,
        amount=amount,
    )


def test_meta_va_me(client, team):
    as_(client, team["head"])
    m = client.get(f"{C}/meta").json()
    assert [(p["code"], p["name"]) for p in m["pipelines"]] == [("main", "Sales")]  # faqat Sales
    assert m["stages"][0] == {
        "code": "new",
        "name": "Yangi",
        "pipeline": "main",
        "kind": "open",
        "color": "#3e88f7",
        "probability": 10,
        "guide": "Ehtiyojni aniqlang va 24 soat ichida narx va muddat ko'rsatilgan tijorat taklifini yuboring.",
        "sla_hours": 24,
    }
    assert {d["code"] for d in m["divisions"]} == {"novobelt", "belting"}
    assert {u["tg_id"] for u in m["users"]} == {HEAD, S1, S2}
    assert "Qimmat" in m["lost_reasons"]
    assert client.get("/app/api/erp/me").json()["is_head"] is True
    as_(client, team["s1"])
    assert client.get("/app/api/erp/me").json()["is_head"] is False


def test_kirish_talab(client, team):
    assert client.get(f"{C}/meta").status_code == 401
    client.force_login(User.objects.create_user(999, "Boshqa bo'lim", "employee"))
    r = client.get(f"{C}/meta")
    assert r.status_code == 403 and "Sotuv" in r.json()["detail"]


def test_kanban_va_huquq(client, team):
    mine = deal(S1, "SPB 1650 — 25 dona", amount=4_600_000)
    other = deal(S2, "B-1800")
    deal(S1, "Eski", stage="offer", days_ago=10)  # rot_days=7 → chirigan
    as_(client, team["s1"])
    b = client.get(f"{C}/board?pipeline=main").json()
    assert b["counts"] == {"main": 2}
    new = next(s for s in b["stages"] if s["code"] == "new")
    assert [d["id"] for d in new["deals"]] == [mine.pk]
    assert new["amount"] == "4600000" and new["weighted"] == "460000"
    qual = next(s for s in b["stages"] if s["code"] == "offer")
    assert qual["rotten"] == 1 and qual["deals"][0]["rotten"] is True
    assert client.get(f"{C}/deals/{other.pk}").status_code == 404
    assert post(client, f"{C}/deals/{other.pk}/stage", {"stage": "offer"}).status_code == 404
    as_(client, team["head"])
    assert client.get(f"{C}/board").json()["counts"]["main"] == 3


def test_qidiruv_va_idle(client, team):
    c = Customer.objects.create(name="Navoiy Konveyer", inn="305112847", phones=["998901234567"], owner_tg=S1)
    d = deal(S1, "Remen", customer=c)
    deal(S1, "Juda eski", days_ago=320)
    as_(client, team["head"])
    for q in ("navoiy", "305112", "1234567", f"%23{d.pk}"):
        assert [r["id"] for r in client.get(f"{C}/deals?q={q}").json()["rows"]] == [d.pk], q
    r = client.get(f"{C}/deals?idle=300&limit=1").json()
    assert r["total"] == 1 and r["rows"][0]["title"] == "Juda eski"


def test_bosqich_tarix_va_rad(client, team):
    d = deal(S1)
    as_(client, team["s1"])
    r = post(client, f"{C}/deals/{d.pk}/stage", {"stage": "offer"}).json()
    assert r["stage"] == "offer" and r["stages"][-1] == {**r["stages"][-1], "from_stage": "new", "to_stage": "offer"}
    assert post(client, f"{C}/deals/{d.pk}/stage", {"stage": "lost"}).status_code == 400
    r = post(client, f"{C}/deals/{d.pk}/stage", {"stage": "lost", "reason": "Qimmat"}).json()
    assert r["lost_reason"] == "Qimmat" and r["closed"]


def test_yangi_bitim_mijoz_va_masul(client, team):
    foreign = Customer.objects.create(name="Begona", owner_tg=S2)
    as_(client, team["s1"])
    c = post(client, f"{C}/customers", {"name": "Yangi Zavod", "phones": ["+998 90 111 22 33"], "owner_tg": S2}).json()
    assert c["owner_tg"] == S1 and c["phones"] == ["998901112233"]
    assert [x["id"] for x in client.get(f"{C}/customers?q=zavod").json()] == [c["id"]]
    assert client.get(f"{C}/customers?q=begona").json() == []
    assert post(client, f"{C}/deals", {"counterparty_id": foreign.pk, "title": "x"}).status_code == 404
    d = post(
        client, f"{C}/deals", {"counterparty_id": c["id"], "title": "Remen", "owner_tg": S2, "amount": "1 500 000"}
    ).json()
    assert d["owner_tg"] == S1 and d["amount"] == "1500000" and d["stage"] == "new" and d["customer"] == "Yangi Zavod"
    assert post(client, f"{C}/deals/{d['id']}", {"owner_tg": S2}).status_code == 403
    assert (
        post(client, f"{C}/deals/{d['id']}", {"close_date": "2026-12-01", "probability": 60}).json()["close_date"]
        == "2026-12-01"
    )
    as_(client, team["head"])
    assert post(client, f"{C}/deals/{d['id']}", {"owner_tg": S2}).json()["owner_tg"] == S2


def test_tovarlar_hujjat_faoliyat_vazifa(client, team):
    d = deal(S1)
    as_(client, team["s1"])
    r = post(
        client,
        f"{C}/deals/{d.pk}/items",
        {
            "items": [
                {"item_id": 1, "name": "SPB 1650", "qty": 10, "price": 185000, "discount": 10},
                {"name": "Qo'lda", "qty": 1, "price": 5000},
            ]
        },
    ).json()
    assert r["amount"] == "1670000"
    doc = post(client, f"{C}/deals/{d.pk}/doc", {"kind": "quote"}).json()
    assert doc["number"].startswith("BR-TT-") and doc["total"] == "1665000" and doc["status"] == "posted"
    assert post(client, f"{C}/activity", {"deal_id": d.pk, "kind": "task", "text": "Qo'ng'iroq"}).status_code == 400
    t = post(
        client, f"{C}/activity", {"deal_id": d.pk, "kind": "task", "text": "Qo'ng'iroq", "due": "2030-01-02T10:00"}
    ).json()
    assert t["assignee"] == S1 and t["due"]
    assert client.get(f"{C}/board").json()["stages"][0]["deals"][0]["next_task"] == t["due"]
    done = post(client, f"{C}/tasks/{t['id']}/done", {"result": "Gaplashildi"}).json()
    assert done["done_at"] and done["data"] == {"result": "Gaplashildi"}
    det = client.get(f"{C}/deals/{d.pk}").json()
    assert [a["kind"] for a in det["activity"]] == ["task", "doc"] and len(det["docs"]) == 1
    as_(client, team["s2"])
    assert post(client, f"{C}/tasks/{t['id']}/done").status_code == 404


def test_lidlar(client, team):
    as_(client, team["head"])
    # rahbar kiritdi — qo'lda taqsimlamaydi: navbat bo'yicha sotuvchiga (S1 — eng kam lid, ism bo'yicha birinchi)
    free = post(client, f"{C}/leads", {"name": "Bobur", "phone": "90 123 45 67", "note": "SPB kerak"}).json()
    assert free["status"] == "new" and free["owner_tg"] == S1 and free["phone"] == "998901234567"
    dup = post(client, f"{C}/leads", {"phone": "+998901234567", "note": "yana"}).json()
    assert dup["duplicate"] is True and dup["id"] == free["id"]
    second = post(client, f"{C}/leads", {"name": "Sardor", "phone": "93 555 01 17"}).json()
    assert second["owner_tg"] == S2  # navbat

    as_(client, team["s1"])
    assert [x["id"] for x in client.get(f"{C}/leads").json()] == [free["id"]]
    own = post(client, f"{C}/leads", {"name": "O'zim", "owner_tg": S2}).json()
    assert own["owner_tg"] == S1 and own["status"] == "work"  # sotuvchi o'zi kiritdi (qo'ng'iroq)
    assert post(client, f"{C}/leads/{own['id']}/assign", {"owner_tg": S2}).status_code == 403
    # kvalifikatsiyasiz bitimga aylanmaydi
    r = post(client, f"{C}/leads/{free['id']}/convert")
    assert r.status_code == 400 and "tasma turi" in r.json()["detail"]
    q = post(
        client,
        f"{C}/leads/{free['id']}/edit",
        {"company": "Chinoz Un MChJ", "inn": "305112847", "product": "SPB", "size": "1650", "qty": "25 dona"},
    ).json()
    assert (q["product"], q["inn"]) == ("SPB", "305112847")
    assert post(client, f"{C}/leads/{free['id']}/edit", {"inn": "123"}).status_code == 400
    d = post(client, f"{C}/leads/{free['id']}/convert").json()
    assert d["owner_tg"] == S1 and d["customer"] == "Chinoz Un MChJ" and d["title"] == "SPB 1650 — 25 dona"
    assert "Tasma: SPB" in d["need"] and "SPB kerak\nyana" in d["need"]
    assert Customer.objects.get(name="Chinoz Un MChJ").inn == "305112847"
    assert Lead.objects.get(pk=free["id"]).status == "converted"
    assert post(client, f"{C}/leads/{free['id']}/convert").status_code == 400
    assert post(client, f"{C}/leads/{own['id']}/junk", {"reason": ""}).status_code == 400  # sabab majburiy
    assert post(client, f"{C}/leads/{own['id']}/junk", {"reason": "Adashgan"}).json()["status"] == "junk"


def test_doimiy_mijoz_togridan_bitim(client, team):
    c = Customer.objects.create(name="Navoiy Konveyer", inn="305112847", phones=["998901234567"], owner_tg=S2)
    as_(client, team["head"])
    r = post(
        client, f"{C}/leads", {"name": "Rahim", "phone": "90 123 45 67", "note": "Yana SPB kerak", "source": "call"}
    ).json()
    assert r["routed"] == "deal" and r["existing"] is False and not Lead.objects.exists()
    d = Deal.objects.get(pk=r["deal_id"])
    assert (d.owner_tg, d.customer_id, d.repeat, d.stage_id, d.source) == (S2, c.pk, True, "new", "call")
    # ochiq bitimi bor — yangi bitim emas, izoh
    r2 = post(client, f"{C}/leads", {"inn": "305112847", "note": "Narxni so'radi"}).json()
    assert r2 == {"routed": "deal", "deal_id": d.pk, "existing": True}
    assert Deal.objects.count() == 1 and Activity.objects.filter(deal=d, text__contains="Narxni so'radi").exists()


def test_javob_bermadi_1_3_7(client, team):
    as_(client, team["s1"])
    lead = post(client, f"{C}/leads", {"name": "Bobur", "phone": "90 123 45 67"}).json()
    for n, days in ((1, 1), (2, 3), (3, 7)):
        r = post(client, f"{C}/leads/{lead['id']}/noanswer").json()
        assert r["no_answer"] == n and r["status"] == "work"
        due = timezone.datetime.fromisoformat(r["next_call_at"].replace("Z", "+00:00"))
        assert abs((due - timezone.now()).total_seconds() - days * 86400) < 60
    r = post(client, f"{C}/leads/{lead['id']}/noanswer").json()
    assert r["status"] == "junk" and r["junk_reason"].startswith("Javob bermadi")


def test_taklif_tolov_ishlab_chiqarish_jonatish_yutish(client, team):
    d = deal(S1, "SPB", amount=10_000_000)
    as_(client, team["s1"])
    post(client, f"{C}/deals/{d.pk}/stage", {"stage": "offer"})
    tasks = list(Activity.objects.filter(deal=d, kind="task").order_by("due"))
    assert [t.text for t in tasks] == [
        "Taklif bo'yicha mijozga qayta yozing (2-kun)",
        "Taklif bo'yicha mijozga qayta yozing (5-kun)",
    ]
    post(client, f"{C}/deals/{d.pk}", {"pay_terms": "half", "sign_status": "sent"})
    d.refresh_from_db()
    assert d.sign_sent_at is not None
    post(client, f"{C}/deals/{d.pk}/stage", {"stage": "contract"})
    assert post(client, f"{C}/deals/{d.pk}/stage", {"stage": "production"}).status_code == 400  # to'lovsiz
    r = post(client, f"{C}/deals/{d.pk}/payment", {"amount": 5_000_000, "via": "bank"}).json()
    assert r["stage"] == "production" and r["paid_sum"] == "5000000"  # 50% — avtomatik
    post(client, f"{C}/deals/{d.pk}/stage", {"stage": "ready"})  # Telegram chat yo'q — izoh
    assert Activity.objects.filter(deal=d, text__startswith="Tayyor: mijozga bog'langan Telegram chat yo'q").exists()
    r = post(client, f"{C}/deals/{d.pk}/stage", {"stage": "shipping"})
    assert r.status_code == 400 and "Qolgan to'lov" in r.json()["detail"]
    post(client, f"{C}/deals/{d.pk}/payment", {"amount": 5_000_000})
    assert post(client, f"{C}/deals/{d.pk}/stage", {"stage": "shipping"}).status_code == 200
    r = post(client, f"{C}/deals/{d.pk}/stage", {"stage": "won"})
    assert r.status_code == 400 and "dalolatnoma" in r.json()["detail"]
    post(client, f"{C}/deals/{d.pk}", {"docs_done": True})
    assert post(client, f"{C}/deals/{d.pk}/stage", {"stage": "won"}).json()["stage"] == "won"
    assert post(client, f"{C}/deals/{d.pk}/payment", {"amount": 0}).status_code == 400


def test_sayt_orqali_lid(client, team, settings):
    settings.CRM_INTAKE_TOKEN = "s3cret"
    url = f"{C}/intake"
    assert client.post(url, {"name": "X"}, content_type="application/json").status_code == 403
    r = client.post(
        url,
        {"name": "Saytdan", "phone": "97 700 11 22", "product": "Konveyer lenta"},
        content_type="application/json",
        headers={"X-Intake-Token": "s3cret"},
    )
    assert r.status_code == 200 and r.json()["source"] == "site" and r.json()["owner_tg"] in (S1, S2)
    assert (
        client.post(url, {}, content_type="application/json", headers={"X-Intake-Token": "s3cret"}).status_code == 400
    )


def test_reja(client, team):
    d = deal(S1, amount=50_000_000)
    month = timezone.localdate().strftime("%Y-%m")
    as_(client, team["s1"])
    assert post(client, f"{C}/goals", {"owner_tg": S1, "month": month, "amount": 100_000_000}).status_code == 403
    as_(client, team["head"])
    assert post(client, f"{C}/goals", {"owner_tg": S1, "month": month, "amount": 100_000_000}).status_code == 200
    post(client, f"{C}/deals/{d.pk}", {"docs_done": True})
    post(client, f"{C}/deals/{d.pk}/stage", {"stage": "won"})
    g = client.get(f"{C}/goals?month={month}").json()
    r = next(x for x in g["rows"] if x["tg_id"] == S1)
    assert g["can_edit"] is True and r == {**r, "plan": "100000000", "sales": "50000000", "pct": 50.0, "won_deals": 1}
    assert not Activity.objects.filter(kind="task").exists()


def test_karta_maydonlari(client, team):
    d = deal(S1, "SPB 1650 — 25 dona", amount=4_600_000)
    as_(client, team["s1"])
    r = post(
        client,
        f"{C}/deals/{d.pk}",
        {"division": "novobelt", "buyer_order": "H-0H-002014", "contact": "Rahim", "repeat": True},
    ).json()
    assert (r["division"], r["buyer_order"], r["contact"], r["repeat"], r["pipeline"]) == (
        "novobelt",
        "H-0H-002014",
        "Rahim",
        True,
        "main",
    )
    assert post(client, f"{C}/deals/{d.pk}", {"division": "boshqa"}).status_code == 400
    # «To'lov olindi» — boshqa voronkaga hech narsa ochilmaydi (ishlab chiqarish — alohida tizim)
    post(client, f"{C}/deals/{d.pk}/stage", {"stage": "paid"})
    assert not Deal.objects.filter(parent=d).exists()


def test_mijozlar_jadvali_va_kartochka(client, team):
    from config.apps.erp.crm.models import Customer

    c = Customer.objects.create(name="Navoiy Konveyer", inn="305112847", owner_tg=S1)
    other = Customer.objects.create(name="Begona", owner_tg=S2)
    for days_ago in (130, 70):
        d = deal(S1, "SPB", customer=c, amount=2_000_000, days_ago=days_ago)
        d.stage = Stage.objects.get(code="won")
        d.closed = d.stage_since
        d.save()
    deal(S1, "Ochiq", customer=c)
    as_(client, team["s1"])
    t = client.get(f"{C}/customers/table").json()
    assert [r["name"] for r in t["rows"]] == ["Navoiy Konveyer"]  # begona yo'q
    r = t["rows"][0]
    assert (r["bought_n"], r["bought_sum"], r["cycle"], r["open_n"]) == (2, "4000000", 60, 1)
    assert r["next_buy"] and r["overdue"] is False  # ochiq bitim bor
    assert client.get(f"{C}/customers/{other.pk}").status_code == 404
    k = post(
        client,
        f"{C}/customers/{c.pk}",
        {
            "contacts": [{"name": "Rahim", "role": "ta'minotchi", "phone": "90 123 45 67"}, {"name": "", "phone": ""}],
            "phones": ["+998 71 200 00 00"],
            "note": "To'lov — 50% oldindan",
        },
    ).json()
    assert k["contacts"] == [{"name": "Rahim", "role": "ta'minotchi", "phone": "998901234567"}]
    assert k["phones"] == ["998712000000"] and k["note"].startswith("To'lov")
    assert k["stats"]["bought_n"] == 2 and len(k["deals"]) == 3
    assert post(client, f"{C}/customers/{c.pk}", {"inn": "123"}).status_code == 400
    assert post(client, f"{C}/customers/{c.pk}", {"owner_tg": S2}).status_code == 403
    assert client.get(f"{C}/customers/table?q=rahim").json()["total"] == 1  # kontakt bo'yicha qidiruv


def test_hisobot(client, team):
    from config.apps.erp.crm.models import Lead

    now = timezone.now()
    # lidlar: S1 — 2 ta (10 va 30 daqiqada javob, biri bitimga), S2 — 1 ta
    Lead.objects.create(
        created=now - timedelta(hours=3),
        name="A",
        owner_tg=S1,
        status="converted",
        source="telegram",
        first_touch=now - timedelta(hours=3) + timedelta(minutes=10),
    )
    Lead.objects.create(
        created=now - timedelta(hours=2),
        name="B",
        owner_tg=S1,
        status="work",
        source="call",
        first_touch=now - timedelta(hours=2) + timedelta(minutes=30),
    )
    Lead.objects.create(created=now - timedelta(hours=1), name="C", owner_tg=S2, status="new", source="telegram")
    a = deal(S1, "A", amount=3_000_000)
    as_(client, team["s1"])
    post(client, f"{C}/deals/{a.pk}/stage", {"stage": "offer"})
    post(client, f"{C}/deals/{a.pk}", {"docs_done": True})
    post(client, f"{C}/deals/{a.pk}/stage", {"stage": "won"})
    b = deal(S1, "B", amount=1_000_000)
    post(client, f"{C}/deals/{b.pk}/stage", {"stage": "lost", "reason": "Qimmat"})
    deal(S2, "C")

    as_(client, team["head"])
    r = client.get(f"{C}/reports").json()
    k = r["kpi"]
    assert (k["leads"], k["deals"], k["won"], k["won_sum"], k["lost"], k["win_rate"], k["lead_conv"]) == (
        3,
        3,
        1,
        "3000000",
        1,
        50,
        33,
    )
    f = {x["stage"]: x["count"] for x in r["funnel"]}
    assert f["new"] == 3 and f["offer"] == 1 and f["won"] == 1  # A tarix bo'yicha taklifdan o'tgan
    s1 = next(x for x in r["sellers"] if x["tg_id"] == S1)
    assert (s1["leads"], s1["response_min"], s1["lead_conv"], s1["won"], s1["lost"]) == (2, 20, 50, 1, 1)
    assert r["reasons"] == [{"reason": "Qimmat", "count": 1, "sum": "1000000"}]
    assert r["sources"][0] == {"source": "telegram", "leads": 2, "converted": 1}

    as_(client, team["s2"])  # sotuvchi — faqat o'zi
    r = client.get(f"{C}/reports").json()
    assert [x["tg_id"] for x in r["sellers"]] == [S2] and r["kpi"]["leads"] == 1 and r["kpi"]["won"] == 0


def test_taqsimlash_qoidalari(client, team):
    as_(client, team["s1"])
    assert post(client, f"{C}/routing", {"rules": []}).status_code == 403  # faqat rahbar
    as_(client, team["head"])
    r = post(
        client,
        f"{C}/routing",
        {
            "rules": [
                {"kind": "product", "keywords": "konveyer, lenta", "seller_tg": S2},
                {"kind": "region", "keywords": "Samarqand", "seller_tg": S1},
            ]
        },
    )
    assert r.status_code == 200 and len(r.json()["rules"]) == 2
    assert (
        post(client, f"{C}/routing", {"rules": [{"kind": "product", "keywords": "", "seller_tg": S1}]}).status_code
        == 400
    )
    a = post(client, f"{C}/leads", {"name": "A", "product": "Konveyer lenta EP-400"}).json()
    b = post(client, f"{C}/leads", {"name": "B", "region": "Samarqand", "product": "SPB"}).json()
    c = post(client, f"{C}/leads", {"name": "C", "product": "SPB"}).json()  # mos qoida yo'q — navbat
    assert (a["owner_tg"], b["owner_tg"], b["region"]) == (S2, S1, "Samarqand")
    assert c["owner_tg"] in (S1, S2)


def test_keyinroq_sana_bilan(client, team):
    d = deal(S1, "SPB")
    as_(client, team["s1"])
    assert post(client, f"{C}/deals/{d.pk}/stage", {"stage": "later"}).status_code == 400  # sanasiz yo'q
    assert (
        post(client, f"{C}/deals/{d.pk}/stage", {"stage": "later", "recall": "01.01.2020"}).status_code == 400
    )  # o'tgan
    day = (timezone.localdate() + timedelta(days=10)).strftime("%d.%m.%Y")
    r = post(client, f"{C}/deals/{d.pk}/stage", {"stage": "later", "recall": day})
    assert r.status_code == 200 and r.json()["stage"] == "later"
    t = Activity.objects.get(deal=d, kind="task")
    assert timezone.localtime(t.due).strftime("%d.%m.%Y") == day and t.assignee == S1
