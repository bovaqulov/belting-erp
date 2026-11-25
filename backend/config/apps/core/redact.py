"""Maxfiy qiymatlarni matndan yashirish (Jarvis `logs.redact`): log matni brauzerga chiqishidan oldin — bot tokeni, API
kalitlari, webhook kaliti, initData hash."""

from __future__ import annotations

import re

_SECRETS = [
    (re.compile(r"(?<!\d)\d{8,10}:[A-Za-z0-9_-]{30,}"), "<BOT_TOKEN>"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"), "<API_KEY>"),
    (
        re.compile(
            r"(xi-api-key|api_key|api_hash|access_token|ApplicationAccessKey|client_secret|password|secret_key)"
            r"([\"'=: ]+)[^\s\"'&,}]+",
            re.I,
        ),
        r"\1\2<SECRET>",
    ),
    (re.compile(r"(/rest/\d+/)[A-Za-z0-9]{8,}"), r"\1<WEBHOOK>"),
    (re.compile(r"(hash=)[0-9a-f]{40,}"), r"\1<HASH>"),
]


def redact(text: str) -> str:
    for rx, rep in _SECRETS:
        text = rx.sub(rep, text)
    return text
