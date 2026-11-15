"""Xotira API: GET /app/api/memory, POST /app/api/memory/{id}/{approve|archive|delete}."""

from django.http import HttpRequest, JsonResponse

from config.apps.core.http import ApiError, api, ok
from config.apps.staff import services as staff
from config.apps.staff.services import User

from .models import Fact

DENY = "Xotirani IT bo'limi, Rahbariyat va adminlar boshqaradi."


@api(("GET",), check=lambda u: u.can_view(), deny=DENY)
def memory(request: HttpRequest, user: User) -> JsonResponse:
    facts = list(Fact.objects.all()[:1000])
    ids = {int(f.scope_key) for f in facts if f.scope == Fact.Scope.STAFF and f.scope_key.isdigit()}
    names = staff.user_names(ids)
    return ok(
        {
            "memory": [
                {
                    "id": f.pk,
                    "fact": f.text,
                    "created": f.created_at.isoformat(),
                    "status": f.status,
                    "scope": f.scope,
                    "scope_id": f.scope_key or None,
                    "owner_name": names.get(int(f.scope_key)) if f.scope_key.isdigit() else None,
                }
                for f in facts
            ]
        }
    )


@api(("POST",), check=lambda u: u.can_manage_agents(), deny=DENY)
def memory_act(request: HttpRequest, user: User, pk: int, act: str) -> JsonResponse:
    f = Fact.objects.filter(pk=pk).first()
    if f is None:
        raise ApiError(404, "Fakt topilmadi")
    if act == "delete":
        f.delete()
    elif act in ("approve", "archive"):
        f.status = Fact.Status.ACTIVE if act == "approve" else Fact.Status.ARCHIVED
        f.save(update_fields=["status"])
    else:
        raise ApiError(400, "Amal: approve, archive yoki delete.")
    return ok()
