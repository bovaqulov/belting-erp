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
    from config.apps.erp.catalog.pricing import policy

    # narx siyosati (sinov): sotuvchi — 10% gacha, sotuv rahbari — 20% gacha chegirma
    policy().__class__.objects.filter(pk=1).update(max_disc_seller=10, max_disc_head=20)
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
    deal(S1, "Eski", stage="offer", days_ago=10)  # rot_days=7 → harakatsiz
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
    c = post(
        client,
        f"{C}/customers",
        {"name": "Yangi Zavod", "phones": ["+998 90 111 22 33"], "inn": "301000001", "owner_tg": S2},
    ).json()
    assert c["owner_tg"] == S1 and c["phones"] == ["998901112233"]
    assert [x["id"] for x in client.get(f"{C}/customers?q=zavod").json()] == [c["id"]]
    assert client.get(f"{C}/customers?q=begona").json() == []
    assert post(client, f"{C}/deals", {"counterparty_id": foreign.pk, "title": "x"}).status_code == 404
    d = post(
        client, f"{C}/deals", {"counterparty_id": c["id"], "title": "Remen", "owner_tg": S2, "amount": "1 500 000"}
    ).json()
    assert d["owner_tg"] == S1 and d["amount"] == "1500000" and d["stage"] == "new" and d["customer"] == "Yangi Zavod"
    assert d["title"] == f"#{d['id']} Remen"
    # tovarlar bilan yaratish — summa tovarlardan hisoblanadi
    d2 = post(
        client,
        f"{C}/deals",
        {
            "counterparty_id": c["id"],
            "title": "Tovarli",
            "amount": "5",
            "items": [{"name": "SPB 1650", "qty": "2", "price": "185000", "discount": "10"}],
        },
    ).json()
    assert d2["amount"] == "333000" and [x["name"] for x in d2["items"]] == ["SPB 1650"]
    # nom o'zgarsa ham raqam saqlanadi (qo'lda yozilgan boshqa «#N» almashtiriladi)
    assert post(client, f"{C}/deals/{d['id']}", {"title": "#7 Yangi nom"}).json()["title"] == f"#{d['id']} Yangi nom"
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
    # taklif tuzildi — ketma-ketlik: bitim avtomatik «Taklif yuborildi» ga o'tdi (va qayta yozish vazifalari qo'yildi)
    row = next(x for s in client.get(f"{C}/board").json()["stages"] for x in s["deals"] if x["id"] == d.pk)
    assert row["stage"] == "offer" and row["next_task"]
    done = post(client, f"{C}/tasks/{t['id']}/done", {"result": "Gaplashildi"}).json()
    assert done["done_at"] and done["data"] == {"result": "Gaplashildi"}
    det = client.get(f"{C}/deals/{d.pk}").json()
    kinds = [a["kind"] for a in det["activity"]]
    assert kinds.count("doc") == 1 and "stage" in kinds and len(det["docs"]) == 1
    assert any(a["text"].startswith("Avtomatik: «Taklif yuborildi»") for a in det["activity"])
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
    assert d["owner_tg"] == S1 and d["customer"] == "Chinoz Un MChJ" and d["title"] == f"#{d['id']} SPB 1650 — 25 dona"
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
    assert Activity.objects.filter(deal=d, text__startswith="Tayyor: mijozga bog'langan chat").exists()
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
    assert timezone.localtime(t.due).strftime("%d.%m.%Y %H:%M") == f"{day} 10:00" and t.assignee == S1
    # soat va izoh bilan (sana — yil-oy-kun, brauzer sana tanlagichi)
    d2 = deal(S1, "Lenta")
    iso = (timezone.localdate() + timedelta(days=3)).isoformat()
    body = {"stage": "later", "recall": iso, "recall_time": "14:30", "recall_note": "Narxni rahbar bilan kelishadi"}
    assert post(client, f"{C}/deals/{d2.pk}/stage", body).status_code == 200
    t2 = Activity.objects.get(deal=d2, kind="task")
    assert timezone.localtime(t2.due).strftime("%Y-%m-%d %H:%M") == f"{iso} 14:30"
    assert t2.text == "Mijoz bilan qayta bog'lanish: Narxni rahbar bilan kelishadi"
    # bugun, lekin o'tgan soat — 400; noto'g'ri soat — 400
    d3 = deal(S1, "Rukav")
    today = timezone.localdate().isoformat()
    assert (
        post(
            client, f"{C}/deals/{d3.pk}/stage", {"stage": "later", "recall": today, "recall_time": "00:00"}
        ).status_code
        == 400
    )
    assert (
        post(client, f"{C}/deals/{d3.pk}/stage", {"stage": "later", "recall": iso, "recall_time": "xx"}).status_code
        == 400
    )


