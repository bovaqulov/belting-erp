"""CRM API marshrutlari: /app/api/erp/crm/* (docs/api/crm.md)."""

from django.urls import path

from . import views as v

C = "erp/crm"
P = f"{C}/tg"

urlpatterns = [
    path(f"{C}/meta", v.meta),
    path(f"{C}/board", v.board),
    path(f"{C}/deals", v.deals),
    path(f"{C}/deals/<int:pk>", v.deal),
    path(f"{C}/deals/<int:pk>/stage", v.deal_stage),
    path(f"{C}/deals/<int:pk>/items", v.deal_items),
    path(f"{C}/deals/<int:pk>/doc", v.deal_doc),
    path(f"{C}/deals/<int:pk>/payment", v.deal_payment),
    path(f"{C}/intake", v.intake),
    path(f"{C}/calls", v.calls),
    path(f"{C}/calls/webhook", v.calls_webhook),
    path(f"{C}/routing", v.routing),
    path(f"{C}/docs/<int:pk>", v.doc),
    path(f"{C}/docs/<int:pk>/pdf", v.doc_pdf),
    path(f"{C}/docs/<int:pk>/<str:act>", v.doc),
    path(f"{C}/items", v.items),
    path(f"{C}/customers", v.customers),
    path(f"{C}/customers/table", v.customers_table),
    path(f"{C}/customers/<int:pk>", v.customer),
    path(f"{C}/activity", v.activity),
    path(f"{C}/tasks/<int:pk>/done", v.task_done),
    path(f"{C}/leads", v.leads),
    path(f"{C}/leads/<int:pk>/<str:act>", v.lead_act),
    path(f"{C}/goals", v.goals),
    path(f"{C}/reports", v.report),
    path(f"{P}/webhook", v.webhook),
    path(f"{C}/meta/webhook", v.meta_webhook),
    path(f"{P}/chats", v.chats),
    path(f"{P}/chats/<int:pk>/messages", v.messages),
    path(f"{P}/chats/<int:pk>/send", v.send),
    path(f"{P}/chats/<int:pk>/send-file", v.send_file),
    path(f"{P}/chats/<int:pk>/link", v.link_chat),
    path(f"{P}/messages/<int:pk>/file", v.message_file),
]
