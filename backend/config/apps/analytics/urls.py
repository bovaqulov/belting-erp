"""Analitika API: /app/api/analytics?days=7|30|90."""

from django.urls import path

from . import views as v

urlpatterns = [path("analytics", v.analytics)]
