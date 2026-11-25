"""Lenta buyurtmalari → bilimlar bazasi (Jarvis `knowledge/lenta_kb.py`).

Chizma yuborilganda/saqlanganda mijoz ("Kimga tegishli?") va qo'llanilishi ("Nimaga ishlatiladi?") yoziladi: har mijozga
BITTA KB yozuvi (yo'l "Mijozlar › Lenta buyurtmalari › <Mijoz>"), har yangi buyurtma tarixga qo'shiladi (bir xil
konfiguratsiya takrorlanmaydi). NARX YO'Q. KB — knowledge ochiq interfeysi orqali (graf belting'da hujjatlardan quriladi).
"""

from __future__ import annotations

import logging
import re
from typing import Any

from django.utils import timezone

from config.apps.knowledge import services as kb

from .access import LENTA_DEPTS

log = logging.getLogger(__name__)

KB_SOURCE = "lenta"
PATH_ROOT = "Mijozlar › Lenta buyurtmalari"
HISTORY_MAX = 25
_HIST_HEAD = "Buyurtmalar tarixi:"


def _n(x: Any) -> str:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return str(x)
    return str(int(v)) if v.is_integer() else f"{v:.1f}".rstrip("0").rstrip(".")


def config_summary(s: dict) -> str:
    """Konfiguratsiyaning qisqa, narxsiz tavsifi (bir qator)."""
    parts = [f"{s.get('beltName', '').strip()} · {_n(s.get('width'))}×{_n(s.get('length'))} mm"]
    if s.get("lockOn"):
        jm = s.get("joinMethod")
        if jm == "lock":
            parts.append(f"qulf {s.get('lockName', '')}")
        elif jm == "weld":
            parts.append("payvand")
        elif jm == "install":
            parts.append("joyida o'rnatish")
        else:
            parts.append("metraj")
    if s.get("guideOn"):
        g = []
        if s.get("guideBottomOn"):
            g.append(f"ostidan {_n(s.get('guideBottomQty'))}")
        if s.get("guideTopOn"):
            g.append(f"ustidan {_n(s.get('guideTopQty'))}")
        parts.append(f"yo'naltiruvchi {s.get('guideName', '')} ({', '.join(g) or '—'})")
    if s.get("crossOn") and s.get("crossPos"):
        xs = list(s["crossPos"])
        step = f", qadam {_n(round((xs[-1] - xs[0]) / (len(xs) - 1), 1))} mm" if len(xs) > 1 else ""
        parts.append(f"ko'ndalang {s.get('crossName', '')} {len(xs)} ta{step}")
    if s.get("gofroOn"):
        parts.append(f"gofrobort H{_n(s.get('gofroHeight'))} × {_n(s.get('gofroQty'))} tomon")
    if s.get("perfOn"):
        edge = s.get("perfEdge") or 0
        parts.append(
            f"teshik Ø{_n(s.get('perfDia'))} × {_n(s.get('perfQty'))}"
            + (f", chetdan {_n(edge)} mm (ikkala chetdan)" if edge else "")
        )
    return " · ".join(p for p in parts if p)


def kb_dept_for(departments: list[str] | None) -> str:
    """Foydalanuvchining savdo bo'limi (lenta vositasi bor, avval 'sotuv*')."""
    lenta = [d for d in (departments or []) if d in LENTA_DEPTS]
    for d in lenta:
        if d.startswith("sotuv"):
            return d
    return lenta[0] if lenta else "sotuv_b2b"


def _parse_history(body: str) -> list[str]:
    out: list[str] = []
    on = False
    for ln in body.splitlines():
        if ln.strip() == _HIST_HEAD:
            on = True
            continue
        if on and ln.startswith("- "):
            out.append(ln[2:].strip())
    return out


def _sig(line: str) -> str:
    """Tarix qatoridagi konfiguratsiya qismi (sana/muallif/loyihasiz) — takrorni aniqlash uchun."""
    parts = [p.strip() for p in line.split(" | ")]
    return parts[3] if len(parts) >= 4 else line


def build_body(customer: str, contact: str, applications: list[str], history: list[str]) -> str:
    lines = [f"Mijoz: {customer}"]
    if contact:
        lines.append(f"Kontakt: {contact}")
    lines.append("Qo'llanilishi: " + ("; ".join(applications) if applications else "ko'rsatilmagan"))
    lines += ["", "Konveyer lenta buyurtmalari (Agent lenta chizmasi orqali, narxsiz).", "", _HIST_HEAD]
    lines += [f"- {h}" for h in history]
    return "\n".join(lines)


_APP_RE = re.compile(r"^Qo'llanilishi: (.*)$", re.MULTILINE)
_CONTACT_RE = re.compile(r"^Kontakt: (.*)$", re.MULTILINE)


_PLACEHOLDER = re.compile(
    r"\b(namuna|aniqlanmagan|noma'?lum|ko'?rsatilmagan|test|sinov|taxmin|example|unknown|"
    r"не\s*указан|неизвестн|образец|тест)\b|^[-—–.?\s]*$",
    re.I,
)


def is_placeholder(text: str | None) -> bool:
    """Mijoz/qo'llanish o'rniga yozilgan to'ldiruvchi so'z (haqiqiy ma'lumot emas)."""
    return bool(_PLACEHOLDER.search((text or "").strip()))


def record_order(
    *,
    state: dict,
    customer: str,
    application: str = "",
    contact: str = "",
    tg_id: int = 0,
    author: str = "",
    departments: list[str] | None = None,
    project_id: int | None = None,
    date: str | None = None,
) -> int | None:
    """KB yozuvini yaratadi/yangilaydi → kb id (yoki None — mijoz yo'q/to'ldiruvchi so'z/xato)."""
    customer = (customer or "").strip()[:120]
    if not customer or is_placeholder(customer):
        return None  # "Namuna", "aniqlanmagan", "test"... — uydirma mijoz bilimlar bazasini ifloslamasin
    application = (application or "").strip()[:300]
    if is_placeholder(application):
        application = ""
    contact = (contact or "").strip()[:120]
    dept = kb_dept_for(departments)
    path = f"{PATH_ROOT} › {customer}"
    title = f"{customer} — konveyer lenta buyurtmalari"
    day = date or timezone.localdate().isoformat()
    summ = config_summary(state)
    line = " | ".join(
        [
            day,
            author or "—",
            f"loyiha #{project_id}" if project_id else "loyiha —",
            summ,
            application or "qo'llanilishi ko'rsatilmagan",
        ]
    )
    try:
        cur = kb.find_doc(path, KB_SOURCE)
        if cur:
            hist = [h for h in _parse_history(cur["body"]) if _sig(h) != summ]
            hist = [line, *hist][:HISTORY_MAX]
            m = _APP_RE.search(cur["body"])
            apps = [
                a.strip() for a in (m.group(1).split(";") if m else []) if a.strip() and a.strip() != "ko'rsatilmagan"
            ]
            if application and application not in apps:
                apps.append(application)
            mc = _CONTACT_RE.search(cur["body"])
            body = build_body(customer, contact or (mc.group(1).strip() if mc else ""), apps, hist)
            return kb.save_doc(dept=dept, title=title, body=body, path=path, source=KB_SOURCE, doc_id=cur["id"])
        body = build_body(customer, contact, [application] if application else [], [line])
        return kb.save_doc(dept=dept, title=title, body=body, path=path, source=KB_SOURCE, tg_id=tg_id or None)
    except Exception as exc:
        log.warning("lenta KB yozilmadi: %s", exc)
        return None
