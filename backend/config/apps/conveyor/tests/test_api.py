"""LentaCUD API (Jarvis tests/lenta/test_api.py ssenariylari, Django ustida): ruxsat, katalog va narx MAXFIYLIGI,
chizma, matn tahlili (LLM'siz), loyihalar (egalik, optimistik qulf), PDF'ni Telegram'ga yuborish, bilimlar bazasi,
clientlog."""

from __future__ import annotations

import logging

import pytest

from config.apps.audit.models import Event
from config.apps.conveyor import views as lenta_api
from config.apps.conveyor.lenta import parse as lenta_parse
from config.apps.conveyor.lenta.catalog import SECRET_KEYS, catalog
from config.apps.conveyor.lenta.catalog import available as catalog_available
from config.apps.knowledge.models import Doc

pytestmark = [
    pytest.mark.django_db,
    pytest.mark.skipif(not catalog_available(), reason="katalog yo'q (data/secret/lenta_catalog.json)"),
]

BELT = "U13/0A-B (P 9/A/BL blue - 1,3mm)"
SAMPLE = {
    "beltName": BELT,
    "width": 600,
    "length": 5000,
    "lockOn": True,
    "joinMethod": "lock",
    "lockName": "MR01-G-1000 (MINI BELT 1,5 - 3,2 MM)",
    "lockQty": 2,
    "guideOn": True,
    "guideName": "Профиль К 10",
    "guideBottomOn": True,
    "guideBottomQty": 2,
    "crossOn": True,
    "crossName": "Профиль L 50",
    "crossLenAuto": True,
    "crossPos": lenta_parse.pitched(5000, 300, 30),
    "gofroOn": True,
    "gofroHeight": 50,
    "gofroQty": 2,
    "perfOn": True,
    "perfDia": 30,
    "perfQty": 40,
    "projectName": "Megaplast",
}


def _secret_numbers() -> set[float]:
    c = catalog()
    nums = {float(c["rate"]), *(float(v) for v in c["services"].values())}

    def flat(x):
        return [y for v in x for y in flat(v)] if isinstance(x, list) else [x]

    nums |= {float(x) for x in flat(c.get("installTiers") or []) if isinstance(x, (int, float)) and x}
    for grp in ("belts", "locks", "guideProfiles", "crossProfiles", "gofroProfiles", "perforation"):
        for row in c[grp]:
            for k in ("base", "zapas", "markup", "pricePerM", "pricePerPiece", "joint"):
                if isinstance(row.get(k), (int, float)) and row[k]:
                    nums.add(float(row[k]))
    # o'ziga xos qiymatlar: kasr yoki katta, yaxlit mingliklar emas (ular o'lchamlar bilan to'qnashadi:
    # 5000 mm uzunlik va h.k.); kurs har doim tekshiriladi
    return {n for n in nums if n != int(n) or (n >= 5000 and n % 1000)} | {float(c["rate"])}


def _walk(x, path=""):
    if isinstance(x, dict):
        for k, v in x.items():
            yield ("key", k, path)
            yield from _walk(v, f"{path}.{k}")
    elif isinstance(x, list):
        for i, v in enumerate(x):
            yield from _walk(v, f"{path}[{i}]")
    else:
        yield ("val", x, path)


def _fmt_variants(n: float) -> set[str]:
    if n == int(n):
        i = int(n)
        return {str(i), f"{i:,}".replace(",", " "), f"{i:,}".replace(",", " ")}
    s = f"{n:g}"
    return {s, s.replace(".", ",")}


def _assert_clean(payload, *, skip_paths=(), numbers=True):
    secret = _secret_numbers()
    strings = {v for n in secret for v in _fmt_variants(n)}
    for kind, v, path in _walk(payload):
        if any(path.startswith(p) for p in skip_paths):
            continue
        if kind == "key":
            assert v not in SECRET_KEYS, f"maxfiy kalit {v!r} ({path})"
            assert v != "settings", f"settings chiqib ketdi ({path})"
            assert v != "details", f"narx tafsiloti chiqib ketdi ({path})"
        elif isinstance(v, (int, float)) and not isinstance(v, bool) and numbers:
            assert float(v) not in secret, f"maxfiy qiymat {v} ({path})"
        elif isinstance(v, str):
            for s in strings:
                assert not (s in v and len(s) >= 4 and _bounded(v, s)), (
                    f"maxfiy qiymat {s!r} matnda ({path}): {v[:120]}"
                )


