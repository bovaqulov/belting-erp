"""Moliya API marshrutlari (docs/api/accounting.md): /app/api/erp/contracts, counterparties, firms, payroll/*.
`payroll/staff` oydan (`<YYYY-MM>`) oldin — aniq yo'l umumiydan oldin."""

from django.urls import path

from . import views as v

E = "erp"

urlpatterns = [
    path(f"{E}/contracts", v.contracts),
    path(f"{E}/contracts/<int:pk>", v.contract),
    path(f"{E}/contracts/<int:pk>/close", v.contract_close),
    path(f"{E}/contracts/<int:pk>/reopen", v.contract_reopen),
    path(f"{E}/counterparties", v.counterparties),
    path(f"{E}/firms", v.firms),
    path(f"{E}/payroll/staff", v.staff),
    path(f"{E}/payroll/<str:month>", v.month),
    path(f"{E}/payroll/<str:month>/calc", v.month_calc),
    path(f"{E}/payroll/<str:month>/rows/<int:employee_id>", v.month_row),
    path(f"{E}/payroll/<str:month>/approve", v.month_approve),
    path(f"{E}/payroll/<str:month>/unapprove", v.month_unapprove),
    path(f"{E}/payroll/<str:month>/pay", v.month_pay),
]
