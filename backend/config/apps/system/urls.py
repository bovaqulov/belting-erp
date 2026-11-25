"""Tizim API: /app/api/system/status, /app/api/system/log?name=&lines= (faqat ega/admin)."""

from django.urls import path

from . import views as v

urlpatterns = [
    path("system/status", v.status),
    path("system/log", v.log),
]
