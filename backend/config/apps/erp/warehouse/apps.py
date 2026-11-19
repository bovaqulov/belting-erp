from django.apps import AppConfig


class ErpWarehouseConfig(AppConfig):
    name = "config.apps.erp.warehouse"
    label = "erp_warehouse"
    verbose_name = "Ombor"

    def ready(self) -> None:
        from config.apps.core.registry import register_me_field

        from . import ledger, stock

        ledger.connect()  # harakatlar jurnali: Unit o'zgarishi → StockMove

        # /erp/me: omborlar, firmalar, hujjat turlari (ombor frontendi shulardan tanlaydi)
        for key in ("warehouses", "firms", "kinds"):
            register_me_field(key, lambda u, k=key: stock.me_payload(u)[k])
