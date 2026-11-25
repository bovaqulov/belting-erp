"""LentaCUD API: /app/api/lenta/* (Jarvis web/lenta_api.py)."""

from django.urls import path

from . import views as v

P = "lenta"

urlpatterns = [
    path(f"{P}/clientlog", v.clientlog),
    path(f"{P}/catalog", v.catalog_view),
    path(f"{P}/render", v.render),
    path(f"{P}/price", v.price),
    path(f"{P}/parse", v.parse),
    path(f"{P}/send", v.send),
    path(f"{P}/projects", v.projects),
    path(f"{P}/projects/<int:pk>", v.project),
]
