"""Logistika API marshrutlari (docs/api/logistics.md): /app/api/erp/logistics/*."""

from django.urls import path

from . import views as v

E = "erp/logistics"

urlpatterns = [
    path(f"{E}/meta", v.meta),
    path(f"{E}/shipments", v.shipments),
    path(f"{E}/shipments/<int:pk>", v.shipment),
    path(f"{E}/shipments/<int:pk>/status", v.shipment_status),
]
