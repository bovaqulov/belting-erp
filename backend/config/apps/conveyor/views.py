"""LentaCUD API (Jarvis `web/lenta_api.py`): /app/api/lenta/* — katalog, chizma (SVG), narx, zakaz matnini tahlil,
PDF'ni Telegram'ga yuborish, loyihalar.

Ruxsat — `access.can_use` (ega/admin yoki Rahbariyat, Sotuv B2B, Marketplace sotuvi a'zosi), boshqalar — 403.
MAXFIYLIK: katalog tannarxi/ustama/kurs/xizmat/zapas qiymatlari va formula tafsilotlari brauzerga HECH QACHON chiqmaydi:
`settings` holatdan olib tashlanadi (kirishda ham, chiqishda ham), narx — faqat yakuniy sotuv summalari (`safe_price`).
"""

from __future__ import annotations

import io
import json
import logging
import re
import time
from collections import deque
from datetime import date, datetime
from typing import TYPE_CHECKING, Any

from asgiref.sync import async_to_sync
from django.conf import settings
from django.http import HttpRequest, HttpResponse

from config.apps.audit import services as audit
from config.apps.core.http import ApiError, api, json_body, ok

from . import kb
from .access import can_use, deny_text
from .lenta._js import jround
from .lenta.catalog import catalog, public_catalog
from .lenta.drawing_model import guide_total_qty
from .lenta.effective import effective_config
from .lenta.locks import lock_options_of, tool_options_of
from .lenta.model import initial_state, revive
from .lenta.parse import clean_input, parse_order, public_state
from .lenta.price import LINE_KEYS, price_of
from .lenta.specs import CLEAT_SPECS, GUIDE_SPECS, SIDEWALL_SPEC, cleat_spec_for
from .models import LentaProject

if TYPE_CHECKING:
    from config.apps.staff.models import User

log = logging.getLogger(__name__)
MAX_STATE_BYTES = 300_000
META_COLS = ("customer", "application", "contact")


def _lang(b: dict[str, Any]) -> str:
    return "ru" if b.get("lang") == "ru" else "uz"


def _check(u: User) -> bool:
    return can_use(u)


DENY = deny_text()


# ------------------------------------------------------------------ xavfsiz narx
SECTION_TITLES = {
    "belt": ("Lenta", "Лента"),
    "lock": ("Ulanish", "Соединение"),
    "tool": ("Asbob", "Инструмент"),
    "guide": ("Yo'naltiruvchi profil", "Направляющий профиль"),
    "cross": ("Ko'ndalang profil", "Поперечный профиль"),
    "gofro": ("Gofrobort", "Гофроборт"),
    "perf": ("Perforatsiya", "Перфорация"),
}


def _n(x: float) -> str:
    v = round(float(x), 1)
    return (f"{v:,.1f}".rstrip("0").rstrip(".")).replace(",", " ")


def _line_desc(key: str, es: dict, lang: str) -> str:
    ru = lang == "ru"
    pcs = "шт" if ru else "dona"
    mm = "мм" if ru else "mm"
    if key == "belt":
        return f"{es['beltName']} · {_n(es['width'])} × {_n(es['length'])} {mm}"
    if key == "lock":
        if es["joinMethod"] == "install":
            return "Установка — услуга" if ru else "O'rnatib berish — xizmat"
        return f"{es['lockName']} · {_n(es['lockQty'])} {pcs}"
    if key == "tool":
        return f"{es['lockToolName']} · {_n(es['lockToolQty'])} {pcs}"
    if key == "guide":
        return f"{es['guideName']} · {_n(es['length'])} {mm} · {_n(guide_total_qty(es))} {pcs}"
    if key == "cross":
        return f"{es['crossName']} · {_n(es['crossLen'])} {mm} · {_n(len(es['crossPos']) * es['crossParts'])} {pcs}"
    if key == "gofro":
        side = "стор." if ru else "tomon"
        return f"H {_n(es['gofroHeight'])} {mm} · {_n(es['gofroQty'])} {side}"
    if key == "perf":
        return f"Ø{_n(es['perfDia'])} {mm} · {_n(es['perfQty'])} {pcs}"
    return ""


