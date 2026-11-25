"""Katalog API marshrutlari: /app/api/erp/cat/* (docs/api/catalog.md). `cat/*` — faqat katalogniki (ombor o'z
yo'llarini `wh/*` ostida ochadi)."""

from django.urls import path

from . import views as v

P = "erp/cat"

urlpatterns = [
    path(f"{P}/groups", v.groups),
    path(f"{P}/groups/seed", v.groups_seed),
    path(f"{P}/groups/<int:pk>/drop", v.group_drop),
    path(f"{P}/items", v.items),
    path(f"{P}/items/<int:pk>", v.item),
    path(f"{P}/items/<int:pk>/widths", v.item_widths),
    path(f"{P}/items/<int:pk>/products", v.item_products),
    path(f"{P}/items/<int:pk>/price", v.item_price),
    path(f"{P}/items/<int:pk>/quote", v.item_quote),
    path(f"{P}/pricing", v.pricing),
    path(f"{P}/pricing/sync", v.pricing_sync),
    path(f"{P}/pricing/unmatched", v.pricing_unmatched),
    path(f"{P}/preview", v.preview),
    path(f"{P}/duplicates", v.duplicates),
    path(f"{P}/brands", v.brands),
    path(f"{P}/archive", v.archive),
    path("erp/labels/link", v.labels_link),
]
