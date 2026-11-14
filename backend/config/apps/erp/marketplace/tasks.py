"""Celery: ulangan kanallar buyurtmalarini davriy sinxronlash (beat, settings.CELERY_BEAT_SCHEDULE)."""

import logging

from celery import shared_task

from . import channels, orders
from .channels import ChannelError

log = logging.getLogger(__name__)


@shared_task
def sync_orders(days: int = 7) -> dict:
    """Har kanal alohida: biri xato bersa, qolganlari davom etadi."""
    out: dict = {}
    for ch in orders.CHANNELS:
        if not channels.configured(ch):
            continue
        try:
            out[ch] = orders.sync(ch, days)
        except ChannelError as e:
            log.warning("%s buyurtmalar sinxroni: %s", ch, e.detail)
            out[ch] = {"error": e.detail}
    return out
