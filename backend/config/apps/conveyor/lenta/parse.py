"""Erkin matndagi lenta zakazini (uz/ru) qisman `State` ga aylantirish.

Asosiy yo'l — Claude (claude_agent_sdk, vositalarsiz, faqat JSON). LLM ishlamasa —
deterministik (regex) tahlil: lenta turi, eni × uzunligi, qulf, yo'naltiruvchi, ko'ndalang
profil, gofra, teshiklar, mijoz. Katalog nomlari doim token-moslash bilan tekshiriladi.

Natija: {"state": <brauzerga beriladigan holat, settings'siz>, "notes": [...], "unknown": [...],
"source": "llm" | "fallback"}.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
from difflib import SequenceMatcher
from functools import lru_cache
from typing import Any

from .catalog import catalog
from .items import even_positions
from .locks import lock_options_of, tool_options_of
from .model import initial_state, revive
from .specs import SIDEWALL_SPEC, cleat_spec_for

log = logging.getLogger(__name__)
MODEL = os.getenv("JARVIS_LENTA_MODEL", os.getenv("JARVIS_KNOWLEDGE_MODEL", "claude-sonnet-5-5"))
LLM_TIMEOUT = float(os.getenv("JARVIS_LENTA_LLM_TIMEOUT", "90"))

# Forma ishlatadigan (LLM to'ldira oladigan) maydonlar
FORM_FIELDS: dict[str, str] = {
    "beltName": "str",
    "width": "num",
    "length": "num",
    "bendAngle": "num",
    "curveHoleCount": "num",
    "curveHoleDia": "num",
    "curveHoleEdge": "num",
    "curveHoleRows": "num",
    "lockOn": "bool",
    "joinMethod": "str",
    "lockName": "str",
    "lockQty": "num",
    "weldType": "str",
    "installPrice": "num",
    "lockToolOn": "bool",
    "lockToolName": "str",
    "lockToolQty": "num",
    "guideOn": "bool",
    "guideName": "str",
    "guideBottomOn": "bool",
    "guideBottomQty": "num",
    "guideBottomInset": "num",
    "guideTopOn": "bool",
    "guideTopQty": "num",
    "guideTopInset": "num",
    # yakka (1 dona) yo'naltiruvchi joyi: chap chetdan / o'ng chetdan profil o'qigacha (merge At ga aylantiradi)
    "guideBottomAt": "num",
    "guideTopAt": "num",
    "guideBottomFromRight": "num",
    "guideTopFromRight": "num",
    "crossOn": "bool",
    "crossName": "str",
    "crossLen": "num",
    "crossLenAuto": "bool",
    "crossParts": "num",
    "crossGap": "num",
    "gofroOn": "bool",
    "gofroName": "str",
    "gofroHeight": "num",
    "gofroQty": "num",
    "gofroSide": "str",
    "gofroInsetL": "num",
    "gofroInsetR": "num",
    "perfOn": "bool",
    "perfDia": "num",
    "perfQty": "num",
    "perfStagger": "bool",
    "perfEdge": "num",
    "perfGrid": "bool",
    "perfRows": "num",
    "perfCols": "num",
    "perfPitchL": "num",
    "perfPitchW": "num",
    "perfStart": "num",
    "projectName": "str",
    "customerPhone": "str",
    "customerAddress": "str",
    "author": "str",
}
NAME_KIND = {
    "beltName": "belt",
    "lockName": "lock",
    "lockToolName": "tool",
    "guideName": "guide",
    "crossName": "cross",
    "gofroName": "gofro",
}
KIND_LABEL = {
    "belt": "lenta turi",
    "lock": "qulf",
    "tool": "asbob",
    "guide": "yo'naltiruvchi profil",
    "cross": "ko'ndalang profil",
    "gofro": "gofrobort",
}


# ------------------------------------------------------------------ katalog nomlari
def names(kind: str) -> list[str]:
    c = catalog()
    if kind == "belt":
        return [b["name"] for b in c["belts"]]
    if kind == "lock":
        return [x["name"] for x in lock_options_of(c["locks"])]
    if kind == "tool":
        return [x["name"] for x in tool_options_of(c["locks"])]
    key = {"guide": "guideProfiles", "cross": "crossProfiles", "gofro": "gofroProfiles"}[kind]
    return [x["name"] for x in c[key]]


_HOMO = str.maketrans("АВЕКМНОРСТУХ", "ABEKMHOPCTYX")
_NOISE = re.compile(r"ПРОФИЛЬ|PROFIL|ГОФРОБОРТ|GOFROBORT|ПЕРФОРАЦИЯ|ИНСТРУМЕНТ ТИП|\bTIP\b")
_SYN = [
    (r"ko['ʻ’`‘]?k|синий|синяя|голуб\w*|blue", " BLUE "),
    (r"\boq\b|белый|белая|white", " WHITE "),
    (r"yashil|зел[её]н\w*|green", " GREEN "),
    (r"\bqora\b|ч[её]рн\w*|black", " BLACK "),
    (r"vafli|вафл\w*", " VAFLI "),
    (r"matt?ov\w*|мат\w*", " MATT "),
    (r"silikon|силикон\w*", " SILICON "),
]


def tokens(s: str) -> list[str]:
    s = (s or "").replace("\xa0", " ")
    for pat, rep in _SYN:
        s = re.sub(pat, rep, s, flags=re.I)
    s = _NOISE.sub(" ", s.upper()).translate(_HOMO).replace(",", ".")
    return re.findall(r"[0-9]+(?:\.[0-9]+)?|[A-ZА-Я]+", s)


QUALIFIERS = {"BLUE", "WHITE", "GREEN", "BLACK", "MATT", "VAFLI", "TOOTHED", "PETROL", "SILICON"}


@lru_cache(maxsize=4096)  # katalog nomlari har qidiruvda qayta-qayta normallanadi (resolve vaqtining ~2/3 qismi)
def _norm(s: str) -> str:
    return "".join(tokens(s))


def _words(s: str) -> list[str]:
    """Bo'sh joy bilan ajratilgan so'zlar (siqilgan): "U13 ko'k 1,3 mm" -> ["U13", "BLUE", "1.3"]."""
    out = []
    for w in re.split(r"[\s/()]+", s or ""):
        n = _norm(w)
        if n and n not in ("MM", "MM.", "LENTA"):
            out.append(n)
    return out


RESOLVE_MAX = 120
MAX_BELT_SEGS = 20  # fallback_parse: lenta turi qidiriladigan bo'laklar (vergul/qator bilan ajratilgan)


def resolve(kind: str, text: str) -> tuple[str | None, list[str]]:
    """Matnni katalog nomiga moslaydi: (nom | None, nomzodlar). `conveyor.resolve` g'oyasi."""
    lst = names(kind)
    if not text or not lst:
        return None, []
    text = text[:RESOLVE_MAX]  # katalog nomi ≤ ~60 belgi; uzun matn (minglab so'z × har bir nom) — sekundlab CPU
    if text in lst:
        return text, []
    q, qt = _norm(text), tokens(text)
    if not qt:
        return None, []
    exact = [n for n in lst if _norm(n) == q]
    if len(exact) == 1:
        return exact[0], []
    head = [n for n in lst if q in (_norm(n.split("(")[0]), _norm(n.split("(")[-1].rstrip(") ")))]
    if len(head) == 1:
        return head[0], []
    # so'rov so'zlari (masalan "U13", "BLUE", "1.3") nomning siqilgan ko'rinishida bo'lishi kerak:
    # "U13" -> "U13/0A-B ..." ha, "U10FAI-T (R13)" yo'q
    words = _words(text)
    sub = [n for n in lst if words and all(w in _norm(n) for w in words)]
    if len(sub) == 1:
        return sub[0], []
    if len(sub) > 1:
        sub.sort(key=lambda n: len(tokens(n)))
        # eng qisqa nom — faqat u rang/sirt belgisisiz bo'lsa ("F21 3mm" -> oddiy F21 3mm; "U13" -> oq yoki ko'k?)
        extra = set(tokens(sub[0])) & QUALIFIERS - set(qt)
        if len(tokens(sub[0])) < len(tokens(sub[1])) and not extra:
            return sub[0], []
        return None, sub[:8]
    # qisman moslik: so'zlarning ko'pi mos va yagona eng yaxshisi
    scored = sorted(((sum(w in _norm(n) for w in words) / max(1, len(words)), n) for n in lst), key=lambda x: -x[0])
    if scored and scored[0][0] >= 0.75 and (len(scored) == 1 or scored[1][0] < scored[0][0]):
        return scored[0][1], []
    ranked = sorted(lst, key=lambda n: SequenceMatcher(None, q, _norm(n)).ratio(), reverse=True)
    return None, ranked[:6]