def test_narxlash_joylashuv_va_yangi_mijoz(client, team):
    as_(client, team["s1"])
    c = post(
        client,
        f"{C}/customers",
        {"name": "Chinoz Un", "phones": ["90 123 45 67"], "inn": "305112847", "address": "Toshkent v., Chinoz t."},
    ).json()
    assert (c["inn"], c["phones"], c["address"]) == ("305112847", ["998901234567"], "Toshkent v., Chinoz t.")
    # shu STIR bilan ikkinchi mijoz — 409 (ro'yxatdan tanlansin)
    assert (
        post(client, f"{C}/customers", {"name": "X", "phones": ["90 000 00 01"], "inn": "305112847"}).status_code == 409
    )
    assert post(client, f"{C}/customers", {"name": "X", "phones": ["90 000 00 01"], "inn": "123"}).status_code == 400
    items = [{"name": "SPB 1650", "qty": "10", "price": "100000"}, {"name": "Lenta", "qty": "2", "price": "50000"}]
    body = {
        "counterparty_id": c["id"],
        "title": "Ko'p",
        "items": items,
        "discount": "10",
        "markup": "5",
        "logistics": "200000",
    }
    d = post(client, f"{C}/deals", body).json()
    # (1 000 000 + 100 000) × 0,9 × 1,05 + 200 000 = 1 239 500
    assert (d["amount"], d["discount"], d["markup"], d["logistics"]) == ("1239500", "10", "5", "200000")
    assert d["location"] == "Toshkent v., Chinoz t."  # mijoz manzilidan
    # kartochkada o'zgartirish — summa qayta hisoblanadi
    r = post(
        client, f"{C}/deals/{d['id']}", {"discount": 0, "markup": 0, "logistics": 0, "location": "Chinoz, ombor"}
    ).json()
    assert (r["amount"], r["location"]) == ("1100000", "Chinoz, ombor")
    assert post(client, f"{C}/deals/{d['id']}", {"discount": 150}).status_code == 400
    assert post(client, f"{C}/deals/{d['id']}", {"logistics": -1}).status_code == 400
    # tovarsiz bitim — summa qo'lda qoladi
    e = post(client, f"{C}/deals", {"counterparty_id": c["id"], "title": "Qo'lda", "amount": "500000"}).json()
    assert post(client, f"{C}/deals/{e['id']}", {"logistics": 100000}).json()["amount"] == "500000"


