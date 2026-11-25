# Analitika API

`GET /app/api/analytics?days=7|30|90` — rahbariyat uchun bitta ekran (`/app/analytics`). Ruxsat: ega/admin yoki
rahbariyat bo'limi xodimi (aks holda 403). Noto'g'ri `days` → 30. Raqamlar har bo'limning ochiq servisidan
(`crm.services.sales_summary`, `warehouse.services.dashboard_summary`, `marketplace.services.orders_summary`) — o'sha
bo'limlardagi bilan bir xil.

```json
{
  "period": {"days": 30, "from": "2026-10-23", "to": "2026-11-21"},
  "sales": {
    "won_sum": 4000000, "won_n": 2, "avg": 2000000,
    "prev_won_sum": 2000000, "delta_pct": 100.0,
    "by_day": [{"date": "2026-11-19", "sum": 3000000}],
    "sellers": [{"tg_id": 101, "name": "U101", "sum": 4000000, "n": 2}],
    "leads_n": 0, "leads_converted": 0, "conv_pct": null, "lead_sources": {"telegram": 3},
    "deals_new": 0, "deals_lost": 0, "open_n": 0, "open_sum": 0, "customers_new": 1
  },
  "warehouse": {
    "units": 0, "items": 0, "value": 0, "no_loc": 0, "low_n": 0, "low": [{"name": "", "qty": 0, "min_qty": 0, "unit": "m"}],
    "accuracy": null, "picks": 0, "slow_units": 0, "slow_days": null, "scrap_pct": null
  },
  "marketplace": {
    "orders_n": 0, "by_channel": {"wb": 0}, "by_stage": {"new": 0}, "active_n": 0, "overdue_n": 0,
    "channel_names": {"wb": "Wildberries"}
  }
}
```

- Sotuv — CRM «Hisobot» ta'rifi: asosiy voronkadagi bosh bitim, «Jo'natishga»/«Yutildi» bosqichida, xarid sanasi
  (`buy_date`) davr ichida. `delta_pct` — oldingi teng davrga
  nisbatan; oldingi davr 0 bo'lsa `null`.
- Sotuvchilar — eng ko'p 8 ta, summa bo'yicha.
- `low` — kam qoldiqli 5 ta tovar, `low_n` — jami soni.
