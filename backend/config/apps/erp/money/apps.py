"""Pul (1C «Деньги»): kassalar va bank hisoblari, pul oqimi moddalari, kirim / chiqim / o'tkazish hujjatlari,
qoldiqlar, pul oqimi hisoboti; sotuv to'lovlari — avtomatik kirim. Frontend: src/erp/money/ (/app/erp/pul).
API: docs/api/money.md. Reja: docs/plans/2026-11-21-money.md."""

from django.apps import AppConfig


class ErpMoneyConfig(AppConfig):
    name = "config.apps.erp.money"
    label = "erp_money"
    verbose_name = "Pul"