def safe_price(raw: Any, lang: str = "uz") -> dict[str, Any]:
    """Faqat yakuniy sotuv summalari (so'm, butun): qatorlar + QQS'siz jami + QQS + yakuniy."""
    eff = effective_config(revive(clean_input(raw)))
    es = eff["state"]
    issues = list(eff.get("issues") or [])
    if eff.get("blocked"):
        msg = (
            "В конфигурации ошибка — цена не рассчитывается"
            if lang == "ru"
            else "Konfiguratsiyada xato bor — narx hisoblanmaydi"
        )
        return {"blocked": True, "issues": issues, "lines": [], "totals": None, "message": msg}
    if not (es["width"] > 0 and es["length"] > 0):
        msg = "Введите ширину и длину ленты." if lang == "ru" else "Lenta eni va uzunligini kiriting."
        return {"blocked": False, "issues": issues, "lines": [], "totals": None, "message": msg}
    p = price_of(eff)
    lines = []
    for key in LINE_KEYS:
        total = float(p["lines"][key]["total"] or 0)
        if total > 0:
            t_uz, t_ru = SECTION_TITLES[key]
            lines.append(
                {
                    "key": key,
                    "title": t_ru if lang == "ru" else t_uz,
                    "desc": _line_desc(key, es, lang),
                    "amount": int(jround(total)),
                }
            )
    t = p["totals"]
    # JS Math.round (bankir emas); yakuniy = yaxlitlangan jami + QQS — summa har doim mos keladi
    subtotal, vat = int(jround(t["netAfterDiscount"])), int(jround(t["vatAmount"]))
    return {
        "blocked": False,
        "issues": issues,
        "lines": lines,
        "message": None,
        "totals": {"subtotal": subtotal, "vatAmount": vat, "final": subtotal + vat},
    }


# ------------------------------------------------------------------ chizma va PDF
def render_payload(raw: Any, lang: str = "uz") -> dict[str, Any]:
    from .lenta.render import render_drawing, to_svg

    s = revive(clean_input(raw))
    d = render_drawing(s, lang, date.today())
    sheets = []
    for sh in d.sheets:
        svg = to_svg(sh)
        if svg.startswith("<?xml"):
            svg = svg.split("?>", 1)[1].lstrip()
        sheets.append({"key": sh.key, "title": sh.title, "page": sh.page, "pages": sh.pages, "svg": svg})
    eff = effective_config(s)
    hints = {
        "crossMax": eff.get("crossMax"),
        "crossCount": len(eff["state"]["crossPos"]),
        "perfQty": eff["state"]["perfQty"] if eff["state"]["perfOn"] else 0,
    }
    return {
        "state": public_state(s),
        "sheets": sheets,
        "issues": d.issues,
        "blocked": d.blocked,
        "message": d.message,
        "hints": hints,
    }


def pdf_of(raw: Any) -> tuple[bytes, str, dict]:
    """(pdf, fayl nomi, holat). Xato bo'lsa `DrawingBlocked`."""
    from .lenta.render import pdf_file_name, render_sheets, to_pdf

    s = revive(clean_input(raw))
    return to_pdf(render_sheets(s, "uz", date.today())), pdf_file_name(s), s


def caption_of(s: dict, lang: str = "uz") -> str:
    ru = lang == "ru"
    parts = [
        ("Чертёж ленты" if ru else "Lenta chizmasi"),
        f"{s['beltName']}",
        f"{_n(s['width'])} × {_n(s['length'])} {'мм' if ru else 'mm'}",
    ]
    if s.get("projectName"):
        parts.append(("Заказчик: " if ru else "Buyurtmachi: ") + s["projectName"])
    return "\n".join(parts)[:1000]


def lenta_url(pid: int | None) -> str:
    base = (getattr(settings, "JARVIS_PUBLIC_URL", "") or "").rstrip("/")
    return f"{base}/app/lenta/" + (f"?p={pid}" if pid else "") if base else ""


def edit_markup(chat_id: int, pid: int | None, lang: str = "uz") -> Any:
    """PDF ostidagi "✏️ Tahrirlash" tugmasi — Mini App shu loyiha bilan ochiladi (shaxsiy chatda web_app, guruhda —
    oddiy havola). https manzil yo'q bo'lsa — tugmasiz."""
    from telebot.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

    url = lenta_url(pid) if pid else ""
    if not url.startswith("https://"):
        return None
    label = "✏️ Редактировать чертёж" if lang == "ru" else "✏️ Chizmani tahrirlash"
    btn = (
        InlineKeyboardButton(label, web_app=WebAppInfo(url=url))
        if chat_id > 0
        else InlineKeyboardButton(label, url=url)
    )
    m = InlineKeyboardMarkup()
    m.add(btn)
    return m


def _bot() -> Any:
    """Telegram bot (yuborish uchun) — testlarda almashtiriladi. Token yo'q — None."""
    if not settings.TELEGRAM_BOT_TOKEN:
        return None
    from config.apps.core.telegram import get_bot

    return get_bot()


