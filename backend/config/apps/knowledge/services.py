"""knowledge — ochiq interfeys: boshqa applar bilimlar bazasiga (KB) faqat shu orqali yozadi (masalan konveyer —
mijozning lenta buyurtmalari tarixi)."""

from __future__ import annotations

from typing import Any

from django.db import transaction

from config.apps.staff import services as staff

from .models import Doc


def find_doc(path: str, source: str) -> dict[str, Any] | None:
    """Yo'l va manba bo'yicha birinchi yozuv: {id, dept, title, body, path}."""
    d = Doc.objects.filter(path=path, source=source).order_by("pk").first()
    return {"id": d.pk, "dept": d.dept, "title": d.title, "body": d.body, "path": d.path} if d else None


@transaction.atomic
def save_doc(
    *,
    dept: str,
    title: str,
    body: str,
    path: str,
    source: str,
    tg_id: int | None = None,
    doc_id: int | None = None,
) -> int:
    """Yangi faol yozuv yoki mavjudini (doc_id) yangilash → id."""
    if doc_id:
        Doc.objects.filter(pk=doc_id).update(title=title[:300], body=body, path=path[:300])
        return doc_id
    return Doc.objects.create(
        dept=dept[:40],
        title=title[:300],
        body=body,
        path=path[:300],
        source=source[:10],
        created_by=staff.user_by_tg(tg_id) if tg_id else None,
    ).pk
