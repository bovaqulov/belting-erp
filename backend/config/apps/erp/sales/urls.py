"""Savdo hujjatlari API marshrutlari (docs/api/sales.md): /app/api/erp/sales/*."""

from django.urls import path

from . import views as v

P = "erp/sales"

urlpatterns = [
    path(f"{P}/docs", v.docs),
    path(f"{P}/docs/<int:pk>", v.doc),
    path(f"{P}/docs/<int:pk>/post", v.doc_post),
    path(f"{P}/docs/<int:pk>/unpost", v.doc_unpost),
    path(f"{P}/docs/<int:pk>/cancel", v.doc_cancel),
    path(f"{P}/docs/<int:pk>/create", v.doc_create),
    path(f"{P}/docs/<int:pk>/pdf", v.doc_pdf),
    path(f"{P}/from-deal", v.from_deal),
    path(f"{P}/debts", v.debts),
    path(f"{P}/customers", v.customers),
    path(f"{P}/customers/<int:pk>", v.customer),
    path(f"{P}/items", v.items),
    path(f"{P}/refs", v.refs),
]