def send_pdf(chat_id: int, raw: Any, lang: str = "uz", pid: int | None = None) -> str:
    """PDF'ni chatga yuboradi; fayl nomini qaytaradi. Bot yo'q bo'lsa RuntimeError."""
    data, name, s = pdf_of(raw)
    b = _bot()
    if b is None:
        raise RuntimeError("Telegram bot ishlamayapti")
    f = io.BytesIO(data)
    f.name = name
    b.send_document(chat_id, f, caption=caption_of(s, lang)[:1024], reply_markup=edit_markup(chat_id, pid, lang))
    return name


# ------------------------------------------------------------------ loyihalar
def _stamp() -> str:
    """`updated` vaqt belgisi: mikrosoniyagacha (bir soniyada ikki saqlash ham farqlansin)."""
    return datetime.now().isoformat(timespec="microseconds")


def _project_json(p: LentaProject, owner: str | None = None, *, state: bool = False) -> dict[str, Any]:
    d: dict[str, Any] = {
        "id": p.pk,
        "tg_id": p.tg_id,
        "name": p.name,
        "customer": p.customer,
        "application": p.application,
        "contact": p.contact,
        "created": p.created.isoformat() if p.created else None,
        "updated": p.updated,
    }
    if owner is not None:
        d["owner"] = owner
    if state:
        d["state"] = public_state(revive(clean_input(p.state or {})))
    return d


def project_save(
    tg_id: int, raw: Any, name: str = "", pid: int | None = None, meta: dict | None = None, expected: str | None = None
) -> LentaProject:
    """Yangi loyiha yoki yangilash. expected berilsa va bazadagisi boshqa — 409."""
    meta = {k: str((meta or {}).get(k) or "").strip()[:300] for k in META_COLS}
    raw = dict(raw or {})
    if meta["customer"]:
        raw["projectName"] = meta["customer"][:120]
    s = public_state(revive(clean_input(raw)))
    meta["customer"] = meta["customer"] or (s.get("projectName") or "").strip()
    if len(json.dumps(s, ensure_ascii=False).encode()) > MAX_STATE_BYTES:
        raise ApiError(400, "Loyiha juda katta")
    nm = (name or s.get("projectName") or "").strip()[:120] or f"Lenta {_n(s['width'])}×{_n(s['length'])}"
    if pid:
        qs = LentaProject.objects.filter(pk=pid, tg_id=tg_id)
        if expected:
            qs = qs.filter(updated=expected)
        vals: dict[str, Any] = {"name": nm, "state": s, "updated": _stamp(), "customer": meta["customer"]}
        for k in ("application", "contact"):
            if meta[k]:
                vals[k] = meta[k]
        if not qs.update(**vals):  # optimistik qulf: bitta UPDATE — poyga yo'q
            if expected and LentaProject.objects.filter(pk=pid, tg_id=tg_id).exists():
                raise ApiError(409, "Loyiha boshqa joyda o'zgartirilgan — qayta oching")
            raise ApiError(404, "Loyiha topilmadi")
        return LentaProject.objects.get(pk=pid)
    return LentaProject.objects.create(tg_id=tg_id, name=nm, state=s, updated=_stamp(), **meta)


def _can_see(u: User, p: LentaProject) -> bool:
    return p.tg_id == u.tg_id or u.is_panel


def _own_project_id(u: User, pid: Any) -> int | None:
    """Mijoz yuborgan project_id — faqat foydalanuvchi ko'ra oladigan loyiha bo'lsa (aks holda None)."""
    try:
        pid = int(pid or 0)
    except (TypeError, ValueError):
        return None
    p = LentaProject.objects.filter(pk=pid).first() if pid else None
    return pid if p and _can_see(u, p) else None


def remember_order(u: User, raw: Any, meta: dict[str, str], pid: int | None = None) -> int | None:
    """Mijoz ma'lum bo'lsa — bilimlar bazasiga yozadi (narxsiz)."""
    s = revive(clean_input(dict(raw or {})))
    customer = (meta.get("customer") or s.get("projectName") or "").strip()
    if not customer:
        return None
    s["projectName"] = customer
    return kb.record_order(
        state=s,
        customer=customer,
        application=meta.get("application") or "",
        contact=meta.get("contact") or s.get("customerPhone") or "",
        tg_id=u.tg_id,
        author=u.name or "",
        departments=u.dept_keys(),
        project_id=pid,
    )


