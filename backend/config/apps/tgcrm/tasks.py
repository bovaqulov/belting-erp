"""TelegramCRM fon vazifalari (Celery beat — settings.CELERY_BEAT_SCHEDULE "tgcrm-reminders")."""

from celery import shared_task

from . import crm


@shared_task
def remind_tasks() -> int:
    return crm.remind_due()


@shared_task
def health_check() -> dict[str, int]:
    from . import alerts

    return alerts.check()


@shared_task
def ai_reply(account_id: int, peer: int, msg_id: int) -> str:
    """AI yordamchi javobi (gateway yangi xabarda `ai_delay_sec` kechiktirib qo'yadi)."""
    from . import assistant

    return assistant.reply(account_id, peer, msg_id)
