"""Agent, jadval, topshiriq kirish ma'lumotlarini tekshirish → model maydonlari. Xato — ApiError(400/409) aniq matn bilan.

Qoidalar docs/api/agents.md bilan bir xil: kalit formati va noyobligi, staff — xodim majburiy, dept ning yuqorisi faqat
dept, daraxtda sikl yo'q, vosita/doira/kanal qiymatlari ro'yxatdan.
"""

from __future__ import annotations

import re
import secrets
from datetime import date
from typing import Any

from config.apps.core.http import ApiError
from config.apps.staff.models import User

from .constants import (
    CHANNEL_MODES,
    CHANNEL_TYPES,
    KEY_RE,
    KINDS,
    MODELS,
    REPEATS,
    SCOPE_AREAS,
    SCOPE_LEVELS,
    TASK_STATUSES,
    TOOLS,
)
from .models import Agent

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _bad(msg: str) -> ApiError:
    return ApiError(400, msg)


def _str(data: dict[str, Any], k: str, max_len: int) -> str:
    v = data.get(k)
    if not isinstance(v, str):
        raise _bad(f"«{k}» matn bo'lsin.")
    v = v.strip()
    if len(v) > max_len:
        raise _bad(f"«{k}» juda uzun (ko'pi {max_len} belgi).")
    return v


def _date(v: Any, field: str) -> date | None:
    if v in (None, ""):
        return None
    try:
        return date.fromisoformat(str(v))
    except ValueError as e:
        raise _bad(f"«{field}» sana YYYY-MM-DD ko'rinishida bo'lsin.") from e


def check_parent(key: str | None, kind: str, parent: Agent | None) -> None:
    if parent is None:
        return
    if kind == "dept" and parent.kind != "dept":
        raise _bad("Bo'lim agentining yuqorisi faqat bo'lim agenti bo'ladi (Xodimlar daraxti uzilmasin).")
    cur: Agent | None = parent
    seen: set[int] = set()
    while cur is not None and cur.pk not in seen:
        if key and cur.key == key:
            raise _bad("Agentni o'zining sub-agenti ostiga qo'yib bo'lmaydi (daraxtda aylana).")
        seen.add(cur.pk)
        cur = cur.parent


def clean_agent(data: dict[str, Any], agent: Agent | None) -> dict[str, Any]:
    """Yangi (agent=None) — to'liq; tahrir — faqat kelgan maydonlar. key va kind tahrirda e'tiborsiz."""
    is_new = agent is None
    out: dict[str, Any] = {}
    present = (lambda k: k in data) if not is_new else (lambda k: True)

    if is_new:
        key = data.get("key")
        if not isinstance(key, str) or not re.match(KEY_RE, key):
            raise _bad(
                "Kalit: lotin kichik harf bilan boshlansin, faqat a–z, 0–9 va _ (2–32 belgi), masalan sotuv_b2b."
            )
        if Agent.objects.filter(key=key).exists():
            raise ApiError(409, f"«{key}» kaliti band — boshqasini tanlang.")
        kind = data.get("kind", "free")
        if kind not in KINDS:
            raise _bad("Agent turi: dept, staff yoki free.")
        out["key"], out["kind"] = key, kind
    kind = out.get("kind") or (agent.kind if agent else "free")

    if present("name"):
        out["name"] = _str(data, "name", 120)
        if not out["name"]:
            raise _bad("Nomini yozing.")
    if "name_ru" in data:
        out["name_ru"] = _str(data, "name_ru", 120) or out.get("name") or (agent.name if agent else "")
    if present("persona"):
        p = _str(data, "persona", 20000)
        if len(p) < 20:
            raise _bad("Persona juda qisqa — agent kim va nima qilishini 1–2 gapda yozing.")
        out["persona"] = p
    if "icon" in data:
        out["icon"] = _str(data, "icon", 40) or "bot"
    if "color" in data:
        c = _str(data, "color", 9)
        if not HEX.match(c):
            raise _bad("Rang #rrggbb ko'rinishida bo'lsin.")
        out["color"] = c
    if "model" in data:
        if data["model"] not in MODELS:
            raise _bad(f"Model: {', '.join(MODELS)} dan biri.")
        out["model"] = data["model"]
    if "tools" in data:
        tools = data["tools"]
        if not isinstance(tools, list) or any(t not in TOOLS for t in tools):
            raise _bad("Noma'lum vosita bor — ro'yxatdan tanlang.")
        if not tools:
            raise _bad("Kamida bitta vosita tanlang.")
        out["tools"] = list(dict.fromkeys(tools))
    if "sees_all" in data:
        out["sees_all"] = bool(data["sees_all"]) and kind == "dept"
    if "scopes" in data:
        sc = data["scopes"] or {}
        if not isinstance(sc, dict) or any(a not in SCOPE_AREAS for a in sc):
            raise _bad("Ma'lumot doirasida noma'lum soha bor.")
        sc = {a: v for a, v in sc.items() if v and v != "inherit"}
        if any(v not in SCOPE_LEVELS for v in sc.values()):
            raise _bad("Ma'lumot doirasi: all, team, own, none yoki rol bo'yicha.")
        out["scopes"] = sc
    if "audience" in data:
        au = data["audience"] or {}
        depts, users = au.get("depts") or [], au.get("users") or []
        if not isinstance(depts, list) or not isinstance(users, list):
            raise _bad("«Kim foydalanadi» noto'g'ri.")
        known = set(Agent.objects.filter(kind="dept", key__in=depts).values_list("key", flat=True))
        if set(depts) - known:
            raise _bad(f"Bo'lim topilmadi: {', '.join(sorted(set(depts) - known))}.")
        ids = [int(x) for x in users]
        found = set(User.objects.filter(tg_id__in=ids).values_list("tg_id", flat=True))
        if set(ids) - found:
            raise _bad("«Kim foydalanadi» da noma'lum xodim bor.")
        out["audience_depts"], out["audience_users"] = list(dict.fromkeys(depts)), list(dict.fromkeys(ids))
    if "channels" in data:
        chs = data["channels"] or []
        if not isinstance(chs, list):
            raise _bad("Kanallar ro'yxat bo'lsin.")
        clean = []
        for c in chs:
            if (
                not isinstance(c, dict)
                or c.get("type") not in CHANNEL_TYPES
                or c.get("mode", "approve") not in CHANNEL_MODES
            ):
                raise _bad("Kanal turi yoki javob rejimi noto'g'ri.")
            ref = str(c.get("ref") or "").strip()
            if c["type"] != "web" and not ref:
                raise _bad("Kanal manzilini yozing (guruh, @akkaunt).")
            clean.append(
                {
                    "id": str(c.get("id") or secrets.token_urlsafe(6))[:40],
                    "type": c["type"],
                    "ref": ref[:120],
                    "mode": c.get("mode", "approve"),
                }
            )
        out["channels"] = clean
    if present("owner_tg") or kind == "staff":
        tg = data.get("owner_tg", agent.owner.tg_id if agent and agent.owner else None)
        owner = User.objects.filter(tg_id=int(tg)).first() if tg else None
        if tg and owner is None:
            raise _bad("Biriktiriladigan xodim topilmadi.")
        if kind == "staff" and owner is None:
            raise _bad("Xodim agenti uchun xodimni tanlang.")
        out["owner"] = owner
    if present("parent"):
        pk = data.get("parent")
        parent = Agent.objects.filter(key=pk).first() if pk else None
        if pk and parent is None:
            raise _bad(f"Yuqori agent topilmadi: {pk}.")
        check_parent(agent.key if agent else out.get("key"), kind, parent)
        out["parent"] = parent
    return out


