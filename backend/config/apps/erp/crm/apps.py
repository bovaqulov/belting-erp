from django.apps import AppConfig


class ErpCrmConfig(AppConfig):
    name = "config.apps.erp.crm"
    label = "erp_crm"
    verbose_name = "CRM"

    def ready(self) -> None:
        from config.apps.core.registry import register_me_field

        from .access import is_sales_head

        register_me_field("is_head", is_sales_head)  # /app/api/erp/me: sotuv bo'limi rahbari

        from . import production

        production.register()  # sex tayyor → «Tayyor», ombor jo'natdi → «Jo'natildi»
