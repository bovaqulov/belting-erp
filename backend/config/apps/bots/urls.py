from django.urls import path

from . import views

urlpatterns = [path("bots/telegram", views.telegram_webhook)]