# ------------------------------------------------------------------ chastota cheklovlari (jarayon xotirasida)
PRICE_PER_HOUR = 120  # /price: kichik va katta lentalarni ketma-ket narxlab tannarxni taxmin qilishdan himoya
CLIENTLOG_PER_MIN = 20
MAX_KEYS = 5000
_price_ts: dict[Any, deque[float]] = {}
_clientlog_ts: dict[Any, deque[float]] = {}
_BENIGN_JS = ("ResizeObserver loop",)


def _allow(store: dict[Any, deque[float]], key: Any, now: float, window: float, limit: int) -> bool:
    if key not in store and len(store) >= MAX_KEYS:
        for k in [k for k, q in store.items() if not q or now - q[-1] > window]:
            del store[k]
        if len(store) >= MAX_KEYS:
            return False
    q = store.setdefault(key, deque())
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    return True


def _strip_url(s: str) -> str:
    """Havoladan ?query va #fragment olib tashlanadi — Telegram tgWebAppData (foydalanuvchi, imzo) logga tushmasin."""
    return re.split(r"[?#]", s, maxsplit=1)[0]


def _one_line(s: Any, n: int) -> str:
    """Log soxtalashtirishdan himoya: qator ajratgichlar bo'sh joyga, uzunlik cheklangan."""
    return " ".join(str(s)[:n].splitlines())


def _num_or_none(v: Any) -> float | None:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _meta(b: dict[str, Any]) -> dict[str, str]:
    return {k: str(b.get(k) or "") for k in META_COLS}


def _merged_state(b: dict[str, Any]) -> dict[str, Any]:
    st = dict(b.get("state") or {})
    if str(b.get("customer") or "").strip():
        st["projectName"] = str(b["customer"]).strip()[:120]
    return st


def _enums() -> dict[str, Any]:
    c = catalog()
    return {
        "lockNames": [x["name"] for x in lock_options_of(c["locks"])],
        "toolNames": [x["name"] for x in tool_options_of(c["locks"])],
        "joinMethods": ["lock", "meter", "install", "weld"],
        "weldTypes": ["zinali", "oddiy", "60"],
        "gofroSides": ["left", "right"],
        # geometriya (narx emas): ko'ndalang profil tagi B, yo'naltiruvchi kesimi
        "crossFoot": {p["name"]: (cleat_spec_for(p["name"]) or {}).get("B", 0) for p in c["crossProfiles"]},
        "guideSpec": {k: {"B": v["B"], "H": v["H"]} for k, v in GUIDE_SPECS.items()},
        "cleatSpec": {k: {"B": v["B"], "H": v["H"]} for k, v in CLEAT_SPECS.items()},
        "gofroMinHeight": SIDEWALL_SPEC["minHeight"],
    }


# ------------------------------------------------------------------ endpointlar
@api(("POST",), auth=False)
def clientlog(request: HttpRequest, user: User | None) -> HttpResponse:
    """Web App JS xatolari (auth'siz — sahifa yuklanmay qolgan holatda ham keladi; hajm va chastota cheklangan)."""
    ip = request.META.get("REMOTE_ADDR") or "?"
    if not _allow(_clientlog_ts, ip, time.monotonic(), 60, CLIENTLOG_PER_MIN):
        return ok({"ok": True})
    try:
        d = json.loads(request.body[:4000] or b"{}")
        if not isinstance(d, dict):
            raise ValueError
    except ValueError:
        d = {"msg": "noto'g'ri json"}

    msg = _one_line(d.get("msg"), 500)
    level = logging.DEBUG if any(b in msg for b in _BENIGN_JS) else logging.WARNING
    src, ua = _one_line(_strip_url(str(d.get("src"))), 200), _one_line(d.get("ua"), 200)
    log.log(level, "Lenta Web App JS xatosi: %s | %s | %s", msg, src, ua)
    return ok({"ok": True})


@api(check=_check, deny=DENY)
def catalog_view(request: HttpRequest, user: User) -> HttpResponse:
    return ok(
        {
            "catalog": public_catalog(),
            "enums": _enums(),
            "initial": public_state(initial_state()),
            "user": {"name": user.name, "lang": "uz", "role": user.role},
        }
    )


@api(("POST",), check=_check, deny=DENY)
def render(request: HttpRequest, user: User) -> HttpResponse:
    b = json_body(request)
    return ok(render_payload(b.get("state") or {}, _lang(b)))