# ------------------------------------------------------------------ yordamchilar
def pitched(length: float, pitch: float, foot: float) -> list[float]:
    """Simple rejim: qadam bo'yicha, lenta o'rtasiga simmetrik joylar (0,1 mm)."""
    if length <= 0 or pitch <= 0:
        return []
    usable = length - max(foot, pitch / 2)
    q = usable // pitch  # juda mayda qadamda inf (int(inf) — OverflowError)
    n = max(1, min(500, int(q) + 1)) if math.isfinite(q) else 500
    first = (length - (n - 1) * pitch) / 2
    return [round(first + i * pitch, 1) for i in range(n)]


def from_first(length: float, pitch: float, first: float, foot: float) -> list[float]:
    """Birinchi profil `first` da, keyin har `pitch` da (lenta oxirigacha sig'ganicha)."""
    if length <= 0 or pitch <= 0:
        return []
    out, x = [], max(foot / 2, first)
    while x <= length - foot / 2 + 1e-9 and len(out) < 500:
        out.append(round(x, 1))
        x += pitch
    return out


def cross_foot(name: Any) -> float:
    spec = cleat_spec_for(name)
    return float(spec["B"]) if spec else 0.0


def gofro_name_for(height: float) -> str | None:
    """Balandlikka eng yaqin gofrobort materiali (40/50/60)."""
    c = catalog()["gofroProfiles"]
    if not c:
        return None
    return min(c, key=lambda p: abs((p.get("height") or 0) - height))["name"]


def public_state(s: dict[str, Any]) -> dict[str, Any]:
    """Brauzer/chatga beriladigan holat: `settings` (kurs, xizmatlar, zapas) OLIB TASHLANADI."""
    return {k: v for k, v in s.items() if k != "settings"}


# Mijozdan keladigan holat chegaralari (clean_input). Katalog nomi ≤ ~60 belgi; eng uzun haqiqiy lenta — yuzlab metr.
MAX_STR = 200  # har bir matn maydoni (mijoz nomi, manzil, ...)
MAX_ABS = 1e12  # mm / dona / so'm: bundan katta son — kiritilmagan deb olinadi (inf/NaN narx, cheksiz tsikl)
MAX_LIST = 2000  # ro'yxat uzunligi (crossPos 500 gacha ishlatiladi; ortig'i tashlanadi)
MAX_KEYS = 300  # holatdagi kalitlar soni (joriy holat ~80 ta)
LIST_KEYS = frozenset({"crossPos", "perfLines", "guideBottomPos", "guideTopPos", "crossSegs"})


def _clean_scalar(v: Any) -> tuple[bool, Any]:
    """(qabul qilinadimi, qiymat): faqat None/bool/chekli son/matn; matn MAX_STR gacha qisqaradi."""
    if v is None or isinstance(v, bool):
        return True, v
    if isinstance(v, (int, float)):
        try:
            ok = math.isfinite(v) and abs(v) <= MAX_ABS
        except OverflowError:  # ulkan butun son (10**400)
            ok = False
        return ok, v
    if isinstance(v, str):
        v = v[:MAX_STR]
        try:
            v.encode("utf-8")
        except UnicodeEncodeError:  # juftsiz surrogat — UTF-8 ga yozilmaydi (chizma raqami xeshi, saqlash)
            v = v.encode("utf-8", "ignore").decode("utf-8")
        return True, v
    return False, None


