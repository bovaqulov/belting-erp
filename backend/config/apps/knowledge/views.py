"""Bilimlar API: /app/api/kb[/{id}[/approve|reject]], kb/pdf, knowledge/extract; graf: /app/api/graph[/data|chunk|search|explain|rebuild]."""

from __future__ import annotations

from django.http import HttpRequest, JsonResponse

from config.apps.core.http import ApiError, api, json_body, ok
from config.apps.jarvis.models import Agent
from config.apps.staff.models import User

from . import graph
from .docs import pdf_text
from .extract import extract_from_chats
from .models import Doc

VIEW = "Bilimlar faqat rahbariyat, IT va adminlar uchun."
MANAGE = "Bilimlarni IT bo'limi, Rahbariyat va adminlar boshqaradi."
MAX_PDF = 15 * 1024 * 1024


def _can_view(u: User) -> bool:
    return u.can_view()


def _can_manage(u: User) -> bool:
    return u.can_manage_agents()


def _doc_row(d: Doc) -> dict:
    return {"id": d.pk, "dept": d.dept, "path": d.path, "title": d.title, "status": d.status, "source": d.source}


def _clean_doc(dept: str, path: str, title: str, body: str) -> dict:
    dept = (dept or "umumiy").strip()
    if dept != "umumiy" and not Agent.objects.filter(kind="dept", key=dept).exists():
        raise ApiError(400, f"Bo'lim topilmadi: {dept}")
    title, body = (title or "").strip(), (body or "").strip()
    if not title:
        raise ApiError(400, "Sarlavhani yozing.")
    if len(body) < 20:
        raise ApiError(400, "Matn juda qisqa — kamida bir-ikki gap yozing.")
    return {"dept": dept, "path": (path or "").strip()[:300], "title": title[:300], "body": body}


@api(("GET", "POST"), check=_can_view, deny=VIEW)
def kb(request: HttpRequest, user: User) -> JsonResponse:
    if request.method == "GET":
        return ok({"docs": [_doc_row(d) for d in Doc.objects.all()]})
    if not _can_manage(user):
        raise ApiError(403, MANAGE)
    b = json_body(request)
    d = Doc.objects.create(
        created_by=user, **_clean_doc(b.get("dept", ""), b.get("path", ""), b.get("title", ""), b.get("body", ""))
    )
    return ok(_doc_row(d), status=201)


@api(("POST",), check=_can_manage, deny=MANAGE)
def kb_pdf(request: HttpRequest, user: User) -> JsonResponse:
    f = request.FILES.get("file")
    if f is None:
        raise ApiError(400, "PDF fayl tanlanmagan.")
    if f.size and f.size > MAX_PDF:
        raise ApiError(400, "Fayl juda katta (ko'pi 15 MB).")
    try:
        text = pdf_text(f.read())
    except Exception as e:
        raise ApiError(400, "PDF o'qilmadi — fayl buzilgan yoki PDF emas.") from e
    if len(text) < 20:
        raise ApiError(400, "PDF dan matn chiqmadi (skan bo'lishi mumkin) — matnni qo'lda kiriting.")
    p = request.POST
    d = Doc.objects.create(
        created_by=user,
        source="pdf",
        **_clean_doc(p.get("dept", ""), p.get("path", ""), p.get("title") or f.name, text),
    )
    return ok({"message": f"«{d.title}» qo'shildi ({len(text)} belgi)", "id": d.pk}, status=201)


@api(("GET", "DELETE"), check=_can_view, deny=VIEW)
def kb_doc(request: HttpRequest, user: User, pk: int) -> JsonResponse:
    d = Doc.objects.filter(pk=pk).first()
    if d is None:
        raise ApiError(404, "Hujjat topilmadi")
    if request.method == "DELETE":
        if not _can_manage(user):
            raise ApiError(403, MANAGE)
        d.delete()
        return ok()
    return ok({**_doc_row(d), "body": d.body})


@api(("POST",), check=_can_manage, deny=MANAGE)
def kb_act(request: HttpRequest, user: User, pk: int, act: str) -> JsonResponse:
    d = Doc.objects.filter(pk=pk).first()
    if d is None:
        raise ApiError(404, "Hujjat topilmadi")
    if act == "approve":
        d.status = Doc.Status.ACTIVE
        d.save(update_fields=["status"])
    elif act == "reject":
        d.delete()
    else:
        raise ApiError(400, "Amal: approve yoki reject.")
    return ok()


@api(("POST",), check=_can_manage, deny=MANAGE)
def extract(request: HttpRequest, user: User) -> JsonResponse:
    try:
        return ok({"result": extract_from_chats()})
    except ValueError as e:
        raise ApiError(502, "Tahlil natijasi o'qilmadi — qayta urinib ko'ring.") from e


# ---------------------------------------------------------------- graf


def _scope(request: HttpRequest, body: dict | None = None) -> str:
    return str((body or {}).get("scope") or request.GET.get("scope") or graph.ALL)[:40]


@api(("GET",), check=_can_view, deny=VIEW)
def graph_summary(request: HttpRequest, user: User) -> JsonResponse:
    return ok(graph.summary(_scope(request)))


@api(("GET",), check=_can_view, deny=VIEW)
def graph_data(request: HttpRequest, user: User) -> JsonResponse:
    return ok(graph.chunk(_scope(request), mode="top", limit=int(request.GET.get("limit") or 150)))


@api(("POST",), check=_can_view, deny=VIEW)
def graph_chunk(request: HttpRequest, user: User) -> JsonResponse:
    b = json_body(request)
    return ok(
        graph.chunk(
            _scope(request, b), mode=str(b.get("mode") or "top"), have=b.get("have") or [], ids=b.get("ids") or [],
            community=b.get("community"), limit=int(b.get("limit") or 150),
        )
    )  # fmt: skip


@api(("GET",), check=_can_view, deny=VIEW)
def graph_search(request: HttpRequest, user: User) -> JsonResponse:
    return ok({"nodes": graph.search(_scope(request), request.GET.get("q", ""))})


@api(("GET",), check=_can_view, deny=VIEW)
def graph_explain(request: HttpRequest, user: User) -> JsonResponse:
    return ok({"text": graph.explain(_scope(request), request.GET.get("name", ""))})


@api(("POST",), check=_can_manage, deny=MANAGE)
def graph_rebuild(request: HttpRequest, user: User) -> JsonResponse:
    from .tasks import rebuild_graph

    rebuild_graph.delay()
    return ok({"ok": True, "message": "Graf qayta qurilmoqda (bir necha daqiqa)"})
