"""CRM fon vazifalari (Celery beat — settings.CELERY_BEAT_SCHEDULE "crm-robots", har 5 daqiqa)."""

from celery import shared_task

from . import robots as R


@shared_task
def robots() -> dict[str, int]:
    return R.run()
