"""TelegramCRM testlari: haqiqiy shlyuz/Redis'ga HECH QACHON bormaydi.

Dev'da `tg_gateway` ishlab tursa, testdagi buyruq Redis orqali haqiqiy akkauntga yetib borishi mumkin edi (test bazasidagi
akkaunt ID'si haqiqiysiga to'g'ri kelsa — logout/QR …). Shuning uchun shina standart holatda "shlyuz yo'q" (503);
kerakli test `bus.call` ni o'zi almashtiradi.
"""

import pytest

from config.apps.core.http import ApiError
from config.apps.tgcrm import bus


@pytest.fixture(autouse=True)
def _no_real_gateway(monkeypatch):
    def offline(*args, **kwargs):
        raise ApiError(503, "Telegram shlyuzi ishlamayapti (test).")

    monkeypatch.setattr(bus, "_real_call", bus.call, raising=False)  # asl tekshiruvni sinash uchun (alive=False bilan)
    monkeypatch.setattr(bus, "alive", lambda: False)
    monkeypatch.setattr(bus, "call", offline)
    monkeypatch.setattr(bus, "publish", lambda event: None)


@pytest.fixture(autouse=True)
def _memory_locks(monkeypatch):
    """Javob qulfi — xotirada (haqiqiy Redis'ga bormaydi)."""
    from config.apps.tgcrm import locks

    store: dict[tuple[int, int], int] = {}

    def take(account, peer, tg):
        cur = store.get((account, peer))
        if cur is None:
            store[(account, peer)] = tg
            return tg, True
        return cur, False

    monkeypatch.setattr(locks, "holder", lambda account, peer: store.get((account, peer)))
    monkeypatch.setattr(locks, "take", take)
    monkeypatch.setattr(
        locks,
        "release",
        lambda account, peer, tg: store.pop((account, peer), None) if store.get((account, peer)) == tg else None,
    )
    return store


@pytest.fixture(autouse=True)
def _no_real_stock(settings):
    """1C qoldig'i (eski Jarvis bazasi) testlarda o'qilmaydi — kerak bo'lsa test o'zi soxta manba beradi."""
    from config.apps.tgcrm import stock

    settings.JARVIS_ONEC_DB_URL = ""
    stock.clear_cache()
    yield
    stock.clear_cache()
