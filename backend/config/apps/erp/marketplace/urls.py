"""Marketplace API marshrutlari: /app/api/erp/mk/* (docs/api/marketplace.md). Tartib muhim: aniq yo'l umumiydan oldin."""

from django.urls import path

from . import views as v

P = "erp/mk"

urlpatterns = [
    path(f"{P}/overview", v.overview),
    path(f"{P}/orders-counts", v.order_counts),
    path(f"{P}/audit", v.audit),
    path(f"{P}/audit/run", v.audit_run),
    path(f"{P}/audit/<int:pk>/mute", v.audit_mute),
    path(f"{P}/orders/<str:ch>/board", v.order_board),
    path(f"{P}/orders/<str:ch>/sync", v.order_sync),
    path(f"{P}/orders/<str:ch>/<str:ext>/label", v.order_label),
    path(f"{P}/orders/<str:ch>/<str:ext>/<str:act>", v.order_act),
    path(f"{P}/wb/supplies", v.wb_supplies),
    path(f"{P}/wb/supplies/<str:sid>", v.wb_supply),
    path(f"{P}/wb/supplies/<str:sid>/qr", v.wb_supply_qr),
    path(f"{P}/wb/supplies/<str:sid>/boxes/<str:act>", v.wb_boxes_act),
    path(f"{P}/wb/supplies/<str:sid>/<str:act>", v.wb_supply_act),
    path(f"{P}/wb/stickers", v.wb_stickers),
]
