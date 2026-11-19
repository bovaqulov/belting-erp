"""ERP testlari: har testdan keyin ombor jurnali butunligi — har birlik uchun Σ delta = joriy qoldiq
(sex, CRM, marketplace ham ombor servislari orqali qoldiqni o'zgartiradi)."""

import pytest


@pytest.fixture(autouse=True)
def ledger_balances(request):
    yield
    if request.node.get_closest_marker("django_db") is None and "db" not in request.fixturenames:
        return
    from django.db.models import Sum

    from config.apps.erp.warehouse.models import StockMove, Unit

    sums = dict(StockMove.objects.filter(unit__isnull=False).values_list("unit_id").annotate(s=Sum("delta")))
    for u in Unit.objects.all():
        want = 0 if u.pending else u.qty
        assert sums.get(u.pk, 0) == want, f"jurnal ≠ qoldiq: {u.code or u.pk} — Σ={sums.get(u.pk)}, qty={u.qty}"