def clean_schedule(data: dict[str, Any], partial: bool) -> dict[str, Any]:
    out: dict[str, Any] = {}
    has = (lambda k: k in data) if partial else (lambda k: True)
    if has("title"):
        out["title"] = _str(data, "title", 200)
        if not out["title"]:
            raise _bad("Nomini yozing (masalan: Ertalabki savdo hisoboti).")
    if has("instruction"):
        out["instruction"] = _str(data, "instruction", 20000)
        if len(out["instruction"]) < 10:
            raise _bad("Ko'rsatma juda qisqa — agent nima qilishi kerakligini yozing.")
    if has("repeat"):
        if data.get("repeat") not in REPEATS:
            raise _bad("Takror: daily, weekly, monthly yoki once.")
        out["repeat"] = data["repeat"]
    if has("time"):
        if not HHMM.match(str(data.get("time", ""))):
            raise _bad("Vaqt HH:MM ko'rinishida bo'lsin.")
        out["time"] = data["time"]
    if "days" in data:
        days = data["days"] or []
        if not isinstance(days, list) or any(not isinstance(d, int) or not 1 <= d <= 7 for d in days):
            raise _bad("Kunlar 1 (Du) dan 7 (Ya) gacha.")
        out["days"] = sorted(set(days))
    if "day" in data:
        if not isinstance(data["day"], int) or not 1 <= data["day"] <= 28:
            raise _bad("Oy kuni 1–28 oralig'ida bo'lsin.")
        out["day"] = data["day"]
    if "date" in data:
        out["date"] = _date(data["date"], "date")
    if "deliver" in data:
        out["deliver"] = _str(data, "deliver", 40) or "owner"
    if "enabled" in data:
        out["enabled"] = bool(data["enabled"])
    rep = out.get("repeat")
    if rep == "weekly" and not out.get("days", [1]) and not partial:
        raise _bad("Kamida bitta kun tanlang.")
    if rep == "once" and out.get("date") is None and not partial:
        raise _bad("Sanani tanlang.")
    return out


def clean_task(data: dict[str, Any], partial: bool) -> dict[str, Any]:
    out: dict[str, Any] = {}
    has = (lambda k: k in data) if partial else (lambda k: True)
    if has("title"):
        out["title"] = _str(data, "title", 200)
        if not out["title"]:
            raise _bad("Topshiriq nomini yozing.")
    if has("instruction"):
        out["instruction"] = _str(data, "instruction", 20000)
        if len(out["instruction"]) < 10:
            raise _bad("Ko'rsatma juda qisqa — nima qilish va natija qanday bo'lishini yozing.")
    if "due" in data:
        out["due"] = _date(data["due"], "due")
    if "status" in data:
        if data["status"] not in TASK_STATUSES:
            raise _bad("Holat: new, doing, done yoki failed.")
        out["status"] = data["status"]
    return out
