from django.apps import AppConfig


class ReportsConfig(AppConfig):
    name = "config.apps.reports"
    label = "reports"
    verbose_name = "Hisobotlar"

    def ready(self) -> None:
        from config.apps.core.registry import register_panel_field

        from .logic import user_units

        register_panel_field("report_depts", user_units)  # /app/api/me: xodim to'ldiradigan hisobotlar
