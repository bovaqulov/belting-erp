from django.apps import AppConfig


class ConveyorConfig(AppConfig):
    name = "config.apps.conveyor"
    label = "conveyor"
    verbose_name = "Konveyer lenta chizmasi"

    def ready(self) -> None:
        from config.apps.core.registry import register_panel_field

        from .access import can_use

        register_panel_field("can_lenta", can_use)  # /app/api/me: bosh sahifada LentaCUD kartochkasi
