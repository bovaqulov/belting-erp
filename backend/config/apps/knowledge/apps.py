from django.apps import AppConfig


class KnowledgeConfig(AppConfig):
    name = "config.apps.knowledge"
    label = "knowledge"
    verbose_name = "Bilimlar"

    def ready(self) -> None:
        from config.apps.jarvis.services import register_context

        from .docs import prompt_context

        register_context("kb", prompt_context)