def _clean_list(v: list) -> list:
    """Sonlar ro'yxati (crossSegs — [a, b] juftlari). Yaroqsiz element None bo'ladi: revive uni o'zi rad etadi."""
    out: list[Any] = []
    for x in v[:MAX_LIST]:
        if isinstance(x, list):
            pair = [_clean_scalar(y) for y in x[:4]]
            out.append([y if ok else None for ok, y in pair] if len(x) <= 4 else None)
        else:
            ok, y = _clean_scalar(x)
            out.append(y if ok else None)
    return out


def clean_input(raw: Any) -> dict[str, Any]:
    """Mijozdan kelgan holat: faqat dict, `settings` hech qachon qabul qilinmaydi.

    Har bir qiymat chegaralanadi: matn MAX_STR gacha, son chekli va |x| ≤ MAX_ABS (aks holda maydon
    tashlanadi — revive standart qiymatni qo'yadi), ro'yxatlar faqat LIST_KEYS da va MAX_LIST gacha,
    ichma-ich dict/ro'yxat (noma'lum kalitlarda) o'tmaydi, kalitlar MAX_KEYS gacha.
    """
    if not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    for k, v in raw.items():
        if k == "settings" or not isinstance(k, str) or len(k) > 64:
            continue
        if len(out) >= MAX_KEYS:  # holatda ~80 kalit; minglab noma'lum kalit saqlangan holatni shishiradi
            break
        if isinstance(v, list):
            if k in LIST_KEYS:
                out[k] = _clean_list(v)
            continue
        ok, val = _clean_scalar(v)
        if ok:
            out[k] = val
    return out


def _num(v: Any) -> float | None:
    """Son (yoki "1,5" kabi matn) -> float; bool, NaN/inf ("nan", "1e999") va |x| > MAX_ABS — None."""
    n: float | None = None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        try:
            n = float(v)
        except OverflowError:
            return None
    elif isinstance(v, str):
        try:
            n = float(v.replace(",", ".").replace(" ", ""))
        except ValueError:
            return None
    if n is None or not math.isfinite(n) or abs(n) > MAX_ABS:
        return None
    return n


# ------------------------------------------------------------------ deterministik tahlil
# minglik bo'shliq bilan ham: "12 500", "1 200" (ilova sonlarni shunday chiqaradi) — aks holda "12 500" -> 12
# ("U13 800" — kod + son, minglik emas: minglik shakli oldida harf/raqam bo'lmasligi shart)
# takrorlar CHEGARALANGAN ({1,4}, {1,15}, {1,9}) va son o'rtasidan boshlanmaydi ((?<!\d)): aks holda uzun raqamlar
# qatorida ("000…0", " 000 000 …") har pozitsiyadan oxirigacha qayta o'qiladi — kvadratik vaqt (4000 belgi ≈ 10 s)
_NUM = (
    r"((?<![\d.,])(?<![^\W\dxXхХ_])\d{1,3}(?:[ \u00a0]\d{3}){1,4}(?!\d)(?:[.,]\d{1,9})?"
    r"|(?<!\d)\d{1,15}(?!\d)(?:[.,]\d{1,9})?)"
)
# birlikdan keyin harf kelmasin: "12000 metraj" / "mexanik" / "материал" -> metr deb o'qilmasin (uzunlik x1000)
_UNIT_WORD = r"(mm|мм|sm|см|cm|m|м|metr(?!aj)\w*|метр(?!аж)\w*)"  # "metraj/метраж" — ulanish turi, birlik emas
_UNIT = r"\s*(?:" + _UNIT_WORD + r"(?![a-zа-яё]))?"


def _numtxt(val: str) -> float:
    return float(val.replace(" ", "").replace("\u00a0", "").replace(",", "."))


def _mm(val: str, unit: str | None, *, default_m_below: float = 0) -> float:
    v = _numtxt(val)
    u = (unit or "").lower()
    if u in ("sm", "см", "cm"):
        return v * 10
    if u in ("m", "м") or u.startswith(("metr", "метр")):
        return v * 1000
    if not u and default_m_below and v < default_m_below:
        return v * 1000  # "uzunligi 5" — metr deb olinadi
    return v