def _bounded(text: str, s: str) -> bool:
    import re

    return re.search(rf"(?<![\d.,]){re.escape(s)}(?![\d])", text) is not None


class FakeBot:
    def __init__(self):
        self.sent = []

    def send_document(self, chat_id, document, caption=None, reply_markup=None):
        self.sent.append(
            {
                "chat_id": chat_id,
                "name": document.name,
                "data": document.getvalue(),
                "caption": caption,
                "markup": reply_markup,
            }
        )


@pytest.fixture
def env(client, make_user, depts, monkeypatch):
    from config.apps.jarvis.models import Agent

    for key in ("sotuv_b2b", "sotuv_marketplace", "ombor"):
        Agent.objects.create(key=key, kind="dept", name=key, persona="p" * 25, parent=depts["rahbariyat"])
    users = {
        "sales": make_user(101, "employee", Agent.objects.get(key="sotuv_b2b")),
        "market": make_user(102, "employee", Agent.objects.get(key="sotuv_marketplace")),
        "leader": make_user(103, "employee", depts["rahbariyat"]),
        "admin": make_user(1, "admin"),
        "ombor": make_user(201, "employee", Agent.objects.get(key="ombor")),
    }
    users["sales"].name = "Sotuvchi"
    users["sales"].save()

    async def no_llm(prompt):  # LLM yo'q -> deterministik tahlil
        raise RuntimeError("LLM yo'q")

    monkeypatch.setattr(lenta_parse, "ask_llm", no_llm)
    monkeypatch.setattr(lenta_api, "_price_ts", {})
    fb = FakeBot()
    monkeypatch.setattr(lenta_api, "_bot", lambda: fb)

    class Env:
        bot = fb

        def __call__(self, who):
            client.force_login(users[who])
            return client

    return Env()


def post(c, path, body=None):
    return c.post(path, body or {}, content_type="application/json")


def test_access(env):
    for who in ("sales", "market", "leader", "admin"):
        assert env(who).get("/app/api/lenta/catalog").status_code == 200, who
        assert env(who).get("/app/api/me").json()["can_lenta"] is True
    r = env("ombor").get("/app/api/lenta/catalog")
    assert r.status_code == 403 and "lenta chizmasi faqat" in r.json()["detail"]
    assert env("ombor").get("/app/api/me").json()["can_lenta"] is False


def test_catalog_has_no_secrets(env):
    _assert_clean(env("sales").get("/app/api/lenta/catalog").json())


def test_price_is_safe_summary_and_audit(env):
    d = post(env("sales"), "/app/api/lenta/price", {"state": SAMPLE}).json()
    assert d["blocked"] is False and d["totals"]["final"] > 0
    assert {ln["key"] for ln in d["lines"]} >= {"belt", "lock", "guide", "cross", "gofro", "perf"}
    for ln in d["lines"]:
        assert set(ln) == {"key", "title", "desc", "amount"} and isinstance(ln["amount"], int)
    assert d["totals"]["final"] == d["totals"]["subtotal"] + d["totals"]["vatAmount"]
    _assert_clean(d, skip_paths=(".lines", ".totals"))
    _assert_clean(d["lines"], numbers=False)
    assert Event.objects.filter(event="lenta_price", tg_id=101).count() == 1


