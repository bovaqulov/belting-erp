import json

import pytest

from config.apps.core import llm
from config.apps.knowledge import graph
from config.apps.knowledge.models import Doc, GraphNode
from config.apps.memory.models import Fact

pytestmark = pytest.mark.django_db
FAKE = {
    "entities": [
        {"name": "HTD 8M", "type": "tovar"},
        {"name": "Navoiy GMK", "type": "mijoz"},
        {"name": "Ombor", "type": "bo'lim"},
    ],
    "relations": [
        {"a": "Navoiy GMK", "b": "HTD 8M", "r": "sotib oladi", "k": "EXTRACTED"},
        {"a": "HTD 8M", "b": "Ombor", "r": "saqlanadi", "k": "INFERRED"},
    ],
}


@pytest.fixture
def calls(monkeypatch):
    n = []
    monkeypatch.setattr(llm, "complete_json", lambda system, prompt, model=llm.SERVICE_MODEL: n.append(prompt) or FAKE)
    return n


def test_communities():
    c = graph.communities(["a", "b", "c", "x", "y"], [("a", "b"), ("b", "c"), ("a", "c"), ("x", "y")])
    assert c["a"] == c["b"] == c["c"] == 0 and c["x"] == c["y"] == 1


def test_rebuild_cache_and_queries(admin_client, depts, calls):
    Doc.objects.create(dept="sotuv", title="Navoiy GMK", body="Navoiy GMK HTD 8M remen oladi, omborda turadi.")
    Fact.objects.create(text="HTD 8M eng ko'p sotiladi", scope="firma")
    res = graph.rebuild()
    assert res == {"sotuv": 3, "xotira": 3, "all": 3} and len(calls) == 2
    graph.rebuild()
    assert len(calls) == 2  # matn o'zgarmadi — kesh

    s = admin_client.get("/app/api/graph?scope=all").json()
    assert s["nodes"] == 3 and s["edges"] == 2 and s["scopes"][:2] == ["all", "xotira"]
    assert s["god_nodes"][0]["label"] == "HTD 8M" and s["confidence"] == {"EXTRACTED": 1, "INFERRED": 1}

    top = admin_client.get("/app/api/graph/data?scope=all&limit=1").json()
    assert [n["label"] for n in top["nodes"]] == ["HTD 8M"] and top["more"] == 2
    hid = top["nodes"][0]["id"]
    nb = admin_client.post(
        "/app/api/graph/chunk", json.dumps({"scope": "all", "mode": "neighbors", "ids": [hid], "have": [hid]}),
        content_type="application/json",
    ).json()  # fmt: skip
    assert {n["label"] for n in nb["nodes"]} == {"Navoiy GMK", "Ombor"} and len(nb["links"]) == 2

    found = admin_client.get("/app/api/graph/search?scope=all&q=navoiy").json()["nodes"]
    assert found[0]["label"] == "Navoiy GMK"
    text = admin_client.get("/app/api/graph/explain?scope=all&name=HTD 8M").json()["text"]
    assert "sotib oladi" in text and "Navoiy GMK" in text


def test_rebuild_endpoint_queues(admin_client, depts, calls):
    Doc.objects.create(dept="sotuv", title="A", body="Navoiy GMK HTD 8M remen oladi.")
    assert admin_client.post("/app/api/graph/rebuild").status_code == 200  # Celery eager
    assert GraphNode.objects.filter(scope="all").count() == 3


def test_empty_graph(admin_client):
    s = admin_client.get("/app/api/graph?scope=all").json()
    assert s["nodes"] == 0 and "qurilmagan" in s["report"]
    assert admin_client.get("/app/api/graph/data?scope=all").json()["nodes"] == []