def test_mijoz_turlari(client, team):
    as_(client, team["s1"])
    cu = f"{C}/customers"
    # firma xodimi — lavozim va firma ma'lumotlari; firma nomisiz — 400
    assert post(client, cu, {"kind": "employee", "name": "Rahim"}).status_code == 400
    e = post(
        client,
        cu,
        {
            "kind": "employee",
            "name": "Rahim",
            "phones": ["90 000 00 02"],
            "position": "Ta'minotchi",
            "company": "Chinoz Un MChJ",
            "company_inn": "305112847",
        },
    ).json()
    assert (e["kind"], e["position"], e["company"], e["company_inn"]) == (
        "employee",
        "Ta'minotchi",
        "Chinoz Un MChJ",
        "305112847",
    )
    assert (
        post(
            client,
            cu,
            {"kind": "employee", "name": "X", "phones": ["90 000 00 01"], "company": "Y", "company_inn": "12"},
        ).status_code
        == 400
    )
    # savdogar — telefonsiz 400
    assert post(client, cu, {"kind": "trader", "name": "Akmal aka"}).status_code == 400
    tr = post(
        client, cu, {"kind": "trader", "name": "Akmal aka", "phones": ["90 111 22 33"], "address": "Abu Saxiy"}
    ).json()
    assert (tr["kind"], tr["phones"], tr["address"]) == ("trader", ["998901112233"], "Abu Saxiy")
    # jismoniy shaxs — JSHSHIR 14 raqam; firma — STIR 9
    assert (
        post(client, cu, {"kind": "person", "name": "Ali", "phones": ["90 000 00 01"], "inn": "305112847"}).status_code
        == 400
    )
    assert (
        post(
            client, cu, {"kind": "person", "name": "Ali", "phones": ["90 000 00 01"], "inn": "31234567890123"}
        ).status_code
        == 200
    )
    assert (
        post(
            client, cu, {"kind": "company", "name": "Z", "phones": ["90 000 00 01"], "inn": "31234567890123"}
        ).status_code
        == 400
    )
    assert post(client, cu, {"kind": "nimadir", "name": "Z", "phones": ["90 000 00 01"]}).status_code == 400
    # yangi mijoz: telefonsiz — 400; firma / YaTT / davlat — STIRsiz 400
    assert post(client, cu, {"kind": "person", "name": "Vali"}).status_code == 400
    for k in ("company", "ip", "state"):
        assert post(client, cu, {"kind": k, "name": "Q", "phones": ["90 000 00 09"]}).status_code == 400
    # qidiruv — firma nomi bo'yicha ham (xodim topiladi)
    assert [x["id"] for x in client.get(f"{cu}?q=chinoz").json()] == [e["id"]]
    # kartochkada turini almashtirish: savdogar → firma xodimi (firma nomi majburiy)
    assert post(client, f"{cu}/{tr['id']}", {"kind": "employee"}).status_code == 400
    card = post(
        client, f"{cu}/{tr['id']}", {"kind": "employee", "company": "Bozor MChJ", "position": "Sotuvchi"}
    ).json()
    assert (card["kind"], card["company"], card["position"]) == ("employee", "Bozor MChJ", "Sotuvchi")
    # savdogarning telefonini o'chirib bo'lmaydi
    assert post(client, f"{cu}/{tr['id']}", {"kind": "trader", "phones": []}).status_code == 400


def test_tovar_qidiruvi_katalogdan(client, team):
    from config.apps.erp.catalog import services as catalog

    catalog.demo_seed()
    as_(client, team["s1"])
    rs = client.get(f"{C}/items?q=1040 8m").json()
    assert [(r["name"], r["price"], r["free"]) for r in rs] == [("Ремень зубчатый 1040-8M-30", "412000", "18.000")]
    assert client.get(f"{C}/items?q=").json() == []