def test_price_blocked_and_rate_limit(env, monkeypatch):
    for st in ({**SAMPLE, "width": 1e9}, {**SAMPLE, "bendAngle": 1e-12}):
        d = post(env("sales"), "/app/api/lenta/price", {"state": st}).json()
        assert d["blocked"] is True and d["totals"] is None and d["lines"] == []
    monkeypatch.setattr(lenta_api, "PRICE_PER_HOUR", 1)
    monkeypatch.setattr(lenta_api, "_price_ts", {})
    c = env("sales")
    assert post(c, "/app/api/lenta/price", {"state": SAMPLE}).status_code == 200
    assert post(c, "/app/api/lenta/price", {"state": SAMPLE}).status_code == 429


def test_client_settings_ignored(env):
    a = post(env("sales"), "/app/api/lenta/price", {"state": SAMPLE}).json()
    b = post(env("sales"), "/app/api/lenta/price", {"state": {**SAMPLE, "settings": {"rate": 1, "markup": 0}}}).json()
    assert a["totals"] == b["totals"]


def test_render(env):
    d = post(env("sales"), "/app/api/lenta/render", {"state": SAMPLE, "lang": "uz"}).json()
    assert d["blocked"] is False and [s["key"] for s in d["sheets"]] == ["prod"]
    assert d["sheets"][0]["svg"].startswith("<svg") and "TEXNIK TALABLAR" in d["sheets"][0]["svg"]
    assert d["state"]["beltName"] == BELT
    _assert_clean({k: v for k, v in d.items() if k != "sheets"})
    assert "settings" not in post(env("sales"), "/app/api/lenta/render", {"state": {}}).json()["state"]


ORDER = (
    "U13 ko'k 1,3 mm, eni 600, uzunligi 5 m, MR01 qulf, ostidan 2 ta K10, har 300 mm da L50 profil, "
    "ikki chetiga 50 mm gofra, Ø12 teshik 60 ta, mijoz Megaplast"
)


def test_parse_fallback(env):
    d = post(env("sales"), "/app/api/lenta/parse", {"text": ORDER}).json()
    s = d["state"]
    assert d["source"] == "fallback" and d["unknown"] == []
    assert s["beltName"] == BELT and s["width"] == 600 and s["length"] == 5000 and s["projectName"] == "Megaplast"
    assert s["guideBottomQty"] == 2 and s["crossName"] == "Профиль L 50" and s["perfQty"] == 60
    _assert_clean(d)
    assert post(env("sales"), "/app/api/lenta/parse", {"text": " "}).status_code == 400
    assert Event.objects.filter(event="lenta_parse").count() == 1


def test_projects_crud_and_ownership(env):
    c = env("sales")
    pid = post(c, "/app/api/lenta/projects", {"state": {**SAMPLE, "settings": {"rate": 1}}}).json()["id"]
    lst = c.get("/app/api/lenta/projects").json()["projects"]
    assert [p["id"] for p in lst] == [pid] and lst[0]["name"] == "Megaplast"
    p = c.get(f"/app/api/lenta/projects/{pid}").json()
    assert p["state"]["width"] == 600 and p["own"] and "settings" not in p["state"]
    _assert_clean(p)
    assert post(c, "/app/api/lenta/projects", {"state": {**SAMPLE, "width": 700}, "id": pid}).json()["id"] == pid
    o = env("market")
    assert o.get("/app/api/lenta/projects").json()["projects"] == []
    assert o.get(f"/app/api/lenta/projects/{pid}").status_code == 404
    assert post(o, "/app/api/lenta/projects", {"state": SAMPLE, "id": pid}).status_code == 404
    assert o.delete(f"/app/api/lenta/projects/{pid}").status_code == 404
    a = env("admin")
    assert [p["id"] for p in a.get("/app/api/lenta/projects?all=1").json()["projects"]] == [pid]
    assert a.get(f"/app/api/lenta/projects/{pid}").json()["own"] is False
    c = env("sales")
    assert c.delete(f"/app/api/lenta/projects/{pid}").json()["ok"]
    assert c.get("/app/api/lenta/projects").json()["projects"] == []


