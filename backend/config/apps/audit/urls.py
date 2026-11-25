"""Audit API: /app/api/audit, /app/api/voice/{id}."""

from django.urls import path

from . import views as v

urlpatterns = [
    path("audit", v.audit),
    path("voice/<int:pk>", v.voice),
]
