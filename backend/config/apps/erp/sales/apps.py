"""Savdo hujjatlari (1C «Управление компанией» uslubida): buyurtma, hisob, yuk xati, schyot-faktura, to'lov; jurnal,
«asosida yaratish», mijozlar qarzi. Frontend: src/erp/sales/ (/app/erp/savdo). API: docs/api/sales.md.
Reja: docs/plans/2026-11-21-sales-docs.md."""

from django.apps import AppConfig


class ErpSalesConfig(AppConfig):
    name = "config.apps.erp.sales"
    label = "erp_sales"
    verbose_name = "Savdo"

    def ready(self) -> None:
        from config.apps.erp.warehouse import services as wh

        from . import docs

        wh.on_shipped(docs.on_shipped)  # yuk xati yig'ish navbati jo'natilgach — «jo'natildi»
