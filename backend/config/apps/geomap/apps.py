from django.apps import AppConfig


class GeomapConfig(AppConfig):
    name = "config.apps.geomap"
    label = "geomap"
    verbose_name = "Mijozlar xaritasi"

    def ready(self) -> None:
        from config.apps.core.registry import register_panel_field

        from .views import can_use

        register_panel_field("can_geo", can_use)  # /app/api/me: bosh sahifada GeoMaps kartochkasi