def fallback_parse(text: str) -> tuple[dict[str, Any], dict[str, Any], list[str], list[str]]:
    """LLM'siz tahlil -> (patch, helpers, notes, unknown)."""
    # ketma-ket bo'shliqlar bittaga: `…{2,40}?\s+qulf` kabi qoidalar uzun bo'shliq qatorida kvadratik sekinlashadi
    # (4000 ta bo'shliq ≈ 28 s CPU); ma'no o'zgarmaydi (qoidalar `\s*`/`\s+` bilan yozilgan)
    t = " " + re.sub(r"\s{2,}", " ", (text or "").replace("\n", ", ")) + " "
    low = t.lower()
    patch: dict[str, Any] = {}
    helpers: dict[str, Any] = {}
    notes: list[str] = []
    unknown: list[str] = []
    used: list[tuple[int, int]] = []

    def take(m: re.Match) -> None:
        used.append(m.span())

    # o'lcham: 600x5000, 600 × 5 m, 600*5000 mm
    m = re.search(_NUM + r"\s*(mm|мм)?\s*[x×хX*]\s*" + _NUM + _UNIT, t, re.I)
    if m:
        patch["width"] = _mm(m.group(1), m.group(2) or "mm")
        patch["length"] = _mm(m.group(3), m.group(4) or (m.group(2) or ""), default_m_below=100)
        take(m)
    m = re.search(r"(?:\beni\b|\bен\w*|ширин\w*|\bwidth\b)\s*[:=-]?\s*" + _NUM + _UNIT, low)
    if m:
        patch["width"] = _mm(m.group(1), m.group(2) or "mm")
        take(m)
    m = re.search(r"(?:uzunlig\w*|\buzun\w*|длин\w*|\blength\b)\s*[:=-]?\s*" + _NUM + _UNIT, low)
    if m:
        patch["length"] = _mm(m.group(1), m.group(2), default_m_below=100)
        take(m)

    # ulanish
    if re.search(r"metraj|метраж|ulanmaydi|без соедин", low):
        patch.update(lockOn=True, joinMethod="meter")
    elif re.search(r"payvand|ulab ber|сварк|спай|стыков|vulkan", low):
        patch.update(lockOn=True, joinMethod="weld")
        if "zinal" in low or "ступен" in low:
            patch["weldType"] = "zinali"
        elif re.search(r"60\s*°|60 gradus|60 град", low):
            patch["weldType"] = "60"
    m = re.search(
        r"([A-Za-zА-Яа-я0-9\-/ .]{2,40}?)\s+(?:qulf|замок|zamok)\b|(?:qulf|замок|zamok)\w*\s*[:\-]?\s*([A-Za-z][A-Za-z0-9\-/ ]{1,30})",
        t,
        re.I,
    )
    if m:
        cand = (m.group(1) or m.group(2) or "").strip(" ,.")
        hit, cands = resolve("lock", cand) if re.search(r"\d", cand) else (None, [])
        patch.update(lockOn=True)
        patch.setdefault("joinMethod", "lock")
        if hit:
            patch["lockName"] = hit
        elif not re.search(r"\d", cand):
            unknown.append("Qaysi qulf qo'yilsin?")
        else:
            unknown.append(f"Qulf '{cand}' aniq topilmadi" + (f" — nomzodlar: {'; '.join(cands[:4])}" if cands else ""))
        take(m)
        q = re.search(r"qulf\w*\s*" + _NUM + r"\s*(?:ta|dona|шт)", low)
        if q:
            patch["lockQty"] = _numtxt(q.group(1))

    # yo'naltiruvchi: "ostidan 2 ta K10", "ustidan 1 ta K13"
    for side, pat in (("Bottom", r"(?:ostidan|ostiga|pastidan|снизу)"), ("Top", r"(?:ustidan|ustiga|сверху)")):
        m = re.search(
            pat
            + r"\s*(\d+)?\s*(?:ta|dona|шт)?\s*([A-Za-zА-Яа-я]{1,4}\s?-?\d{1,2}[A-Za-z\- ]{0,12}?)?(?=[,;.]|\s+(?:yo|направ|profil)|\s*$)",
            t,
            re.I,
        )
        if not m:
            continue
        patch["guideOn"] = True
        patch[f"guide{side}On"] = True
        if side == "Top" and "guideBottomOn" not in patch:
            patch["guideBottomOn"] = False
        if m.group(1):
            patch[f"guide{side}Qty"] = float(m.group(1))
        if m.group(2):
            hit, cands = resolve("guide", m.group(2).strip())
            if hit:
                patch["guideName"] = hit
            else:
                unknown.append(
                    f"Yo'naltiruvchi profil '{m.group(2).strip()}' aniq topilmadi"
                    + (f" — nomzodlar: {'; '.join(cands[:4])}" if cands else "")
                )
        take(m)

    # ko'ndalang profil: "har 300 mm da L50 profil", "L50 profil 16 ta"
    m = re.search(
        r"([A-Za-zА-Яа-я]{1,2}\s?\(?\d?\)?\s?-?\d{2}[A-Za-z\-]*)\s*(?:ko['ʻ’]?ndalang\s*)?(?:profil|профил)\w*", t, re.I
    )
    if (m and not re.match(r"[KКkк]\s?\d", m.group(1))) or (m and "ko'ndalang" in low):
        hit, cands = resolve("cross", m.group(1))
        patch["crossOn"] = True
        if hit:
            patch["crossName"] = hit
        else:
            unknown.append(
                f"Ko'ndalang profil '{m.group(1)}' aniq topilmadi"
                + (f" — nomzodlar: {'; '.join(cands[:4])}" if cands else "")
            )
        take(m)
    # qadam metrda ham bo'lishi mumkin: "har 1 m da", "har 0,5 metrda" (avval 1 mm deb olinardi)
    pu = r"\s*(?:" + _UNIT_WORD + r"(?![a-zа-яё])|(mm|мм|sm|см)(?=da|dan))?"
    p = re.search(r"har\s*" + _NUM + pu + r"\s*(?:da|dan)?|(?:шаг|каждые)\s*" + _NUM + pu + r"|qadam\w*\s*" + _NUM, low)
    if p and patch.get("crossOn"):
        g = [x for x in p.groups()]
        val, unit = (g[0], g[1] or g[2]) if g[0] else (g[3], g[4] or g[5]) if g[3] else (g[6], "mm")
        helpers["crossPitch"] = _mm(val, unit or "mm")
    q = re.search(
        r"profil\w*\s*" + _NUM + r"\s*(?:ta|dona|шт)|" + _NUM + r"\s*(?:ta|dona|шт)\s*(?:ko['ʻ’]?ndalang|profil)", low
    )
    if q and patch.get("crossOn"):
        helpers["crossCount"] = _numtxt(q.group(1) or q.group(2))

    # gofrobort: "ikki chetiga 50 mm gofra", "борт 60"
    m = re.search(
        r"(?:(ikki|bitta|bir|1|2)\s*(?:chet\w*|tomon\w*)\s*)?"
        + _NUM
        + r"?\s*(?:mm|мм)?\s*(?:li\s*)?(?:gofr|гофр|борт|bort)",
        low,
    )
    if m:
        patch["gofroOn"] = True
        before = m.group(2) and not any(a <= m.start(2) < b for a, b in used) and 20 <= _numtxt(m.group(2)) <= 500
        if before:  # "50 mm gofra" (oldingi son o'lcham/uzunlikka tegishli bo'lmasa: "800x12000 борт 60" -> 12000 emas)
            patch["gofroHeight"] = _numtxt(m.group(2))
        else:  # son kalit so'zdan KEYIN: "борт 60", "gofra 80 mm", "гофроборт высотой 80 мм"
            h = re.search(
                r"(?:gofr\w*|гофр\w*|борт\w*|bort\w*)\D{0,15}?(\d+(?:[.,]\d+)?)\s*(?:mm|мм)?"
                r"(?!\s*(?:ta\b|tomon|chet|сторон|шт|dona))",
                low[m.start() :],
            )
            if h and 20 <= _numtxt(h.group(1)) <= 500:  # 1-2 — tomonlar soni, balandlik emas
                patch["gofroHeight"] = _numtxt(h.group(1))
        if m.group(1):
            patch["gofroQty"] = 1 if m.group(1) in ("bitta", "bir", "1") else 2
        take(m)
    elif re.search(r"gofr|гофр", low):
        patch["gofroOn"] = True

    # perforatsiya: "Ø12 teshik 60 ta", "teshik d=8 100 ta"
    m = re.search(
        r"(?:ø|⌀|d\s*=?|diametr\w*|диам\w*)\s*"
        + _NUM
        + r"\s*(?:mm|мм)?\s*(?:li\s*)?(?:teshik|отверст|perf)\w*\s*(?:"
        + _NUM
        + r"\s*(?:ta|dona|шт))?",
        low,
    )
    if not m:
        m = re.search(
            r"(?:teshik|отверст|perforats|перфор)\w*\s*(?:ø|⌀|d\s*=?)?\s*"
            + _NUM
            + r"\s*(?:mm|мм)\s*(?:"
            + _NUM
            + r"\s*(?:ta|dona|шт))?",
            low,
        )
    if m:
        patch.update(perfOn=True, perfGrid=False, perfDia=_numtxt(m.group(1)))
        if m.group(2):
            patch["perfQty"] = _numtxt(m.group(2))
        take(m)
    elif re.search(r"teshik|перфор|отверст", low):
        patch["perfOn"] = True
        unknown.append("Teshik diametri va soni?")

    # mijoz
    m = re.search(r"(?:mijoz|buyurtmachi|заказчик|клиент|kompaniya|firma)\s*[:\-]?\s*([^,;\n]{2,60})", t, re.I)
    if m:
        patch["projectName"] = m.group(1).strip(" .")
        take(m)
    m = re.search(r"(\+?998[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})", t)
    if m:
        patch["customerPhone"] = m.group(1)

    # lenta turi — boshqa qoidalarga tushmagan bo'laklardan
    rest = list(t)
    for a, b in used:
        for i in range(a, min(b, len(rest))):
            rest[i] = " "
    segs = [s.strip() for s in re.split(r"(?<!\d),|,(?!\d)|[;\n]", "".join(rest)) if s.strip()]
    belt_found = False
    for seg in segs[:MAX_BELT_SEGS]:  # har bo'lak butun katalog bilan solishtiriladi (~50 ms) — soni chegaralangan
        seg2 = re.sub(r"(?:lenta|лента|konveyer\w*|конвейер\w*|tasma)\s*", " ", seg, flags=re.I).strip()
        if not seg2 or not re.search(r"[A-Za-zА-Яа-я]", seg2) or not re.search(r"\d|[A-Z]{2}", seg2):
            continue
        hit, cands = resolve("belt", seg2)
        if hit:
            patch["beltName"] = hit
            belt_found = True
            break
        if cands and any(SequenceMatcher(None, _norm(seg2), _norm(c)).ratio() > 0.5 for c in cands[:3]):
            unknown.append(f"Lenta turi '{seg2}' aniq emas — qaysi biri: {'; '.join(cands[:5])}?")
            belt_found = True
            break
    notes.append("Matn qoidalar bo'yicha tahlil qilindi (AI ishlatilmadi).")
    return patch, helpers, notes, unknown


