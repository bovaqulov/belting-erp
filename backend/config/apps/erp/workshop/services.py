"""Sex appining ochiq interfeysi: zakaz ochish (CRM bitimi «Ishlab chiqarishda» ga o'tganda), bekor qilish, holat,
tovar sexda tayyorlanadimi, hamma zakazlar tayyor bo'lganda xabar (`on_ready`)."""

from __future__ import annotations

from collections.abc import Callable

from . import shop

Bad = shop.Bad
open_jobs = shop.open_jobs
cancel = shop.cancel
status = shop.status
needs_shop = shop.needs_shop


def on_ready(fn: Callable[[str], None]) -> None:
    """fn(source) — shu manbaning barcha zakazlari tayyor bo'ldi (tranzaksiya yakunlangach)."""
    shop.on_ready(fn)
