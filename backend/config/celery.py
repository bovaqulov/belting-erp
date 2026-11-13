"""Celery ilovasi: broker — Redis; vazifalar applardagi tasks.py dan (autodiscover). Ishga tushirish: scripts/dev.sh."""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("belting")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
