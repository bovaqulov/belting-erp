"""Sex API marshrutlari: /app/api/erp/shop/* (docs/api/workshop.md)."""

from django.urls import path

from . import views as v

P = "erp/shop"

urlpatterns = [
    path(f"{P}/board", v.board),
    path(f"{P}/jobs/<int:pk>", v.job),
    path(f"{P}/jobs/<int:pk>/<str:act>", v.job_act),
    path(f"{P}/group", v.group),
    path(f"{P}/group/<str:act>", v.group_act),
    path(f"{P}/cut-preview", v.cut_preview),
    path(f"{P}/sticker.pdf", v.sticker),
    path("erp/jobs/<int:pk>/drawing.pdf", v.drawing),
]
