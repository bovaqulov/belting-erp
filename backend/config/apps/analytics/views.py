"""Analitika API: GET /app/api/analytics?days=7|30|90 — rahbariyat uchun bitta ekran: savdo (CRM, oldingi teng davr
bilan solishtirish), ombor (qoldiq, qiymat, kam qoldiq, aniqlik), marketplace (buyurtmalar kanal/bosqich bo'yicha).
Har manba — o'z appining ochiq interfeysi orqali (raqamlar o'sha bo'limlardagi bilan bir xil)."""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING, Any

from django.http import HttpRequest, HttpResponse
from django.utils import timezone

from config.apps.core.http import api, ok
from config.apps.erp.crm import services as crm
from config.apps.erp.marketplace import services as mp
from config.apps.erp.warehouse import services as wh
from config.apps.staff import services as staff

if TYPE_CHECKING:
    from config.apps.staff.models import User

PERIODS = (7, 30, 90)
DENY = "Ruxsat yo'q: analitikani rahbariyat va ega/admin ko'radi"


def can_view(u: User) -> bool:
    return u.is_panel or (u.role == "employee" and u.in_lead_dept())


def _delta(cur: float, prev: float) -> float | None:
    """O'zgarish foizi; oldingi davr 0 — None (cheksiz o'sishni ko'rsatmaymiz)."""
    return round((cur - prev) / prev * 100, 1) if prev else None


@api(check=can_view, deny=DENY)
def analytics(request: HttpRequest, user: User) -> HttpResponse:
    try:
        days = int(request.GET.get("days") or 30)
    except ValueError:
        days = 30
    days = days if days in PERIODS else 30
    d2 = timezone.localdate()
    d1 = d2 - timedelta(days=days - 1)
    sales = crm.sales_summary(d1, d2)
    prev = crm.sales_summary(d1 - timedelta(days=days), d1 - timedelta(days=1))
    names = staff.user_names({s["tg_id"] for s in sales["sellers"] if s["tg_id"]})
    sales["sellers"] = [{**s, "name": names.get(s["tg_id"]) or "Mas'ulsiz"} for s in sales["sellers"][:8]]
    sales["avg"] = round(sales["won_sum"] / sales["won_n"]) if sales["won_n"] else 0
    sales["prev_won_sum"] = prev["won_sum"]
    sales["delta_pct"] = _delta(sales["won_sum"], prev["won_sum"])
    sales["conv_pct"] = round(sales["leads_converted"] / sales["leads_n"] * 100, 1) if sales["leads_n"] else None
    dash = wh.dashboard_summary()
    stock: dict[str, Any] = dash.get("stock") or {}
    warehouse = {
        "units": stock.get("units", 0),
        "items": stock.get("items", 0),
        "value": stock.get("value"),
        "no_loc": stock.get("no_loc", 0),
        "low_n": len(dash.get("low") or []),
        "low": (dash.get("low") or [])[:5],
        "accuracy": dash.get("accuracy"),
        "picks": dash.get("picks", 0),
        "slow_units": dash.get("slow_units", 0),
        "slow_days": dash.get("slow_days"),
        "scrap_pct": dash.get("scrap_pct"),
    }
    return ok(
        {
            "period": {"days": days, "from": d1.isoformat(), "to": d2.isoformat()},
            "sales": sales,
            "warehouse": warehouse,
            "marketplace": mp.orders_summary(d1, d2),
        }
    )
