from django.apps import AppConfig


class JarvisConfig(AppConfig):
    name = "config.apps.jarvis"
    label = "jarvis"
    verbose_name = "Jarvis agentlari"

    def ready(self) -> None:
        from . import signals  # noqa: F401 — bo'lim agentlari → staff.Department