# ------------------------------------------------------------------ LLM
def _schema_text() -> str:
    return """Maydonlar (barcha uzunliklar mm, burchak gradus):
- beltName (lenta turi — FAQAT ro'yxatdagi nom), width (eni), length (uzunligi; halqa bo'lsa aylana uzunligi)
- bendAngle (0 — to'g'ri; >0 — bukilgan halqa bo'lagi; "povorotnaya/поворотная/burilish/egilgan/bukilgan lenta N°" = bendAngle N, bu ULANISH usuli EMAS), curveHoleCount/curveHoleDia/curveHoleEdge/curveHoleRows (bukilgan lenta teshiklari)
- lockOn (ulanish bormi), joinMethod: "lock" (mexanik qulf) | "meter" (metraj, ulanmaydi) | "install" (qulf + o'rnatib berish) | "weld" (payvand/ulab berish)
- lockName (qulf — ro'yxatdan), lockQty (qulf soni, odatda 2 — ikki uchi), weldType: "zinali" | "oddiy" | "60"
- lockToolOn, lockToolName, lockToolQty (qulf asbobi)
- guideOn (yo'naltiruvchi), guideName (ro'yxatdan, ikkala tomonga umumiy), guideBottomOn + guideBottomQty + guideBottomInset (ostidan; inset — chetdan profil markazigacha), guideTopOn + guideTopQty + guideTopInset (ustidan)
- YAKKA (1 dona) yo'naltiruvchi markazda bo'lmasa: guideBottomAt / guideTopAt — CHAP chetdan profil o'qigacha mm; o'ng chetdan aytilsa ("o'ngdan 25 mm", "o'ng tomondan 25") — guideBottomFromRight / guideTopFromRight = 25 (ayirmani o'zing qilma). "Markazda" bo'lsa bu maydonlarni berma
- crossOn (ko'ndalang profil), crossName (ro'yxatdan), crossLen (bitta profil uzunligi) yoki crossLenAuto=true (eni bo'yicha maksimal), crossParts (bo'laklar 1..6), crossGap (bo'laklar tirqishi)
- gofroOn (gofrobort), gofroHeight (balandligi), gofroQty (1 yoki 2 — chetlar soni), gofroSide ("left"|"right", qty=1 da), gofroInsetL/gofroInsetR (chetdan gofragacha, kamida 10)
- perfOn (perforatsiya/teshiklar), perfDia (teshik diametri), perfQty (teshiklar soni), perfStagger (shaxmat), perfEdge (chetdan, 0 — avto)
- projectName (mijoz/loyiha nomi), customerPhone, customerAddress, author
Ko'ndalang profillar joyi uchun "cross" obyekti: {"pitch": qadam mm, "first": birinchisi lenta boshidan mm (ixtiyoriy), "count": soni (ixtiyoriy)}."""