def test_hujjat_korish_va_tasdiqlash(client, team):
    from config.apps.erp.catalog import services as catalog

    catalog.demo_seed()
    h = catalog.find("Ремень клиновой SPB 1650")
    assert h is not None
    as_(client, team["s1"])
    c = post(
        client,
        f"{C}/customers",
        {"name": "Hujjat Zavod", "phones": ["90 000 00 03"], "inn": "301000003", "address": "Chinoz"},
    ).json()
    items = [{"item_id": h["item_id"], "name": h["name"], "unit": "dona", "qty": 10, "price": h["price"]}]
    d = post(
        client, f"{C}/deals", {"counterparty_id": c["id"], "title": "H", "items": items, "logistics": 50000}
    ).json()
    q = post(client, f"{C}/deals/{d['id']}/doc", {"kind": "quote"}).json()
    full = client.get(f"{C}/docs/{q['id']}").json()
    assert (full["total"], full["meta"]["customer"], full["meta"]["logistics"]) == ("1900000", "Hujjat Zavod", "50000")
    assert [(x["name"], x["amount"]) for x in full["lines"]] == [("Ремень клиновой SPB 1650", "1850000")]
    assert post(client, f"{C}/docs/{q['id']}/confirm", {}).status_code == 400  # taklif tasdiqlanmaydi
    o = post(client, f"{C}/deals/{d['id']}/doc", {"kind": "order"}).json()
    r = post(client, f"{C}/docs/{o['id']}/confirm", {}).json()
    assert (r["status"], r["state"]) == ("posted", "confirmed")
    assert post(client, f"{C}/docs/{o['id']}/confirm", {}).status_code == 409
    # boshqa sotuvchi — ko'rmaydi
    as_(client, team["s2"])
    assert client.get(f"{C}/docs/{q['id']}").status_code == 404


def test_bitim_nomi_tizimdan(client, team):
    as_(client, team["s1"])
    c = post(client, f"{C}/customers", {"name": "Avto Nom MChJ", "phones": ["90 000 00 04"], "inn": "301000004"}).json()
    items = [
        {"name": "Ремень SPB 1650", "unit": "dona", "qty": "10", "price": "1"},
        {"name": "Lenta", "qty": "2.5", "unit": "m", "price": "1"},
    ]
    d = post(client, f"{C}/deals", {"counterparty_id": c["id"], "items": items}).json()
    assert d["title"] == f"#{d['id']} Ремень SPB 1650 — 10 dona +1"
    e = post(client, f"{C}/deals", {"counterparty_id": c["id"]}).json()
    assert e["title"] == f"#{e['id']} Avto Nom MChJ"


def test_ketma_ketlik_avtomatik(client, team):
    """Hujjat va imzo hodisalari bitimni oldinga o'tkazadi (orqaga — hech qachon): taklif → «Taklif yuborildi»,
    buyurtma tasdiqlandi → «Shartnoma va hisob-faktura», shartnoma imzolandi → «To'lov kutilmoqda», to'lov → ishlab chiqarish."""
    from config.apps.erp.catalog import services as catalog

    catalog.demo_seed()
    h = catalog.find("Ремень клиновой SPB 1650")
    assert h is not None
    as_(client, team["s1"])
    c = post(client, f"{C}/customers", {"name": "Ketma Zavod", "phones": ["90 000 00 05"], "inn": "301000005"}).json()
    items = [{"item_id": h["item_id"], "name": h["name"], "unit": "dona", "qty": 10, "price": h["price"]}]
    d = post(client, f"{C}/deals", {"counterparty_id": c["id"], "items": items}).json()
    stage = lambda: client.get(f"{C}/deals/{d['id']}").json()["stage"]
    assert stage() == "new"
    post(client, f"{C}/deals/{d['id']}/doc", {"kind": "quote"})
    assert stage() == "offer"
    o = post(client, f"{C}/deals/{d['id']}/doc", {"kind": "order"}).json()
    assert stage() == "offer"  # qoralama — hali shartnoma emas
    post(client, f"{C}/docs/{o['id']}/confirm", {})
    assert stage() == "contract"
    post(client, f"{C}/deals/{d['id']}", {"sign_status": "signed"})
    assert stage() == "payment"
    post(client, f"{C}/deals/{d['id']}/payment", {"amount": 1850000, "via": "bank"})
    # to'lov → «Ishlab chiqarishda»; sex kerak emas va tovar omborda bor — darhol «Tayyor» (yig'ish navbatiga)
    assert stage() == "ready"
    # orqaga — yo'q: yangi taklif bitimni «Taklif yuborildi» ga qaytarmaydi
    post(client, f"{C}/deals/{d['id']}/doc", {"kind": "quote"})
    assert stage() == "ready"
    hist = [(x["from_stage"], x["to_stage"], x["src"]) for x in client.get(f"{C}/deals/{d['id']}").json()["stages"]]
    assert (
        ("new", "offer", "auto") in hist
        and ("offer", "contract", "auto") in hist
        and ("contract", "payment", "auto") in hist
        and ("payment", "production", "web") in hist
        and ("production", "ready", "auto") in hist
    )


