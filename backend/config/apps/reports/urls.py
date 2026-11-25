"""Hisobotlar API: /app/api/report, /app/api/templates, /app/api/templates/{id}/{approve|reject}."""

from django.urls import path

from . import views as v

urlpatterns = [
    path("report", v.report),
    path("templates", v.templates),
    path("templates/<int:pk>/<str:action>", v.template_decide),
]
