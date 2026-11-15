"""Hujjatlar: agent uchun mos hujjatlarni topish (oddiy so'z mosligi), PDF dan matn."""

from __future__ import annotations

import io
import re

from django.db.models import Q

from .models import Doc

WORD = re.compile(r"[\w'ʻʼ-]{4,}", re.U)


def relevant(query: str, dept_keys: list[str], limit: int = 3, body_chars: int = 1500) -> list[tuple[str, str]]:
    words = {w.lower() for w in WORD.findall(query)}
    if not words:
        return []
    docs = Doc.objects.filter(Q(dept__in=[*dept_keys, "umumiy"]), status=Doc.Status.ACTIVE)
    scored = []
    for d in docs.only("title", "path", "body")[:500]:
        head, body = f"{d.title} {d.path}".lower(), d.body.lower()
        score = sum(3 * (w in head) + (w in body) for w in words)
        if score:
            scored.append((score, d.title, d.body[:body_chars]))
    scored.sort(key=lambda x: -x[0])
    return [(t, b) for _, t, b in scored[:limit]]


def prompt_context(dept_key: str | None, tg_id: int | None, query: str) -> str | None:
    """jarvis system prompt bo'lagi («kb» vositasi): savolga mos hujjatlar."""
    docs = relevant(query, [dept_key] if dept_key else []) if query else []
    return "Bilimlar bazasidan mos hujjatlar:\n\n" + "\n\n".join(f"### {t}\n{b}" for t, b in docs) if docs else None


def pdf_text(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return "\n\n".join((p.extract_text() or "").strip() for p in reader.pages).strip()
