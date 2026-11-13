"""Celery: bilimlar grafini qayta qurish (LLM ajratish uzoq — fon vazifasi)."""

import logging

from celery import shared_task

from . import graph

log = logging.getLogger(__name__)


@shared_task
def rebuild_graph() -> dict[str, int]:
    res = graph.rebuild()
    log.info("graf qayta qurildi: %s", res)
    return res


@shared_task
def extract_chats() -> dict:
    """Beat har 30 daqiqada: yangi veb chat xabarlaridan bilim/fakt (tasdiq kutadi)."""
    from .extract import extract_from_chats

    return extract_from_chats()