def test_chegirma_siyosati(client, team):
    """Narx siyosati: sotuvchi — 10% gacha, sotuv rahbari — 20% gacha (team fiksturasi), oshsa — 403; avval saqlangan
    chegirma (siyosat keyin o'zgargan bo'lsa ham) qayta saqlashga xalaqit bermaydi."""
    d = deal(S1)
    as_(client, team["s1"])
    line = {"item_id": 1, "name": "SPB 1650", "qty": 1, "price": 100000}
    assert post(client, f"{C}/deals/{d.pk}/items", {"items": [{**line, "discount": 15}]}).status_code == 403
    r = post(client, f"{C}/deals/{d.pk}", {"discount": 12})
    assert r.status_code == 403 and "10" in r.json()["detail"]
    assert post(client, f"{C}/deals/{d.pk}", {"discount": 10}).status_code == 200
    as_(client, team["head"])
    assert post(client, f"{C}/deals/{d.pk}/items", {"items": [{**line, "discount": 15}]}).status_code == 200
    as_(client, team["s1"])  # rahbar qo'ygan 15% — sotuvchi qatorni o'zgartirmay saqlay oladi
    assert (
        post(
            client,
            f"{C}/deals/{d.pk}/items",
            {"items": [{**line, "discount": 15}, {"name": "X", "qty": 1, "price": 1}]},
        ).status_code
        == 200
    )


def test_hujjat_takror_bosish(client, team):
    """Buyurtma qayta bosilsa — yuborilmagan qoralama yangilanadi; o'zgarmagan taklif — o'sha qaytadi."""
    from config.apps.erp.catalog.models import Group, Item
    from config.apps.erp.crm.models import Doc

    it = Item.objects.create(group=Group.objects.create(name="Remen"), name="SPB 1650", unit="dona")
    d = deal(S1)
    d.items = [{"item_id": it.pk, "name": "SPB 1650", "unit": "dona", "qty": "2", "price": "100000", "discount": "0"}]
    d.save()
    as_(client, team["s1"])
    o1 = post(client, f"{C}/deals/{d.pk}/doc", {"kind": "order"}).json()
    o2 = post(client, f"{C}/deals/{d.pk}/doc", {"kind": "order"}).json()
    assert o1["id"] == o2["id"] and o1["number"] == f"BR-BU-{timezone.now():%y}-{o1['id']:05d}"
    q1 = post(client, f"{C}/deals/{d.pk}/doc", {"kind": "quote"}).json()
    assert post(client, f"{C}/deals/{d.pk}/doc", {"kind": "quote"}).json()["id"] == q1["id"]
    d.refresh_from_db()
    d.items = [{**d.items[0], "qty": "3"}]
    d.save()
    q3 = post(client, f"{C}/deals/{d.pk}/doc", {"kind": "quote"}).json()
    o3 = post(client, f"{C}/deals/{d.pk}/doc", {"kind": "order"}).json()
    assert q3["id"] != q1["id"] and o3["id"] == o1["id"] and o3["total"] == "300000"
    assert Doc.objects.filter(deal=d).count() == 3
    Doc.objects.filter(pk=o3["id"]).update(status="posted", didox_id="dx1")  # mijozga yuborilgan
    assert post(client, f"{C}/deals/{d.pk}/doc", {"kind": "order"}).json()["id"] == o3["id"]
    assert Doc.objects.filter(deal=d).count() == 3