def _prompt(text: str, base: dict[str, Any] | None, lang: str) -> str:
    def lst(kind: str) -> str:
        return "\n".join(f"  - {n}" for n in names(kind))

    belts = "\n".join(
        f"  - {b['name']}"
        + (f" ({b['note']})" if b.get("note") else "")
        + (f" [{b['thickness']} mm]" if b.get("thickness") else "")
        for b in catalog()["belts"]
    )
    cur = ""
    if base:
        cur = "\nJORIY HOLAT (matn shuni o'zgartiradi/to'ldiradi):\n" + json.dumps(
            {k: base[k] for k in FORM_FIELDS if k in base}, ensure_ascii=False
        )
    return f"""Konveyer lentasi zakazini (o'zbek yoki rus tilida) chizma dasturi holatiga aylantir.

{_schema_text()}

RUXSAT ETILGAN NOMLAR (nomni AYNAN shu ro'yxatdan ko'chir; aniq mos kelmasa — o'sha maydonni yozma va unknown'ga savol qo'sh):
Lenta turlari:
{belts}
Qulflar:
{lst("lock")}
Qulf asboblari:
{lst("tool")}
Yo'naltiruvchi profillar:
{lst("guide")}
Ko'ndalang profillar:
{lst("cross")}
Gofrobort:
{lst("gofro")}

Qoidalar:
- Faqat matnda aytilgan narsalarni yoz; aytilmaganini o'zingdan to'qima. Metrda berilgan uzunlikni mm ga o'tkaz (5 m = 5000).
- "ko'k"=blue, "oq"=white, "yashil"=green, "vafli"=VAFLI. "K10" — "Профиль К 10" (kirill К). "L50" — "Профиль L 50".
- "ostidan 2 ta K10" -> guideOn=true, guideBottomOn=true, guideBottomQty=2, guideName="Профиль К 10".
- "har 300 mm da L50 profil" -> crossOn=true, crossName="Профиль L 50", crossLenAuto=true, cross.pitch=300.
- "ikki chetiga 50 mm gofra" -> gofroOn=true, gofroQty=2, gofroHeight=50.
- "Ø12 teshik 60 ta" -> perfOn=true, perfDia=12, perfQty=60.
- "MR01 qulf" -> lockOn=true, joinMethod="lock", lockName ro'yxatdagi MR01 nomi.
- Lenta turi, eni yoki uzunligi aniqlanmasa — unknown'ga qisqa savol yoz.
- notes — nimani tushunganing va qaysi taxminni qilganing (qisqa, {"rus" if lang == "ru" else "o'zbek"} tilida); unknown — yetishmayotgan ma'lumot bo'yicha savollar.
{cur}

ZAKAZ MATNI:
\"\"\"{text}\"\"\"

Javob — FAQAT JSON (boshqa matnsiz):
{{"fields": {{...}}, "cross": {{"pitch": null, "first": null, "count": null}}, "notes": ["..."], "unknown": ["..."]}}"""


async def ask_llm(prompt: str) -> str:
    """Claude (Max obuna) — vositalarsiz, bitta javob. JARVIS_LLM=echo (testlar) — LLM yo'q, qoidalar ishlaydi."""
    from django.conf import settings

    if getattr(settings, "JARVIS_LLM", "claude") != "claude":
        raise RuntimeError("LLM o'chirilgan (JARVIS_LLM)")
    from claude_agent_sdk import (
        AssistantMessage,
        ClaudeAgentOptions,
        ResultMessage,
        TextBlock,
        query,
    )

    if os.getenv("JARVIS_USE_MAX", "1") == "1":
        os.environ.pop("ANTHROPIC_API_KEY", None)
    opts = ClaudeAgentOptions(
        model=MODEL,
        tools=[],
        allowed_tools=[],
        setting_sources=[],
        max_turns=1,
        system_prompt="Sen konveyer lenta zakazlarini JSON'ga aylantiruvchi yordamchisan. "
        "Faqat so'ralgan JSON'ni qaytar.",
        cwd=os.path.expanduser("~"),
        strict_mcp_config=True,
        env={"ENABLE_CLAUDEAI_MCP_SERVERS": "false"},
    )
    out, parts = "", []
    async for msg in query(prompt=prompt, options=opts):
        if isinstance(msg, AssistantMessage):
            parts += [b.text for b in msg.content if isinstance(b, TextBlock)]
        elif isinstance(msg, ResultMessage):
            out = msg.result or ""
            from asgiref.sync import sync_to_async

            from config.apps.audit import services as audit

            usage = {k: v for k, v in (msg.usage or {}).items() if isinstance(v, (int, float))}
            await sync_to_async(audit.log)(
                "lenta_llm",
                None,
                None,
                detail={"purpose": "lenta_parse", "prompt_chars": len(prompt), "is_error": bool(msg.is_error), **usage},
                cost=float(msg.total_cost_usd or 0),
            )
    return out or "".join(parts)


def _json_of(text: str) -> dict[str, Any] | None:
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        return None
    try:
        d = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    return d if isinstance(d, dict) else None


