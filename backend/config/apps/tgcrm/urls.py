"""TelegramCRM API: /app/api/tgcrm/* (docs/api/tgcrm.md)."""

from django.urls import path, register_converter

from . import views as v


class SignedInt:
    """Telegram peer_id: guruh/kanal — manfiy (-100…)."""

    regex = "-?[0-9]+"

    def to_python(self, value: str) -> int:
        return int(value)

    def to_url(self, value: int) -> str:
        return str(value)


register_converter(SignedInt, "peer")

P = "tgcrm"

urlpatterns = [
    path(f"{P}/status", v.status),
    path(f"{P}/health", v.health_view),
    path(f"{P}/accounts", v.accounts),
    path(f"{P}/accounts/<int:pk>", v.account),
    path(f"{P}/accounts/<int:pk>/login", v.login),
    path(f"{P}/accounts/<int:pk>/logout", v.logout),
    path(f"{P}/accounts/<int:pk>/restart", v.restart),
    path(f"{P}/accounts/<int:pk>/events", v.events),
    path(f"{P}/accounts/<int:pk>/sync", v.sync),
    path(f"{P}/accounts/<int:pk>/folders", v.folders),
    path(f"{P}/accounts/<int:pk>/dialogs", v.dialogs),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>", v.chat),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/messages", v.messages),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/read", v.read),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/send", v.send),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/typing", v.typing),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/send-file", v.send_file),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/media/<int:msg>", v.media),
    path(f"{P}/accounts/<int:pk>/search", v.search_all),
    path(f"{P}/accounts/<int:pk>/staff", v.staff_list),
    path(f"{P}/accounts/<int:pk>/ai", v.ai_settings),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/ai-off", v.chat_ai_off),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/ai", v.chat_ai_ask),
    path(f"{P}/tags", v.tags),
    path(f"{P}/accounts/<int:pk>/report", v.crm_report),
    path(f"{P}/accounts/<int:pk>/quick-replies", v.quick_replies),
    path(f"{P}/accounts/<int:pk>/quick-replies/<int:reply>", v.quick_reply_delete),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/contact", v.contact),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/contact/notes", v.contact_note),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/contact/notes/<int:note>", v.contact_note_delete),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/contact/tasks", v.contact_task),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/contact/tasks/<int:task>/done", v.contact_task_done),
    path(f"{P}/accounts/<int:pk>/members", v.members),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/assign", v.assign),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/lock", v.lock),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/lock-state", v.lock_state),
    path(f"{P}/accounts/<int:pk>/peers/<peer:peer>/photo", v.peer_photo),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/info", v.chat_info),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/members", v.chat_members),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/search", v.chat_search),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/messages/delete", v.msg_delete),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/messages/forward", v.msg_forward),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/messages/<int:msg>/edit", v.msg_edit),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/messages/<int:msg>/react", v.msg_react),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/messages/<int:msg>/pin", v.msg_pin),
    path(f"{P}/accounts/<int:pk>/chats/<peer:peer>/<str:what>", v.chat_set),
]
