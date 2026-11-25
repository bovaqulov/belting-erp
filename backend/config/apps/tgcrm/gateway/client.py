"""TelegramClient yaratish va help.getAppConfig limitlarini o'qish.

Qurilma ma'lumotlari doimiy (har ishga tushganda o'zgarsa — "yangi qurilma" ko'rinadi). Nomda "Telegram" yo'q (ToS).
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from telethon import TelegramClient
from telethon.sessions.abstract import Session
from telethon.tl import functions, types

DEVICE_MODEL, SYSTEM_VERSION, APP_VERSION = "Belting TG CRM", "Server", "1.0"


def make_client(session: Session) -> TelegramClient:
    return TelegramClient(
        session,
        settings.TGCRM_API_ID,
        settings.TGCRM_API_HASH,
        device_model=DEVICE_MODEL,
        system_version=SYSTEM_VERSION,
        app_version=APP_VERSION,
        lang_code="ru",
        system_lang_code="ru",
        flood_sleep_threshold=30,  # qisqa kutishlarni Telethon o'zi; uzunlari — bizning cheklagichga
        catch_up=True,  # qayta ulanganda o'tkazib yuborilgan yangilanishlar (DbSession holatni saqlaydi)
        request_retries=3,
        connection_retries=5,
        retry_delay=3,
        entity_cache_limit=20000,
    )


# appConfig kalitlari: (bizdagi nom, bepul kalit, premium kalit, standart bepul, standart premium)
LIMIT_KEYS = [
    ("caption", "caption_length_limit_default", "caption_length_limit_premium", 1024, 4096),
    ("folders", "dialog_filters_limit_default", "dialog_filters_limit_premium", 10, 30),
    ("pinned", "dialogs_pinned_limit_default", "dialogs_pinned_limit_premium", 5, 10),
    ("channels", "channels_limit_default", "channels_limit_premium", 500, 1000),
    ("file_parts", "upload_max_fileparts_default", "upload_max_fileparts_premium", 4000, 8000),
]
PART = 512 * 1024


def json_value(v: Any) -> Any:
    """MTProto JSONValue → Python."""
    if isinstance(v, types.JsonObject):
        return {x.key: json_value(x.value) for x in v.value}
    if isinstance(v, types.JsonArray):
        return [json_value(x) for x in v.value]
    if isinstance(v, (types.JsonString, types.JsonNumber, types.JsonBool)):
        return v.value
    return None


def limits_from(cfg: dict[str, Any], premium: bool) -> dict[str, Any]:
    out: dict[str, Any] = {"message": 4096}
    for name, free, prem, d_free, d_prem in LIMIT_KEYS:
        val = cfg.get(prem if premium else free)
        out[name] = int(val) if isinstance(val, (int, float)) else (d_prem if premium else d_free)
    out["file_bytes"] = out.pop("file_parts") * PART
    for k in ("freeze_since_date", "freeze_until_date", "freeze_appeal_url"):
        if cfg.get(k):
            out[k] = cfg[k]
    return out


async def fetch_limits(client: TelegramClient, premium: bool) -> dict[str, Any]:
    res = await client(functions.help.GetAppConfigRequest(hash=0))
    cfg = json_value(getattr(res, "config", None)) or {}
    return limits_from(cfg if isinstance(cfg, dict) else {}, premium)