def test_project_conflict_409(env):
    c = env("sales")
    r1 = post(c, "/app/api/lenta/projects", {"state": SAMPLE}).json()
    pid, v1 = r1["id"], r1["updated"]
    r2 = post(c, "/app/api/lenta/projects", {"state": {**SAMPLE, "width": 700}, "id": pid, "updated": v1}).json()
    assert r2["updated"] != v1
    assert (
        post(c, "/app/api/lenta/projects", {"state": {**SAMPLE, "width": 800}, "id": pid, "updated": v1}).status_code
        == 409
    )
    assert c.get(f"/app/api/lenta/projects/{pid}").json()["state"]["width"] == 700
    assert (
        post(env("market"), "/app/api/lenta/projects", {"state": SAMPLE, "id": pid, "updated": v1}).status_code == 404
    )


def test_send_pdf_kb_and_blocked(env):
    r = post(
        env("sales"),
        "/app/api/lenta/send",
        {
            "state": {**SAMPLE, "projectName": ""},
            "customer": "Non Zavodi MChJ",
            "application": "xamir yoyish konveyeri",
        },
    )
    assert r.status_code == 200, r.json()
    sent = env.bot.sent[0]
    assert sent["chat_id"] == 101 and sent["data"][:5] == b"%PDF-" and sent["name"].startswith("Non_Zavodi")
    assert "Non Zavodi MChJ" in sent["caption"]
    doc = Doc.objects.get(pk=r.json()["kb_id"])
    assert doc.path == "Mijozlar › Lenta buyurtmalari › Non Zavodi MChJ" and doc.dept == "sotuv_b2b"
    assert (
        "xamir yoyish" in doc.body and "600×5000 mm" in doc.body and "Sotuvchi" in doc.body and "so'm" not in doc.body
    )
    # bir mijoz — bitta yozuv, tarixga yangi konfiguratsiya qo'shiladi
    post(
        env("sales"),
        "/app/api/lenta/projects",
        {"state": {**SAMPLE, "width": 800}, "customer": "Non Zavodi MChJ", "application": "qadoqlash"},
    )
    doc.refresh_from_db()
    assert Doc.objects.filter(source="lenta").count() == 1 and "xamir yoyish konveyeri; qadoqlash" in doc.body
    # mijozsiz — KB yo'q; bloklangan chizma — 409 (issues bilan), yuborilmaydi
    assert post(env("sales"), "/app/api/lenta/send", {"state": {**SAMPLE, "projectName": ""}}).json()["kb_id"] is None
    n = len(env.bot.sent)
    r = post(env("sales"), "/app/api/lenta/send", {"state": {**SAMPLE, "guideBottomOn": False, "guideTopOn": False}})
    assert r.status_code == 409 and any(i["level"] == "error" for i in r.json()["detail"]["issues"])
    assert len(env.bot.sent) == n
    assert Event.objects.filter(event="lenta_pdf_sent").count() == 2


def test_send_without_bot_503(env, monkeypatch):
    monkeypatch.setattr(lenta_api, "_bot", lambda: None)
    assert post(env("sales"), "/app/api/lenta/send", {"state": SAMPLE}).status_code == 503


def test_clientlog(client, monkeypatch):
    logs = []

    class _Log:
        def log(self, level, fmt, *a):
            logs.append((level, fmt % a))

    monkeypatch.setattr(lenta_api, "log", _Log())
    monkeypatch.setattr(lenta_api, "_clientlog_ts", {})
    src = "https://x.trycloudflare.com/app/lenta?v=1#tgWebAppData=query_id%3DAAH"
    post(client, "/app/api/lenta/clientlog", {"msg": "TypeError: x\nsoxta qator", "src": src, "ua": "UA"})
    lvl, text = logs[-1]
    assert lvl == logging.WARNING and "tgWebAppData" not in text and "\n" not in text
    post(client, "/app/api/lenta/clientlog", {"msg": "ResizeObserver loop completed"})
    assert logs[-1][0] == logging.DEBUG
    client.post("/app/api/lenta/clientlog", "[1,2]", content_type="application/json")
    assert "noto'g'ri json" in logs[-1][1]
