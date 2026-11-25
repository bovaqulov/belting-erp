"""GeoMaps API: /app/api/geo/* (Jarvis web/geomap_api.py)."""

from django.urls import path

from . import views as v

P = "geo"

urlpatterns = [
    path(f"{P}/me", v.me),
    path(f"{P}/records", v.records),
    path(f"{P}/totals", v.totals),
    path(f"{P}/records/<str:rid>/location", v.record_location),
    path(f"{P}/records/<str:rid>", v.record),
    path(f"{P}/boundaries/<str:level>", v.boundaries),
    path(f"{P}/meta", v.meta),
    path(f"{P}/bulk", v.bulk),
    path(f"{P}/owners", v.owners),
    path(f"{P}/views", v.views),
    path(f"{P}/views/<int:pk>", v.view_delete),
    path(f"{P}/territories", v.territories),
    path(f"{P}/territories/auto/preview", v.territories_auto_preview),
    path(f"{P}/territories/auto/save", v.territories_auto_save),
    path(f"{P}/territories/<int:pk>", v.territory),
    path(f"{P}/import", v.import_geojson),
    path(f"{P}/route/optimize", v.route_optimize),
    path(f"{P}/routes", v.routes),
    path(f"{P}/routes/<int:pk>", v.route_delete),
    path(f"{P}/isochrone", v.isochrone),
    path(f"{P}/prospects", v.prospects),
    path(f"{P}/checkins", v.checkins),
    path(f"{P}/shares", v.shares),
    path(f"{P}/shares/<str:token>", v.share_delete),
    path(f"{P}/public/<str:token>", v.public),
]
