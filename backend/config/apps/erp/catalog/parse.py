"""Tovar nomidan texnik oila va ko'rsatkichlarni ajratish (1C nomlari: `1040 HTD 8M NOVOBELT`, `SPB-2650 Lp PIX`,
`PV BELT 6 PJ 1780 MEGADYNE`, `Рукав 1690 D5M ширина: 215мм`, `MEGAPOWER2 BELT 30 АT10 610 STEEL CORD`…).

`parse(name, hint)` → `Parsed` yoki None (tanilmadi). `hint` — 1C guruhi/kategoriyasi matni (konveyer, yassi remen,
profil… — bu oilalarda seriya kodi nomning o'zi). Natija `specs.clean` dan o'tkaziladi (standart tekshiruvi).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from . import specs as S

BRANDS = {
    "NB": "NOVOBELT",
    "NOVOBELT": "NOVOBELT",
    "MEGADYNE": "MEGADYNE",
    "MEGADAYNE": "MEGADYNE",
    "CNFULO": "CNFULO",
    "PIX": "PIX",
    "ONL": "ONL",
    "DYNABELT": "DYNABELT",
    "BANDO": "BANDO",
    "MITSUBOSHI": "MITSUBOSHI",
    "ELATECH": "ELATECH",
    "DAYCO": "DAYCO",
    "BELTPLUS": "BELTPLUS",
    "GRADIN": "GRADIN",
    "REXBELT": "REXBELT",
    "PIRELLI": "PIRELLI",
    "LINATEX": "LINATEX",
    "POGGI": "POGGI",
    "OPTIBELT": "OPTIBELT",
    "GATES": "GATES",
    "CONTITECH": "CONTITECH",
    "ISOFLEX": "ISOFLEX",
    "NITTA": "NITTA",
    "HABASIT": "HABASIT",
    "SIEGLING": "SIEGLING",
    "AMMERAAL": "AMMERAAL",
    "FLEXCO": "FLEXCO",
}
# kirill harflar lotin kodlarda (1C'da aralash yozilgan: «АT10», «НTD»)
_CYR = str.maketrans("АВЕКМНОРСТХаеорсх", "ABEKMHOPCTXaeopcx")
NOISE = re.compile(r"\b(нал|nal)\b\.?", re.I)
WIDTH_RU = re.compile(r"ширин[аы]?\s*:?\s*(\d+(?:[.,]\d+)?)\s*(?:мм|mm)?", re.I)
WIDTH_MM = re.compile(r"\b(\d{1,3}(?:[.,]\d+)?)\s*(?:мм|mm)\b", re.I)
SUFFIX = re.compile(r"\s*-\s*(?:M|М)(?:/NB)?\s*$|\s*\((?:dona|m|m2)\)\s*$", re.I)


@dataclass
class Parsed:
    family: str
    spec: dict[str, Any]
    brand: str = ""
    series: str = ""
    notes: list[str] = field(default_factory=list)
    width: float | None = None  # nomdagi eni (rukav — «ширина: 450мм»): spec'da emas, variant sifatida


_LOOK = set("АВЕКМНОРСТХаеорсх")


def _tok(t: str) -> str:
    """Kod ko'rinishidagi so'z (kirill harflari faqat lotinga o'xshashlari, ≤ 6 belgi yoki raqam/lotin aralash) —
    lotinga: «АT10» → «AT10», «АА» → «AA»; ruscha so'z («Рукав», «Звездочка») — o'zgarmaydi."""
    cyr = [c for c in t if "\u0400" <= c <= "\u04ff"]
    if (
        cyr
        and all(c in _LOOK for c in cyr)
        and (len(t) <= 6 or any(c.isdigit() or (c.isascii() and c.isalpha()) for c in t))
    ):
        return t.translate(_CYR)
    return t


def _norm(name: str) -> str:
    s = NOISE.sub(" ", " ".join(_tok(t) for t in name.split()))
    s = SUFFIX.sub("", s)
    return " ".join(s.split())


def _brand(tokens: list[str]) -> tuple[str, list[str]]:
    for i, t in enumerate(tokens):
        b = BRANDS.get(t.upper().strip(",."))
        if b:
            return b, tokens[:i] + tokens[i + 1 :]
    for t in tokens:  # «RTS-MEGADYNE», «MEGADYNE/NB» — brend qo'shma so'z ichida (seriyada qoladi)
        for part in re.split(r"[-/]", t.upper()):
            if part in BRANDS and part != "NB":
                return BRANDS[part], tokens
    return "", tokens


def brand_of(name: str) -> str:
    """Nomdagi brend (bo'lmasa — "")."""
    return _brand(name.translate(_CYR).replace("'", " ").split())[0]


def _n(t: str) -> float | None:
    try:
        return float(t.replace(",", "."))
    except ValueError:
        return None


def _timing_profile(s: str) -> tuple[str, str] | None:
    """Matndan tishli profil → (kalit, qolgan matn)."""
    u = s.upper()
    pats: list[tuple[str, str]] = [
        (r"\bRPP\s?(\d{1,2})\s?DD\b", "DRPP{0}"),
        (r"\bD\s?RPP\s?(\d{1,2})\b", "DRPP{0}"),
        (r"\bRPP\s?(\d{1,2})\b", "RPP{0}"),
        (r"\b(?:HTD|STS|STD)?[\s-]*DS\s?(\d{1,2})M\b", "DS{0}M"),
        (r"\b(?:HTD[\s-]*)?(?:DH\s+|D)(\d{1,2})M\b", "D{0}M"),
        (r"\b(?:STS|STD)\s*S?(\d{1,2})M?\b", "S{0}M"),
        (r"\bS\s?(\d{1,2}(?:\.5)?)M\b", "S{0}M"),
        (r"\bSLV\s?(\d{1,2})\b", "SLV{0}"),
        (r"\b(\d{1,2})\s?MGT\b", "{0}MGT"),
        (r"\b(\d{1,2})\s?GTR\b", "{0}GTR"),
        (r"\bHTD[\s-]*(\d{1,2})M\b", "{0}M"),
        (r"\b(\d{1,2})M\b", "{0}M"),
        (r"\b(AT\d{1,2}|DT\d{1,2}|TT5|T2[.,]5|T\d{1,2})\b", "{0}"),
        (r"\b(MXL|XXL|XXH|XH|DXL|DL|DH|XL|L|H)\b", "{0}"),
    ]
    for pat, fmt in pats:
        m = re.search(pat, u)
        if not m:
            continue
        key = fmt.format(m.group(1).replace(",", "."))
        if key in S.TIMING:
            return key, (u[: m.start()] + " " + u[m.end() :]).strip()
    return None


def _timing(s: str, sleeve: bool) -> Parsed | None:
    width = None
    lw = re.search(
        r"\b(\d{2,5}(?:[.,]\d+)?)\s*[*XХ]\s*(\d{1,3})\s*MM\b", s.upper()
    )  # PU: 1100*50 MM (uzunlik mm × eni)
    if lw:
        s = s[: lw.start()] + " " + s[lw.end() :]
        width = _n(lw.group(2))
    elif (m := WIDTH_RU.search(s)) or (m := WIDTH_MM.search(s)):
        width = _n(m.group(1))
        s = s[: m.start()] + s[m.end() :]
    pu = bool(re.search(r"\bPU\b", s, re.I))
    steel = bool(re.search(r"\bSTEEL\b", s, re.I))
    s = re.sub(r"\b(PU|BELT|CORD|STEEL|OPEN|END|РУКАВ|ЗУБЧАТЫЙ|РЕМЕНЬ)\b", " ", s, flags=re.I)
    gt = re.match(r"^\s*(\d{1,2})GTR-(\d{3,5})-(\d{1,3})MM\b", s.upper())
    if gt:
        return Parsed("timing", {"profile": f"{gt.group(1)}GTR", "length": gt.group(2), "width": gt.group(3)})
    tp = _timing_profile(s)
    if tp is None:
        return None
    prof, rest = tp
    toks = rest.replace("-", " ").split()
    brand, toks = _brand(toks)
    nums = [(i, _n(t)) for i, t in enumerate(toks) if _n(t) is not None]
    length = None
    others = []
    for _, v in nums:
        if v is None:
            continue
        if length is None and v >= 60:
            length = v
        else:
            others.append(v)
    if lw:
        mm = _n(lw.group(1)) or 0
        length = round(mm / 2.54, 1) if S.TIMING[prof][1] == "inch" else mm  # dyuymli — belgi 0,1″ da
    if length is None:
        if not pu:  # PU rulon (ochiq) — uzunliksiz
            return None
        return Parsed(
            "timing",
            {"profile": prof, "material": "pu", "build": "open", "cord": "steel" if steel else None},
            brand,
            " ".join(t for t in toks if _n(t) is None),
        )
    if width is None and others and not sleeve:
        w = others[0]
        width = w if 3 <= w <= 300 else None
    words = [t for t in toks if _n(t) is None]
    spec: dict[str, Any] = {"profile": prof, "length": length}
    if width and not sleeve:
        spec["width"] = width
    if pu:
        spec["material"] = "pu"
    if steel:
        spec["cord"] = "steel"
    return Parsed("sleeve" if sleeve else "timing", spec, brand, " ".join(words), width=width)


def _vbelt(s: str) -> Parsed | None:
    u = s.upper()
    m = re.search(
        r"\b(SP[ZABC]|XP[ZABC]|3VX|5VX|3V|5V|8V|ZX|AX|BX|CX|AA|BB|CC|[YZABCDE])\s*[-\s]?\s*(\d{3,5})(?:\s*(LI|LD|LW|LP|LA|LE))?\b",
        u,
    )
    if not m:
        m2 = re.search(r"\b(\d{1,2}(?:[.,]\d)?)\s*[XХ]\s*(\d{3,5})\b", u)  # 9.5x1750 — eni × uzunlik
        if not m2:
            return None
        sec = {"9.5": "Z", "10": "Z", "13": "A", "17": "B", "22": "C", "32": "D", "38": "E"}.get(
            m2.group(1).replace(",", ".")
        )
        if not sec:
            return None
        rest = (u[: m2.start()] + " " + u[m2.end() :]).split()
        brand, rest = _brand(rest)
        return Parsed(
            "vbelt", {"section": sec, "length": m2.group(2)}, brand, " ".join(rest), ["uzunlik tizimi yozilmagan"]
        )
    rest = (u[: m.start()] + " " + u[m.end() :]).replace("NR V BELT", " ").replace("V BELT", " ").split()
    brand, rest = _brand(rest)
    spec: dict[str, Any] = {"section": m.group(1), "length": m.group(2)}
    if m.group(3):
        spec["lref"] = m.group(3)[0] + m.group(3)[1].lower()
    return Parsed("vbelt", spec, brand, " ".join(rest), [] if m.group(3) else ["uzunlik tizimi yozilmagan"])


def _ribbed(s: str) -> Parsed | None:
    u = s.upper().replace("PV BELT", " ")
    m = re.search(r"\b(\d{0,3})\s?(P[HJKLM])\s*[-\s]\s*(\d{3,5})(?:\s*(LE|LA|LI))?(?:\s*[-X]\s*(\d{1,2}))?\b", u)
    if not m:
        return None
    rest = (u[: m.start()] + " " + u[m.end() :]).split()
    brand, rest = _brand(rest)
    spec: dict[str, Any] = {"profile": m.group(2), "length": m.group(3)}
    if m.group(1) or m.group(5):  # 8PK-1795 yoki PJ 1549-8 (qovurg'a oxirida — AppSheet)
        spec["ribs"] = m.group(1) or m.group(5)
    if m.group(4):
        spec["lref"] = m.group(4)[0] + m.group(4)[1].lower()
    return Parsed("ribbed", spec, brand, " ".join(rest))


def _round(s: str) -> Parsed | None:
    m = re.search(r"КРУГЛЫЙ\s+РЕМЕНЬ\s*-?\s*(\d+(?:[.,]\d+)?)\s*(?:ММ|MM)(.*)$", SUFFIX.sub("", s.strip()).upper())
    if not m:
        return None
    tail = m.group(2).strip(" ()")
    return Parsed(
        "round",
        {
            "diameter": m.group(1),
            "material": "PU",
            "surface": "smooth" if "SMOOTH" in tail else None,
            "color": "oq" if "WHITE" in tail else None,
        },
    )


def _conveyor(s: str) -> Parsed | None:
    m = re.search(
        r"\b(EP|NN|CC|EE|ST)\s*-?\s*(\d{2,5})\s*/\s*(\d)(?:\s+(\d+(?:[.,]\d)?)\s*\+\s*(\d+(?:[.,]\d)?))?(?:\s+([YWXZHDLTGKE]))?\b",
        s.upper(),
    )
    if not m:
        return None
    spec = {
        "carcass": m.group(1),
        "strength": m.group(2),
        "plies": m.group(3),
        "top": m.group(4),
        "bottom": m.group(5),
        "grade": m.group(6),
    }
    return Parsed("conveyor", spec)


NAME_HINTS = [
    (r"^SW\d", "profile"),
    (r"ЗВЕЗД|ЗЕЗДОЧ|\b(?:EC|MD|XP)\d{3}", "modular"),
    (r"^КОНВЕЙЕРНАЯ ЛЕНТА|^КОНВЕЙРНАЯ ЛЕНТА|^ЛЕНТА КОНВЕЙЕРНАЯ", "light"),
]
HINTS = [
    ("модульн", "modular"),
    ("modulli", "modular"),
    ("плоск", "flat"),
    ("yassi", "flat"),
    ("профил", "profile"),
    ("profil", "profile"),
    ("gofra", "profile"),
    ("механич", "fastener"),
    ("ulagich", "fastener"),
    ("val qoplama", "lagging"),
    ("футеров", "lagging"),
    ("конвейер", "light"),
    ("konveyer", "light"),
    ("услуг", "service"),
    ("xizmat", "service"),
]


def _series_code(s: str) -> str:
    s = re.sub(r"^NB/", "", s.strip(), flags=re.I)
    s = re.sub(r"^(?:З[ВE]?[EЕ]ЗДОЧКА|ЗЕЗДОЧКА|ЗВЕЗДОЧКА|МОДУЛЬ)\s+ТИП\s+", "", s, flags=re.I)
    return " ".join(s.split())


def parse(name: str, hint: str = "") -> Parsed | None:
    raw = name.strip()
    s = _norm(raw)
    low = raw.casefold()
    h = hint.casefold()
    if "резинотканев" in low:  # GOST 20 (2-650 — turi va eni): standart ko'rsatkichlari nomda yo'q
        return None
    sleeve = low.startswith("рукав") or "rukav" in h or "рукав" in h
    if (r := _round(raw)) is not None:
        return r
    if not sleeve and (r := _conveyor(s)) is not None:
        return r
    if (
        not sleeve
        and ("клин" in h or "klin" in h or re.search(r"\bL[PDIAEW]\b", s.upper()))
        and "поликлин" not in h
        and (r := _vbelt(s))
    ):
        return r
    if not sleeve and (r := _ribbed(s)) is not None:
        return r
    if not sleeve and "поликлин" not in h and (r := _vbelt(s)) is not None and ("клин" in h or "klin" in h):
        return r
    if (r := _timing(s, sleeve)) is not None:
        return r
    named = next((f for pat, f in NAME_HINTS if re.search(pat, raw.upper())), None)
    for word, fam in ([("", named)] if named else []) + HINTS:
        if word in h:
            if fam == "service":
                return Parsed("service", {})
            key = {
                "modular": "series",
                "flat": "series",
                "light": "series",
                "profile": "code",
                "fastener": "system",
                "lagging": "code",
            }[fam]
            spec: dict[str, Any] = {key: _series_code(s)}
            if fam == "modular":
                spec["part"] = (
                    "sprocket" if "звезд" in low or "зездоч" in low else "module" if "модуль" in low else "belt"
                )
            if fam == "profile":
                spec["pkind"] = "sidewall" if re.search(r"\bSW\d", s.upper()) or "gofra" in h else "cleat"
                if hm := re.search(r"\bH(\d{2,3})\s*MM\b", s.upper()):
                    spec["height"] = hm.group(1)
            if fam == "light" and "FDA" in s.upper():
                spec["food"] = True
            return Parsed(fam, spec)
    return None


def to_spec(p: Parsed) -> tuple[S.Family, dict[str, Any], dict[str, str]]:
    fam = S.BY_KEY[p.family]
    spec, errs = S.clean(fam, {k: v for k, v in p.spec.items() if v not in (None, "")})
    return fam, spec, errs