def _coerce_fields(raw: Any, unknown: list[str]) -> dict[str, Any]:
    """LLM maydonlari: faqat ruxsat etilganlar, tur tekshiruvi, nomlar katalogga moslanadi."""
    out: dict[str, Any] = {}
    if not isinstance(raw, dict):
        return out
    for k, v in raw.items():
        typ = FORM_FIELDS.get(k)
        if not typ or v is None:
            continue
        if typ == "num":
            n = _num(v)
            if n is not None and n >= 0:
                out[k] = n
        elif typ == "bool":
            if isinstance(v, bool):
                out[k] = v
        elif isinstance(v, str) and v.strip():
            if k in NAME_KIND:
                hit, cands = resolve(NAME_KIND[k], v.strip())
                if hit:
                    out[k] = hit
                else:
                    unknown.append(
                        f"{KIND_LABEL[NAME_KIND[k]].capitalize()} '{v.strip()}' katalogda topilmadi"
                        + (f" — nomzodlar: {'; '.join(cands[:4])}" if cands else "")
                    )
            else:
                out[k] = v.strip()[:200]
    return out


# ------------------------------------------------------------------ birlashtirish
def merge(
    base: dict[str, Any], patch: dict[str, Any], helpers: dict[str, Any], notes: list[str], unknown: list[str]
) -> dict[str, Any]:
    """patch'ni holatga qo'shadi va bog'liq maydonlarni (profillar joyi, gofra nomi) to'ldiradi."""
    s = {**base, **patch}
    if patch.get("lockOn") and "joinMethod" not in patch and "joinMethod" not in base:
        s["joinMethod"] = "lock"
    if patch.get("guideOn"):
        if not patch.get("guideBottomOn") and not patch.get("guideTopOn") and "guideBottomOn" not in patch:
            s["guideBottomOn"] = True
        for k in ("guideBottomPos", "guideBottomAt", "guideTopPos", "guideTopAt"):
            if k not in patch:  # shu xabarda berilgan joy o'chirilmasin
                s[k] = None
    if "gofroHeight" in patch:
        h = max(float(SIDEWALL_SPEC["minHeight"]), float(patch["gofroHeight"]))
        s["gofroHeight"] = h
        if "gofroName" not in patch:
            nm = gofro_name_for(h)
            if nm:
                s["gofroName"] = nm
    # yakka yo'naltiruvchi: o'ng chetdan -> chap chetdan (At); joy berilsa — o'sha tomon 1 dona yoqiladi
    w_now = float(_num(s.get("width")) or 0)
    for side in ("Bottom", "Top"):
        # mijoz holatidan ham kelishi mumkin (noma'lum kalit, matn/"12,5") — faqat chekli son
        fr = _num(s.pop(f"guide{side}FromRight", None))
        if fr is not None:
            if w_now > 0:
                s[f"guide{side}At"] = max(0.0, w_now - float(fr))
                notes.append(
                    f"Yo'naltiruvchi ({'ostidan' if side == 'Bottom' else 'ustidan'}) o'ng chetdan "
                    f"{float(fr):g} mm — chap chetdan {w_now - float(fr):g} mm."
                )
            else:
                unknown.append("Yo'naltiruvchi o'ng chetdan berildi, lekin lenta eni noma'lum — eni necha mm?")
        if s.get(f"guide{side}At") is not None and (fr is not None or f"guide{side}At" in patch):
            s["guideOn"] = True
            s[f"guide{side}On"] = True
            if f"guide{side}Qty" not in patch:
                s[f"guide{side}Qty"] = 1
    if patch.get("gofroOn") and "gofroQty" not in patch and not base.get("gofroOn"):
        s["gofroQty"] = 2
    length = float(_num(s.get("length")) or 0)
    if s.get("crossOn"):
        foot = cross_foot(s.get("crossName"))
        pitch = _num(helpers.get("crossPitch"))
        first = _num(helpers.get("crossFirst"))
        count = _num(helpers.get("crossCount"))
        if "crossLen" not in patch and "crossLenAuto" not in patch and patch.get("crossOn"):
            s["crossLenAuto"] = True
        if patch.get("crossOn") or pitch or count or "length" in patch:
            s["crossSegs"] = None
            if pitch and pitch > 0:
                s["crossPos"] = (
                    from_first(length, pitch, first, foot) if first is not None else pitched(length, pitch, foot)
                )
            elif count and count > 0:
                s["crossPos"] = even_positions(length, count)
            elif patch.get("crossOn") and not base.get("crossPos"):
                s["crossPos"] = pitched(length, 300, foot)
                if length > 0:
                    notes.append("Ko'ndalang profil qadami aytilmadi — 300 mm deb olindi.")
            elif "length" in patch and base.get("crossPos") and len(base["crossPos"]) >= 2:
                xs = base["crossPos"]
                s["crossPos"] = pitched(length, (xs[-1] - xs[0]) / (len(xs) - 1) or 300, foot)
        if length <= 0:
            s["crossPos"] = []
    return s


def essentials(provided: dict[str, Any], s: dict[str, Any], base_has_belt: bool) -> list[str]:
    q = []
    if "beltName" not in provided and not base_has_belt:
        q.append("Lenta turi qanday? (masalan: U13 ko'k 1,3 mm, F21 3 mm)")
    if not (float(_num(s.get("width")) or 0) > 0):
        q.append("Lenta eni necha mm?")
    if not (float(_num(s.get("length")) or 0) > 0):
        q.append("Lenta uzunligi necha mm (halqa bo'lsa aylana uzunligi)?")
    return q