@api(("POST",), check=_check, deny=DENY)
def price(request: HttpRequest, user: User) -> HttpResponse:
    b = json_body(request)
    lang = _lang(b)
    if not _allow(_price_ts, user.tg_id, time.monotonic(), 3600, PRICE_PER_HOUR):
        raise ApiError(
            429,
            "Слишком много запросов цены — попробуйте через час"
            if lang == "ru"
            else "Narx so'rovlari juda ko'p — bir soatdan keyin urinib ko'ring",
        )
    st = b.get("state") or {}
    d = safe_price(st, lang)
    audit.log(
        "lenta_price",
        user.tg_id,
        detail={
            "belt": str(st.get("beltName") or "")[:60],
            "w": _num_or_none(st.get("width")),
            "l": _num_or_none(st.get("length")),
            "bend": _num_or_none(st.get("bendAngle")),
            "blocked": d["blocked"],
            "final": (d.get("totals") or {}).get("final"),
        },
    )
    return ok(d)


@api(("POST",), check=_check, deny=DENY)
def parse(request: HttpRequest, user: User) -> HttpResponse:
    b = json_body(request)
    text = str(b.get("text") or "")
    if not text.strip():
        raise ApiError(400, "Zakaz matnini kiriting")
    r = async_to_sync(parse_order)(text, b.get("state"), _lang(b))
    st = r.get("state") or {}
    # nima so'ralgan va nima tushunilgan — keyin auditdan ko'rish uchun (faqat matndan olingan maydonlar)
    audit.log(
        "lenta_parse",
        user.tg_id,
        detail={
            "source": r["source"],
            "text": text[:300],
            "result": {k: st.get(k) for k in r.get("provided") or [] if k in st},
            "notes": (r.get("notes") or [])[:6],
            "unknown": (r.get("unknown") or [])[:6],
        },
    )
    return ok(r)


@api(("POST",), check=_check, deny=DENY)
def send(request: HttpRequest, user: User) -> HttpResponse:
    from .lenta.render import DrawingBlocked

    b = json_body(request)
    st = _merged_state(b)
    pid = _own_project_id(user, b.get("project_id"))
    try:
        name = send_pdf(user.tg_id, st, _lang(b), pid)
    except DrawingBlocked as exc:
        eff = effective_config(revive(clean_input(st)))
        raise ApiError(409, {"message": str(exc), "issues": eff["issues"]}) from exc
    except RuntimeError as exc:
        raise ApiError(503, str(exc)) from exc
    s = revive(clean_input(st))
    kb_id = remember_order(user, st, _meta(b), pid)
    audit.log(
        "lenta_pdf_sent",
        user.tg_id,
        detail={
            "file": name,
            "belt": s["beltName"],
            "w": s["width"],
            "l": s["length"],
            "customer": s["projectName"],
            "application": str(b.get("application") or "")[:200],
        },
    )
    return ok({"ok": True, "file_name": name, "kb_id": kb_id})


@api(("GET", "POST"), check=_check, deny=DENY)
def projects(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        b = json_body(request)
        try:
            pid = int(b.get("id") or 0) or None
        except (TypeError, ValueError):
            pid = None
        p = project_save(user.tg_id, b.get("state") or {}, str(b.get("name") or ""), pid, _meta(b), b.get("updated"))
        kb_id = remember_order(user, b.get("state") or {}, _meta(b), p.pk)
        audit.log("lenta_project_saved", user.tg_id, detail={"id": p.pk})
        return ok({"ok": True, "id": p.pk, "kb_id": kb_id, "updated": p.updated})
    if request.GET.get("all") in ("1", "true") and user.is_panel:
        rows = list(LentaProject.objects.order_by("-updated")[:300])
        from config.apps.staff import services as staff

        names = staff.user_names({p.tg_id for p in rows})
        out = [_project_json(p, names.get(p.tg_id)) for p in rows]
    else:
        out = [_project_json(p) for p in LentaProject.objects.filter(tg_id=user.tg_id).order_by("-updated")[:300]]
    return ok({"projects": out, "can_all": user.is_panel})


@api(("GET", "DELETE"), check=_check, deny=DENY)
def project(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    if request.method == "DELETE":
        if not LentaProject.objects.filter(pk=pk, tg_id=user.tg_id).delete()[0]:
            raise ApiError(404, "Loyiha topilmadi")
        audit.log("lenta_project_deleted", user.tg_id, detail={"id": pk})
        return ok({"ok": True})
    p = LentaProject.objects.filter(pk=pk).first()
    if p is None or not _can_see(user, p):
        raise ApiError(404, "Loyiha topilmadi")
    return ok({**_project_json(p, state=True), "own": p.tg_id == user.tg_id})
