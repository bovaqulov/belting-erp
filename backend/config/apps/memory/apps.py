from django.apps import AppConfig


class MemoryConfig(AppConfig):
    name = "config.apps.memory"
    label = "memory"
    verbose_name = "Xotira"

    def ready(self) -> None:
        from config.apps.jarvis.services import register_context

        from .services import prompt_context

        register_context("memory", prompt_context)
