"""Javob qulfi: bir chatga bir vaqtda bitta operator yozsin. Redis kaliti `tgcrm:lock:<akkaunt>:<peer>` = xodim tg_id,
TTL 25 s (yozayotgan operator har ~10 s yangilaydi). Redis bo'lmasa — qulf yo'q (ish to'xtamaydi)."""

from __future__ import annotations

import logging

import redis

from . import bus

log = logging.getLogger(__name__)
TTL = 25


def key(account: int, peer: int) -> str:
    return f"tgcrm:lock:{int(account)}:{int(peer)}"


def holder(account: int, peer: int) -> int | None:
    try:
        v = bus._redis().get(key(account, peer))
    except redis.RedisError:
        return None
    return int(v) if v else None


def take(account: int, peer: int, tg: int) -> tuple[int, bool]:
    """Qulfni olish/yangilash. Natija: (egasi, yangi_olindimi). Boshqada bo'lsa — (o'sha, False)."""
    k = key(account, peer)
    try:
        r = bus._redis()
        if r.set(k, tg, nx=True, ex=TTL):
            return tg, True
        cur = r.get(k)
        if cur and int(cur) == tg:
            r.expire(k, TTL)
            return tg, False
        return (int(cur), False) if cur else (tg, False)
    except redis.RedisError as e:
        log.warning("tgcrm lock: %s", e)
        return tg, False


def release(account: int, peer: int, tg: int) -> None:
    try:
        r = bus._redis()
        k = key(account, peer)
        cur = r.get(k)
        if cur and int(cur) == tg:
            r.delete(k)
    except redis.RedisError:
        pass