async def parse_order(text: str, state: Any = None, lang: str = "uz", *, use_llm: bool = True) -> dict[str, Any]:
    """Matn -> {state, notes, unknown, source, provided}."""
    text = (text or "").strip()[:4000]
    given = clean_input(state) if state else {}
    base = public_state(revive(given)) if given else public_state(initial_state())
    base_has_belt = bool(given.get("beltName"))
    notes: list[str] = []
    unknown: list[str] = []
    patch: dict[str, Any] = {}
    helpers: dict[str, Any] = {}
    source = "fallback"
    if use_llm and text:
        try:
            raw = await asyncio.wait_for(ask_llm(_prompt(text, base if given else None, lang)), LLM_TIMEOUT)
            d = _json_of(raw)
            if d is None:
                raise ValueError("LLM JSON qaytarmadi")
            patch = _coerce_fields(d.get("fields"), unknown)
            cr = d.get("cross") if isinstance(d.get("cross"), dict) else {}
            helpers = {
                "crossPitch": _num(cr.get("pitch")),
                "crossFirst": _num(cr.get("first")),
                "crossCount": _num(cr.get("count")),
            }
            notes += [str(x)[:300] for x in (d.get("notes") or []) if x][:12]
            unknown += [str(x)[:300] for x in (d.get("unknown") or []) if x][:12]
            source = "llm"
        except Exception as exc:
            log.warning("Lenta LLM tahlili ishlamadi: %s", exc)
            patch, helpers, notes, unknown = {}, {}, [], []
    if source == "fallback" and text:
        # sinxron regex tahlil — event loop'ni band qilmasin
        patch, helpers, notes, unknown = await asyncio.to_thread(fallback_parse, text)
    if text:  # LLM yoki qoidalar o'tkazib yuborgan bo'lsa ham — aniq iboralar
        b = bend_from_text(text)
        if b and not patch.get("bendAngle"):
            patch["bendAngle"] = b
            notes.append(f"Burilish (povorotnaya) lenta: {b:g}° deb olindi.")
        e = perf_edge_from_text(text)
        if e is not None and not patch.get("perfEdge"):
            patch["perfEdge"] = e
    if text and "beltName" not in patch and not base_has_belt:
        # rang/izoh so'zi qidiruvni chalg'itsa ham, matndagi aniq katalog kodi (U10, P 9/A, F21...) yagona bo'lsa — shu
        hit = belt_by_code(text)
        if hit:
            patch["beltName"] = hit
            notes.append(f"Lenta turi matndagi kod bo'yicha olindi: {hit.strip()} — rangi/qalinligini tekshiring.")
            unknown = [q for q in unknown if not q.lower().startswith("lenta turi")]
    merged = merge(base, patch, helpers, notes, unknown)
    s = revive(merged)
    unknown = list(dict.fromkeys(unknown + [q for q in essentials(patch, s, base_has_belt) if q not in unknown]))
    belt_missing = "beltName" not in patch and not base_has_belt
    if belt_missing:
        notes.insert(
            0,
            f"DIQQAT: lenta turi aniqlanmadi — chizmada vaqtincha standart tur ({s['beltName'].strip()}) "
            "ko'rsatilmoqda. Ro'yxatdan tanlang.",
        )
    return {
        "state": public_state(s),
        "notes": list(dict.fromkeys(notes)),
        "unknown": unknown,
        "source": source,
        "provided": sorted(patch),
        "belt_missing": belt_missing,
    }


_BEND_RE = re.compile(
    r"(povorot\w*|поворот\w*|burilish\w*|burilgan|egilgan|egil\w*|bukilgan|bukil\w*|изогнут\w*|radius\w*)"
    r"[^\d]{0,25}(\d{2,3})\s*(?:°|º|gradus\w*|град\w*|deg)"
    r"|(\d{2,3})\s*(?:°|º|gradus\w*|град\w*)[^\d]{0,25}(povorot\w*|поворот\w*|burilish\w*|egil\w*|bukil\w*)",
    re.I,
)
_EDGE_RE = re.compile(r"(?:chetdan|четдан|от края|от кромки)\s*(\d{1,3}(?:[.,]\d)?)\s*(?:mm|мм)?", re.I)


def bend_from_text(text: str) -> float | None:
    """'Povorotnaya lenta 180°', 'поворотная 90 град', '180 gradusga egilgan' → burchak (1–360)."""
    m = _BEND_RE.search(text or "")
    if not m:
        return None
    v = float(m.group(2) or m.group(3))
    return v if 0 < v <= 360 else None


def perf_edge_from_text(text: str) -> float | None:
    """Teshiklar haqida gapda 'chetdan 10 mm' → perfEdge (teshik/perforatsiya so'zi bo'lsa)."""
    low = (text or "").lower()
    if not re.search(r"teshik|perfor|отверст|перфор|ø|⌀", low):
        return None
    m = _EDGE_RE.search(text or "")
    return _num(m.group(1)) if m else None


_CODE_RE = re.compile(r"(?<![A-Za-zА-Яа-я0-9])([A-Za-z]{1,4}\s?\d{1,3}(?:\s?/\s?[A-Za-z0-9]{1,4})*)(?![A-Za-z0-9])")


def belt_by_code(text: str) -> str | None:
    """Matndagi kodlar (U10, P 9/A, F21, L 10/M) katalogdagi lenta kodiga (qavsgacha qism yoki qavs ichidagi eski
    nom) aynan teng bo'lsa va moslik yagona bo'lsa — shu nom."""
    codes = {_norm(m) for m in _CODE_RE.findall(text or "")}
    codes.discard("")
    if not codes:
        return None
    hits = []
    for n in names("belt"):
        head = _norm(n.split("(")[0])
        alias = _norm(n.split("(")[1].split(")")[0]) if "(" in n else ""
        alias_head = _norm(re.split(r"\s-\s|\s", n.split("(")[1], maxsplit=1)[0]) if "(" in n else ""
        if head in codes or (alias and alias in codes) or (alias_head and alias_head in codes and len(alias_head) >= 3):
            hits.append(n)
    hits = list(dict.fromkeys(hits))
    # aniq bosh kod bo'yicha yagona moslik ustun
    exact = [n for n in hits if _norm(n.split("(")[0]) in codes]
    if len(exact) == 1:
        return exact[0]
    return hits[0] if len(hits) == 1 else None
