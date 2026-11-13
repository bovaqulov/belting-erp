"""Marshrutlar: /app/api/* — har domen app'ining urls.py (frontend /app ostida, bitta domen). Oxiridagi «/» ixtiyoriy:
Next (trailingSlash: true) dev proksisi /app/api/me ni /app/api/me/ ga yo'naltiradi."""

from importlib import import_module

from django.conf import settings
from django.contrib import admin
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.urls import URLPattern, URLResolver, path, re_path

from config.apps.core.views import api_not_found


def _api() -> list[URLPattern | URLResolver]:
    out: list[URLPattern | URLResolver] = []
    for app in settings.DOMAIN_APPS:
        try:
            mod = import_module(f"{app}.urls")
        except ModuleNotFoundError:
            continue
        for p in mod.urlpatterns:
            route = str(p.pattern)
            # "agents/<str:key>" → ixtiyoriy oxirgi slash bilan ikki variant
            out += [path(f"app/api/{route}", p.callback), path(f"app/api/{route}/", p.callback)]  # type: ignore[union-attr]
    return out


urlpatterns = [
    path("admin/", admin.site.urls),
    *_api(),
    re_path(r"^app/api/", api_not_found),
    *staticfiles_urlpatterns(),
]
