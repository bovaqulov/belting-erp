"""Hisobotlar API (Jarvis server.py): /app/api/report (xodim formasi), /app/api/templates (shablonlar, IT tasdig'i)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.http import HttpRequest, HttpResponse

from config.apps.audit import services as audit
from config.apps.core.http import ApiError, api, json_body, ok
from config.apps.staff import services as staff

from . import logic as L

if TYPE_CHECKING:
    from config.apps.staff.models import User


def _member(u: User, dept: str) -> None:
    """dept — xodim o'zi to'ldiradigan birlik bo'lishi kerak (ega/admin — har qanday)."""
    if u.role not in ("owner", "admin", "employee") or (dept not in L.user_units(u) and not u.is_panel):
        raise ApiError(403, "Siz bu bo'limda emassiz")
    if L.unit_info(dept) is None:
        raise ApiError(404, "Bunday bo'lim yo'q")


@api(("GET", "POST"))
def report(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        b = json_body(request)
        dept = str(b.get("dept") or "")
        _member(user, dept)
        raw = b.get("values")
        try:
            day = L.parse_date(b.get("date"))
            values = L.clean_values(dept, raw if isinstance(raw, dict) else {}, clear_empty=True)
        except ValueError as e:
            raise ApiError(400, str(e)) from e
        L.upsert(dept, user.tg_id, day, values)
        audit.log("report_submitted", user.tg_id, dept, detail={"date": day, "via": "form", **values})
        return ok({"ok": True})
    dept = request.GET.get("dept", "")
    _member(user, dept)
    tpl = L.active(dept)
    if tpl is None:
        raise ApiError(404, "Bu bo'limda hisobot shabloni yo'q")
    try:
        day = L.parse_date(request.GET.get("date"))
    except ValueError as e:
        raise ApiError(400, str(e)) from e
    return ok(
        {
            "template": L._tpl(tpl),
            "date": day,
            "values": L.values_for(dept, user.tg_id, day),
            "auto": {},
            "user": user.name,
        }
    )


@api(("GET", "POST"))
def templates(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        b = json_body(request)
        dept = str(b.get("dept") or "")
        if not L.can_propose(user, dept):
            raise ApiError(403, "Shablonni faqat bo'lim boshlig'i, admin yoki IT o'zgartira oladi")
        try:
            return ok({"template": L.propose(dept, b, user)})
        except ValueError as e:
            raise ApiError(400, str(e)) from e
    mine = L.managed_depts(user)
    can_edit = mine | {k for d in mine for k in L.categories(d)}
    approver = L.is_approver(user)
    if not can_edit and not approver:
        raise ApiError(403, "Ruxsat yo'q")
    units = [*staff.departments_info().values()]
    units += [u for k in L.depts_with_reports() if L.is_category(k) and (u := L.unit_info(k))]
    return ok(
        {
            "templates": L.history(),
            "is_approver": approver,
            "approver_dept": L.APPROVER_DEPT,
            "can_edit": sorted(can_edit),
            "depts": [
                {"key": d["key"], "title": d["name"], "name": d["name"], "icon": d["icon"], "color": d["color"]}
                for d in units
            ],
        }
    )


@api(("POST",))
def template_decide(request: HttpRequest, user: User, pk: int, action: str) -> HttpResponse:
    if action not in ("approve", "reject"):
        raise ApiError(400, "Noma'lum amal")
    try:
        t = L.decide(pk, user, approve=action == "approve", reason=str(json_body(request).get("reason") or ""))
    except ValueError as e:
        raise ApiError(400, str(e)) from e
    except PermissionError as e:
        raise ApiError(403, str(e)) from e
    return ok({"template": t})
