"""GeoMaps fon vazifalari (Jarvis geomap.loop): CRM → xarita sinxroni (har 3 soat), orginfo.uz va Nominatim bilan
joylarni aniqlashtirish (har 10 daqiqa, kichik to'plamlar — tashqi xizmatlar chastota cheklovi bor)."""

from __future__ import annotations

from asgiref.sync import async_to_sync
from celery import shared_task

from . import sync


@shared_task
def refresh() -> dict:
    return sync.run()


@shared_task
def locate_pass() -> dict:
    org = async_to_sync(sync.enrich_pass)(limit=40)  # ~1.5 s/so'rov
    geo = async_to_sync(sync.geocode_pass)(limit=120)  # Nominatim 1 so'rov/s
    return {"orginfo": org, "geocode": geo}
