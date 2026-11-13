import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from config.apps.jarvis.models import Agent, ChatMessage, ChatSession
from config.apps.jarvis.runtime import system_prompt
from config.apps.knowledge.models import Doc
from config.apps.memory.models import Fact

pytestmark = pytest.mark.django_db
BODY = "Tishli remen HTD 8M — qadami 8 mm, kenglik 20–100 mm."


def post(c, url, body):
    return c.post(url, json.dumps(body), content_type="application/json")


def test_kb_crud(admin_client):
    r = post(
        admin_client, "/app/api/kb", {"dept": "sotuv", "path": "Remenlar › Tishli", "title": "HTD 8M", "body": BODY}
    )
    assert r.status_code == 201
    pk = r.json()["id"]
    docs = admin_client.get("/app/api/kb").json()["docs"]
    assert docs[0]["path"] == "Remenlar › Tishli" and "body" not in docs[0]
    assert admin_client.get(f"/app/api/kb/{pk}").json()["body"] == BODY
    assert post(admin_client, "/app/api/kb", {"dept": "yoq", "title": "a", "body": BODY}).status_code == 400
    assert post(admin_client, "/app/api/kb", {"dept": "sotuv", "title": "a", "body": "qisqa"}).status_code == 400
    assert admin_client.delete(f"/app/api/kb/{pk}").status_code == 200


def test_approve_reject(admin_client):
    a = Doc.objects.create(title="A", body=BODY, status="pending", source="chat")
    b = Doc.objects.create(title="B", body=BODY, status="pending", source="chat")
    assert admin_client.post(f"/app/api/kb/{a.pk}/approve").status_code == 200
    assert Doc.objects.get(pk=a.pk).status == "active"
    assert admin_client.post(f"/app/api/kb/{b.pk}/reject").status_code == 200
    assert not Doc.objects.filter(pk=b.pk).exists()


def test_pdf_bad_file(admin_client):
    f = SimpleUploadedFile("x.pdf", b"bu pdf emas", content_type="application/pdf")
    r = admin_client.post("/app/api/kb/pdf", {"file": f, "dept": "sotuv", "title": "X"})
    assert r.status_code == 400 and "PDF" in r.json()["detail"]


def test_relevant_docs_in_prompt(depts):
    Doc.objects.create(dept="sotuv", title="HTD 8M tishli remen", body=BODY)
    Doc.objects.create(dept="it", title="Server parollari", body="IT ichki hujjat, parollar haqida batafsil.")
    agent = depts["sotuv"]
    agent.tools = ["kb"]
    text = system_prompt(agent, None, "HTD tishli remen kengligi qancha?")
    assert "HTD 8M" in text and "Server parollari" not in text


def test_extract_from_chats(admin_client, make_user, depts, monkeypatch):
    from config.apps.core import llm

    u = make_user(7, "employee", depts["sotuv"])
    s = ChatSession.objects.create(user=u, agent=Agent.objects.get(key="sotuv"))
    ChatMessage.objects.create(session=s, role="user", text="Navoiy GMK faqat pul o'tkazmasi bilan to'laydi")
    monkeypatch.setattr(
        llm, "complete_json",
        lambda system, prompt, model=llm.SERVICE_MODEL: {
            "facts": [{"text": "Navoiy GMK faqat o'tkazma bilan to'laydi", "scope": "bolim", "dept": "sotuv"}],
            "docs": [{"dept": "sotuv", "path": "Mijozlar", "title": "Navoiy GMK", "body": "To'lov — o'tkazma."}],
        },
    )  # fmt: skip
    r = admin_client.post("/app/api/knowledge/extract")
    assert r.json()["result"] == {"sotuv": {"add": 2}}
    assert Fact.objects.get().status == "pending" and Doc.objects.get().status == "pending"
    assert admin_client.post("/app/api/knowledge/extract").json()["result"] == {}  # qayta — yangi xabar yo'q
