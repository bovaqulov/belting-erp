"""Pul API marshrutlari (docs/api/money.md): /app/api/erp/money/*."""

from django.urls import path

from . import views as v

P = "erp/money"

urlpatterns = [
    path(f"{P}/accounts", v.accounts),
    path(f"{P}/accounts/<int:pk>", v.account),
    path(f"{P}/items", v.items),
    path(f"{P}/items/<int:pk>", v.item),
    path(f"{P}/docs", v.docs),
    path(f"{P}/docs/<int:pk>", v.doc),
    path(f"{P}/docs/<int:pk>/post", v.doc_post),
    path(f"{P}/docs/<int:pk>/unpost", v.doc_unpost),
    path(f"{P}/docs/<int:pk>/cancel", v.doc_cancel),
    path(f"{P}/flow", v.flow),
    path(f"{P}/parties", v.parties),
    path(f"{P}/refs", v.refs),
]
