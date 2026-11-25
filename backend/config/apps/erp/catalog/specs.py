"""Texnik oilalar reestri — har tovar oilasining xalqaro standart bo'yicha ko'rsatkichlari, belgisi va nomi.

Bitta manba: backend shu reestr bilan tekshiradi va belgi/nom yasaydi; frontend formasi `export()` dan olingan JSON
(`frontend/src/erp/finance/lib/specs.json`, test bir xilligini tekshiradi) bo'yicha chiziladi, jonli belgi —
`/app/api/erp/cat/preview`.

Standartlar (docs/plans/2026-11-21-catalog.md):
- tishli remen: ISO 5296 (dyuymli MXL…XXH, belgi `270XL` — uzunlik 0,1″ da), ISO 13050 (egri tishli 3M…20M, STD S*M,
  RPP), ISO 17396 (trapetsiya T/AT, PU);
- klinli: ISO 4184 (Z…E, SPZ…SPC), uzunlik tizimi — Li / Ld / Lw / Lp / La / Le (belgida aniq yoziladi);
- poliklinli: ISO 9982 (PH, PJ, PK, PL, PM), samarali uzunlik;
- konveyer (rezina, to'qima): ISO 14890, DIN 22102 (qoplama sinfi Y/W/X/Z), ISO 10247 (H/D/L) — `EP 400/3 4+2 Y`;
- yengil konveyer: ISO 21183-1 (seriya — ishlab chiqaruvchiniki; qoplama, qalinlik, oziq-ovqat);
- TIF TN (HS) taklifi: 4010.11/12 (konveyer), 4010.31–34 (klinli/poliklinli, aylana bo'yicha), 4010.35/36/39 (tishli),
  5910 (to'qima+plastik lenta), 3926.90 (plastik: PU, modulli).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

Spec = dict[str, Any]
Opt = tuple[str, str]

# ------------------------------------------------------------------ jadvallar
# tishli profil → (qadam mm, tizim, moslik sinfi). Moslik: bir xil sinf — bir shkivda ishlaydi (HTD 8M ≈ RPP8 ≈ SLV8).
TIMING: dict[str, tuple[float, str, str]] = {
    **{
        p: (v, "inch", p)
        for p, v in {"MXL": 2.032, "XXL": 3.175, "XL": 5.08, "L": 9.525, "H": 12.7, "XH": 22.225, "XXH": 31.75}.items()
    },
    **{p: (v, "inch", p) for p, v in {"DXL": 5.08, "DL": 9.525, "DH": 12.7}.items()},
    **{f"{n}M": (n, "htd", f"C{n}") for n in (3, 5, 8, 14, 20)},
    **{f"RPP{n}": (n, "htd", f"C{n}") for n in (3, 5, 8, 14)},
    **{f"SLV{n}": (n, "htd", f"C{n}") for n in (5, 8, 14)},
    **{f"DRPP{n}": (n, "htd", f"D{n}") for n in (5, 8, 14)},
    **{f"HTD{n}M": (n, "htd", f"C{n}") for n in (3, 5, 8, 14)},
    **{f"D{n}M": (n, "htd", f"D{n}") for n in (5, 8, 14)},
    **{"S2M": (2, "std", "S2M"), "S3M": (3, "std", "S3M"), "S4.5M": (4.5, "std", "S4.5M")},
    **{f"S{n}M": (n, "std", f"S{n}M") for n in (5, 8, 14)},
    **{f"DS{n}M": (n, "std", f"DS{n}M") for n in (5, 8)},
    **{f"{n}MGT": (n, "gt", f"G{n}") for n in (2, 3, 5, 8, 14)},
    **{"8GTR": (8, "gt", "G8"), "14GTR": (14, "gt", "G14")},
    **{"T2.5": (2.5, "t", "T2.5"), "T5": (5, "t", "T5"), "T10": (10, "t", "T10"), "T20": (20, "t", "T20")},
    **{"DT5": (5, "t", "DT5"), "DT10": (10, "t", "DT10"), "TT5": (5, "t", "DT5")},
    **{f"AT{n}": (n, "t", f"AT{n}") for n in (3, 5, 10, 20)},
}
TIMING_SYS = {
    "inch": "ISO 5296 (dyuymli)",
    "htd": "ISO 13050 (HTD / RPP)",
    "std": "STD (S…M)",
    "gt": "GT (Gates)",
    "t": "ISO 17396 (T / AT)",
}
# klinli kesim → (ustki eni mm, balandligi mm, turi)
VBELT: dict[str, tuple[float | None, float | None, str]] = {
    "Y": (6, 4, "classic"),
    "Z": (10, 6, "classic"),
    "A": (13, 8, "classic"),
    "B": (17, 11, "classic"),
    "C": (22, 14, "classic"),
    "D": (32, 19, "classic"),
    "E": (38, 23, "classic"),
    "SPZ": (9.7, 8, "narrow"),
    "SPA": (12.7, 10, "narrow"),
    "SPB": (16.3, 13, "narrow"),
    "SPC": (22, 18, "narrow"),
    "XPZ": (9.7, 8, "cogged"),
    "XPA": (12.7, 10, "cogged"),
    "XPB": (16.3, 13, "cogged"),
    "XPC": (22, 18, "cogged"),
    "ZX": (10, 6, "cogged"),
    "AX": (13, 8, "cogged"),
    "BX": (17, 11, "cogged"),
    "CX": (22, 14, "cogged"),
    "3V": (9.5, 8, "wedge"),
    "5V": (16, 13.5, "wedge"),
    "8V": (25.4, 23, "wedge"),
    "3VX": (9.5, 8, "wedge"),
    "5VX": (16, 13.5, "wedge"),
    "AA": (13, 10, "hex"),
    "BB": (17, 14, "hex"),
    "CC": (22, 17, "hex"),
}
VBELT_TYPE = {
    "classic": "klassik (ISO 4184)",
    "narrow": "tor (ISO 4184)",
    "cogged": "tishli qirrali",
    "wedge": "RMA (dyuymli)",
    "hex": "olti qirrali",
}
LREF: list[Opt] = [
    ("Li", "Li — ichki"),
    ("Ld", "Ld — hisobiy (datum)"),
    ("Lw", "Lw — hisobiy (DIN)"),
    ("Lp", "Lp — hisobiy (pitch)"),
    ("La", "La — tashqi"),
    ("Le", "Le — tashqi"),
]
RIBBED: dict[str, float] = {"PH": 1.6, "PJ": 2.34, "PK": 3.56, "PL": 4.7, "PM": 9.4}
CARCASS: list[Opt] = [
    ("EP", "EP — poliester/poliamid"),
    ("NN", "NN — poliamid"),
    ("CC", "CC — paxta"),
    ("EE", "EE — poliester"),
    ("ST", "ST — po'lat kord"),
]
GRADE: list[Opt] = [
    ("Y", "Y — umumiy (DIN 22102)"),
    ("W", "W — yeyilishga chidamli"),
    ("X", "X — kesilish/zarbaga chidamli"),
    ("Z", "Z — yengil sharoit"),
    ("H", "H — og'ir (ISO 10247)"),
    ("D", "D — abraziv (ISO 10247)"),
    ("L", "L — oddiy (ISO 10247)"),
    ("T", "T — issiqqa chidamli"),
    ("G", "G — moyga chidamli"),
    ("K", "K — yong'inga chidamli"),
    ("E", "E — antistatik"),
]

MAT_TIMING: list[Opt] = [("rubber", "Rezina (CR / HNBR)"), ("pu", "Poliuretan (PU)")]
CORD: list[Opt] = [("glass", "Shisha tola"), ("aramid", "Aramid"), ("steel", "Po'lat"), ("polyester", "Poliester")]
BUILD_TIMING: list[Opt] = [("endless", "Yopiq (endless)"), ("open", "Ochiq (rulon)"), ("welded", "Payvandlangan")]
BUILD_V: list[Opt] = [
    ("wrapped", "O'ralgan"),
    ("raw", "Ochiq qirrali"),
    ("cogged", "Tishli qirrali"),
    ("banded", "Ko'p qatorli"),
]
COVER: list[Opt] = [
    ("PVC", "PVC"),
    ("PU", "PU (poliuretan)"),
    ("TPO", "TPO"),
    ("PE", "PE"),
    ("SI", "Silikon"),
    ("RUBBER", "Rezina"),
    ("FELT", "Kigiz"),
    ("NONE", "Qoplamasiz (to'qima)"),
]
PLASTIC: list[Opt] = [("PP", "PP"), ("POM", "POM (atsetal)"), ("PE", "PE"), ("PA", "PA (poliamid)"), ("PBT", "PBT")]
MODULAR_PART: list[Opt] = [("belt", "Lenta"), ("sprocket", "Yulduzcha"), ("module", "Modul"), ("acc", "Aksessuar")]
MODULAR_PITCH: list[Opt] = [(p, f"{p} mm") for p in ("8", "12.7", "19.05", "25.4", "27.2", "38.1", "50.8", "57.15")]
PROFILE_KIND: list[Opt] = [
    ("cleat", "Cleat (T-profil)"),
    ("sidewall", "Bort (gofrabort)"),
    ("guide", "Yo'naltiruvchi (V-profil)"),
    ("other", "Boshqa"),
]
METAL: list[Opt] = [("steel", "Po'lat"), ("ss", "Zanglamas po'lat"), ("galv", "Ruxlangan"), ("plastic", "Plastik")]
LAGGING: list[Opt] = [("rubber", "Rezina"), ("pvc", "PVC"), ("pu", "PU"), ("ceramic", "Keramika")]
PULLEY_PART: list[Opt] = [
    ("taper", "Taper-vtulka"),
    ("v", "Klinli shkiv (ISO 4183)"),
    ("timing", "Tishli shkiv (ISO 5294)"),
    ("ribbed", "Poliklinli shkiv (ISO 9982)"),
    ("other", "Boshqa"),
]
FLAT_MAT: list[Opt] = [
    ("pa", "Poliamid o'zak"),
    ("pes", "Poliester"),
    ("rubber", "Rezina"),
    ("pu", "PU"),
    ("leather", "Charm"),
]


# ------------------------------------------------------------------ maydonlar va oilalar
@dataclass(frozen=True)
class F:
    key: str
    label: str
    type: str = "text"  # choice | code | num | int | text | bool
    options: list[Opt] = field(default_factory=list)
    unit: str = ""
    req: bool = False
    ph: str = ""
    hint: str = ""
    min: float | None = None
    max: float | None = None

    def json(self) -> dict[str, Any]:
        d: dict[str, Any] = {"key": self.key, "label": self.label, "type": self.type}
        for k in ("unit", "ph", "hint"):
            if getattr(self, k):
                d[k] = getattr(self, k)
        if self.options:
            d["options"] = [list(o) for o in self.options]
        if self.req:
            d["req"] = True
        if self.min is not None:
            d["min"] = self.min
        if self.max is not None:
            d["max"] = self.max
        return d


@dataclass(frozen=True)
class Family:
    key: str
    title: str
    title_ru: str  # hujjatlar uchun to'liq nom boshi (1C «Полное наименование» kabi)
    std: str
    group: str  # odatiy kategoriya
    kind: str  # odatiy tur (models.Kind)
    dims: str | None  # odatiy o'lchov: None — dona, w — eni (mm), wl — m², l — m
    fields: list[F]
    mark: Callable[[Spec], str] = lambda s: ""
    key_of: Callable[[Spec], str] | None = None
    calc: Callable[[Spec], list[tuple[str, str]]] = lambda s: []
    hs: Callable[[Spec], str] = lambda s: ""
    prefix: str = ""  # qisqa nom boshi (rukav — «Рукав»)
    check: Callable[[Spec], dict[str, str]] = lambda s: {}  # maydonlararo tekshiruv
    belt: bool = False  # remen belgisi (ombor/sex/qidiruv `belt_mark`)

    def json(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "title": self.title,
            "std": self.std,
            "group": self.group,
            "kind": self.kind,
            "dims": self.dims,
            "fields": [f.json() for f in self.fields],
        }


def num(v: Any) -> Decimal | None:
    s = "" if v is None else str(v).strip().replace(" ", "").replace(",", ".")
    if not s:
        return None
    try:
        d = Decimal(s)
    except InvalidOperation:
        return None
    return d if d.is_finite() else None


def ntxt(v: Any) -> str:
    """Raqam matni: 1040.0 → "1040", 2.50 → "2.5"."""
    d = num(v)
    if d is None:
        return ""
    return str(int(d)) if d == d.to_integral_value() else format(d.normalize(), "f")


def _f(d: float) -> str:
    """Hisob natijasi: 3 xonagacha, ortiqcha nolsiz, o'nlik vergul."""
    return f"{d:.3f}".rstrip("0").rstrip(".").replace(".", ",")


def _s(spec: Spec, k: str) -> str:
    v = spec.get(k)
    return "" if v is None or v is False else str(v).strip()


def _join(*parts: str) -> str:
    return " ".join(p for p in parts if p)


# --- tishli remen va rukav
def _timing_len_mm(spec: Spec) -> float | None:
    p, ln = _s(spec, "profile").upper(), num(spec.get("length"))
    if not p or ln is None or p not in TIMING:
        return None
    return float(ln) * 2.54 if TIMING[p][1] == "inch" else float(ln)


def _timing_mark(spec: Spec, width: bool = True) -> str:
    p, ln = _s(spec, "profile").upper(), ntxt(spec.get("length"))
    w = ntxt(spec.get("width")) if width else ""
    if p and not ln and _s(spec, "build") == "open":
        return f"{p}-{w} rulon" if w else f"{p} rulon"
    if not p or not ln:
        return ""
    inch = TIMING.get(p, (0, ""))[1] == "inch"
    m = f"{ln}{p}" if inch else f"{ln}-{p}"
    if w:
        m += f" {w}mm" if inch else f"-{w}"
    return m


def _timing_key(spec: Spec, width: bool = True) -> str:
    p = _s(spec, "profile").upper()
    cls = TIMING[p][2] if p in TIMING else p
    w = ntxt(spec.get("width")) if width else ""
    return f"T:{cls}:{ntxt(spec.get('length'))}" + (f":{w}" if w else "")


def _timing_calc(spec: Spec) -> list[tuple[str, str]]:
    p = _s(spec, "profile").upper()
    if p not in TIMING:
        return []
    pitch, sys_, _ = TIMING[p]
    out = [("Tizim", TIMING_SYS[sys_]), ("Qadam", f"{_f(pitch)} mm")]
    lmm = _timing_len_mm(spec)
    if lmm:
        if sys_ == "inch":
            out.append(("Qadam bo'yicha uzunlik", f"{_f(lmm)} mm"))
        z = lmm / pitch
        out.append(
            ("Tishlar soni", str(round(z)) if abs(z - round(z)) < 0.02 else f"{_f(z)} (butun emas — tekshiring)")
        )
    return out


def _timing_hs(spec: Spec) -> str:
    if _s(spec, "material") == "pu":
        return "3926.90"
    if _s(spec, "build") == "open":
        return "4010.39"
    lmm = _timing_len_mm(spec)
    if not lmm:
        return ""
    return "4010.35" if 600 < lmm <= 1500 else "4010.36" if 1500 < lmm <= 1980 else "4010.39"


TIMING_FIELDS = [
    F(
        "profile",
        "Profil",
        "code",
        req=True,
        ph="8M, RPP8, S8M, XL, T10, AT10",
        hint="Belgilashdagi profil (qadam shundan)",
    ),
    F(
        "length",
        "Uzunlik",
        "num",
        ph="1040",
        hint="Metrik — mm; dyuymli (XL, L, H) — belgidagi son (270XL = 27,0″); ochiq rulonda bo'sh",
        min=10,
        max=100000,
    ),
]


# --- klinli
def _v_mark(spec: Spec) -> str:
    s, ln = _s(spec, "section").upper(), ntxt(spec.get("length"))
    if not s or not ln:
        return ""
    m = _join(f"{s}-{ln}", _s(spec, "lref"))
    n = num(spec.get("bands"))
    return f"{int(n)}/{m}" if n and n > 1 else m


def _v_key(spec: Spec) -> str:
    n = num(spec.get("bands"))
    return f"V:{_s(spec, 'section').upper()}:{ntxt(spec.get('length'))}:{_s(spec, 'lref')}:{int(n) if n else 1}"


def _v_calc(spec: Spec) -> list[tuple[str, str]]:
    s = _s(spec, "section").upper()
    if s not in VBELT:
        return []
    w, h, t = VBELT[s]
    out = [("Kesim turi", VBELT_TYPE[t])]
    if w and h:
        out.append(("Kesim (eni × balandligi)", f"{_f(w)} × {_f(h)} mm"))
    return out


def _v_hs(spec: Spec) -> str:
    ln = num(spec.get("length"))
    if ln is None:
        return ""
    return "4010.32" if 600 < ln <= 1800 else "4010.34" if 1800 < ln <= 2400 else "4010.39"


# --- poliklinli
def _rib_mark(spec: Spec) -> str:
    p, ln, r = _s(spec, "profile").upper(), ntxt(spec.get("length")), ntxt(spec.get("ribs"))
    return _join(f"{r}{p}-{ln}", _s(spec, "lref")) if p and ln else ""


def _rib_calc(spec: Spec) -> list[tuple[str, str]]:
    p, r = _s(spec, "profile").upper(), num(spec.get("ribs"))
    if p not in RIBBED:
        return []
    out = [("Qovurg'a qadami", f"{_f(RIBBED[p])} mm")]
    if r:
        out.append(("Remen eni", f"{_f(RIBBED[p] * float(r))} mm"))
    return out


def _rib_hs(spec: Spec) -> str:
    ln = num(spec.get("length"))
    if ln is None:
        return ""
    return "4010.31" if 600 < ln <= 1800 else "4010.33" if 1800 < ln <= 2400 else "4010.39"


# --- konveyer (rezina)
def _conv_mark(spec: Spec) -> str:
    c, st = _s(spec, "carcass"), ntxt(spec.get("strength"))
    if not c or not st:
        return ""
    plies = ntxt(spec.get("plies"))
    top, bot = ntxt(spec.get("top")), ntxt(spec.get("bottom"))
    body = f"{c} {st}" + (f"/{plies}" if plies and c != "ST" else "")
    covers = f"{top}+{bot}" if top and bot else ""
    w = ntxt(spec.get("width"))
    return _join(f"B{w}" if w else "", body, covers, _s(spec, "grade"))


def _conv_calc(spec: Spec) -> list[tuple[str, str]]:
    top, bot, st, plies = (
        num(spec.get("top")),
        num(spec.get("bottom")),
        num(spec.get("strength")),
        num(spec.get("plies")),
    )
    out = []
    if st and plies and _s(spec, "carcass") != "ST":
        out.append(("Bitta qatlam mustahkamligi", f"{_f(float(st / plies))} N/mm"))
    if top is not None and bot is not None:
        out.append(("Qoplamalar jami", f"{_f(float(top + bot))} mm"))
    return out


# --- yengil, modulli, boshqa
def _series_mark(*keys: str) -> Callable[[Spec], str]:
    def f(spec: Spec) -> str:
        return _join(*(_s(spec, k) for k in keys))

    return f


def _light_mark(spec: Spec) -> str:
    return _join(_s(spec, "series"), "FDA" if spec.get("food") and "FDA" not in _s(spec, "series").upper() else "")


def _round_mark(spec: Spec) -> str:
    d = ntxt(spec.get("diameter"))
    return _join(
        f"Ø{d}" if d else "", _s(spec, "material"), _s(spec, "hardness") and f"{ntxt(spec.get('hardness'))}ShA"
    )


def _profile_mark(spec: Spec) -> str:
    h, code = ntxt(spec.get("height")), _s(spec, "code")
    hh = f"H{h}" if h and f"H{h}" not in code.upper() else ""
    return _join(code, hh, _s(spec, "color"))


COLOR = F("color", "Rangi", ph="oq, ko'k, yashil, qora")

FAMILIES: list[Family] = [
    Family(
        "timing",
        "Tishli remen",
        "Зубчатый ремень",
        "ISO 5296 · ISO 13050 · ISO 17396",
        "Tishli remenlar",
        "goods",
        None,
        [
            *TIMING_FIELDS,
            F(
                "width",
                "Eni",
                "num",
                unit="mm",
                ph="30",
                hint="Bo'sh — eni variant (kenglik) sifatida",
                min=1,
                max=2000,
            ),
            F("material", "Material", "choice", MAT_TIMING),
            F("cord", "Kord", "choice", CORD),
            F("build", "Tuzilishi", "choice", BUILD_TIMING),
        ],
        mark=_timing_mark,
        key_of=_timing_key,
        check=lambda s: (
            {} if "length" in s or s.get("build") == "open" else {"length": "Uzunlik kerak (ochiq rulondan tashqari)"}
        ),
        calc=_timing_calc,
        hs=_timing_hs,
        belt=True,
    ),
    Family(
        "sleeve",
        "Rukav (tishli remen rukavi)",
        "Рукав зубчатого ремня",
        "ISO 5296 · ISO 13050 · ISO 17396",
        "Rukavlar",
        "material",
        "w",
        [*TIMING_FIELDS, F("material", "Material", "choice", MAT_TIMING), F("cord", "Kord", "choice", CORD)],
        mark=lambda s: _timing_mark(s, width=False),
        check=lambda s: {} if "length" in s else {"length": "Uzunlik kerak"},
        key_of=lambda s: "R" + _timing_key(s, width=False),
        calc=_timing_calc,
        hs=lambda s: "3926.90" if _s(s, "material") == "pu" else "4010.39",
        prefix="Рукав",
        belt=True,
    ),
    Family(
        "vbelt",
        "Klinli remen",
        "Клиновой ремень",
        "ISO 4184 · DIN 2215 · DIN 7753",
        "Klinli remenlar",
        "goods",
        None,
        [
            F("section", "Kesim", "choice", [(k, f"{k} — {VBELT_TYPE[v[2]]}") for k, v in VBELT.items()], req=True),
            F(
                "length",
                "Uzunlik",
                "num",
                unit="mm",
                req=True,
                ph="1650",
                hint="AA/BB/CC (olti qirrali) — dyuymda",
                min=50,
                max=20000,
            ),
            F(
                "lref",
                "Uzunlik tizimi",
                "choice",
                LREF,
                hint="Belgidagi uzunlik qaysi o'lchov: Li, Ld/Lw/Lp yoki La/Le (ISO 4184 — Ld)",
            ),
            F("build", "Tuzilishi", "choice", BUILD_V),
            F("bands", "Qatorlar soni", "int", ph="1", hint="Ko'p qatorli (banded) remen uchun", min=1, max=20),
        ],
        mark=_v_mark,
        key_of=_v_key,
        calc=_v_calc,
        hs=_v_hs,
        belt=True,
    ),
    Family(
        "ribbed",
        "Poliklinli remen",
        "Поликлиновой ремень",
        "ISO 9982 · DIN 7867",
        "Poliklinli remenlar",
        "goods",
        None,
        [
            F("profile", "Profil", "choice", [(k, f"{k} — qadam {_f(v)} mm") for k, v in RIBBED.items()], req=True),
            F("ribs", "Qovurg'alar soni", "int", ph="8", min=1, max=200),
            F("length", "Samarali uzunlik", "num", unit="mm", req=True, ph="1795", min=200, max=20000),
            F(
                "lref",
                "Uzunlik tizimi",
                "choice",
                [("Le", "Le — samarali"), ("La", "La — tashqi"), ("Li", "Li — ichki")],
            ),
        ],
        mark=_rib_mark,
        key_of=lambda s: f"P:{_s(s, 'profile').upper()}:{ntxt(s.get('ribs'))}:{ntxt(s.get('length'))}",
        calc=_rib_calc,
        hs=_rib_hs,
        belt=True,
    ),
    Family(
        "conveyor",
        "Konveyer lenta (rezina)",
        "Конвейерная лента резинотканевая",
        "ISO 14890 · DIN 22102 · ISO 10247",
        "Konveyer lentalar",
        "material",
        "wl",
        [
            F("carcass", "Karkas", "choice", CARCASS, req=True),
            F(
                "strength",
                "Mustahkamlik",
                "num",
                unit="N/mm",
                req=True,
                ph="400",
                hint="Butun lentaning uzilish mustahkamligi",
                min=50,
                max=10000,
            ),
            F("plies", "Qatlamlar", "int", ph="3", min=1, max=10),
            F("top", "Ustki qoplama", "num", unit="mm", ph="4", min=0, max=50),
            F("bottom", "Pastki qoplama", "num", unit="mm", ph="2", min=0, max=50),
            F("grade", "Qoplama sinfi", "choice", GRADE),
            F("width", "Eni", "num", unit="mm", ph="800", hint="Bo'sh — eni ombor birligida", min=100, max=5000),
        ],
        mark=_conv_mark,
        key_of=lambda s: "C:" + _conv_mark(s).upper(),
        calc=_conv_calc,
        hs=lambda s: "4010.11" if _s(s, "carcass") == "ST" else "4010.12",
    ),
    Family(
        "light",
        "Yengil konveyer lenta (PVC/PU)",
        "Лента конвейерная лёгкая",
        "ISO 21183-1 · FDA 21 CFR · EU 10/2011",
        "Konveyer lenta materiallari",
        "material",
        "wl",
        [
            F("series", "Seriya (kod)", "code", req=True, ph="E 3/1 U0/U0", hint="Ishlab chiqaruvchi kodi"),
            F("cover", "Qoplama", "choice", COVER),
            F("thickness", "Qalinlik", "num", unit="mm", ph="2", min=0.1, max=30),
            F("plies", "Qatlamlar", "int", ph="2", min=0, max=10),
            F("surface", "Ustki sirt", ph="silliq, matt, grip, piramida"),
            COLOR,
            F("food", "Oziq-ovqatga ruxsat (FDA / EU)", "bool"),
            F("antistatic", "Antistatik", "bool"),
        ],
        mark=_light_mark,
        hs=lambda s: "5910.00",
    ),
    Family(
        "flat",
        "Yassi uzatma remeni",
        "Ремень плоский приводной",
        "ISO 22 · ISO 21183-1",
        "Yassi remen materiallari",
        "material",
        "wl",
        [
            F("series", "Seriya (kod)", "code", req=True, ph="GG 10, GS-05T"),
            F("material", "Material", "choice", FLAT_MAT),
            F("thickness", "Qalinlik", "num", unit="mm", ph="1.9", min=0.1, max=30),
            COLOR,
        ],
        mark=_series_mark("series"),
        hs=lambda s: "5910.00",
    ),
    Family(
        "modular",
        "Modulli lenta",
        "Лента модульная",
        "ishlab chiqaruvchi seriyasi",
        "Modulli lentalar",
        "goods",
        None,
        [
            F("part", "Qism", "choice", MODULAR_PART, req=True),
            F("series", "Seriya (kod)", "code", req=True, ph="EC127C, MD820"),
            F("pitch", "Qadam", "choice", MODULAR_PITCH),
            F("material", "Material", "choice", PLASTIC),
            F("surface", "Sirt", ph="flush grid, flat top, raised rib"),
            COLOR,
        ],
        mark=_series_mark("series", "material"),
        hs=lambda s: "3926.90",
    ),
    Family(
        "round",
        "Dumaloq remen",
        "Ремень круглый",
        "—",
        "Dumaloq remenlar",
        "material",
        "l",
        [
            F("diameter", "Diametr", "num", unit="mm", req=True, ph="5", min=1, max=30),
            F("material", "Material", "choice", [("PU", "PU (poliuretan)"), ("PE", "PE"), ("PES", "Poliester")]),
            F("hardness", "Qattiqlik", "num", unit="Shore A", ph="85", min=40, max=100),
            F("surface", "Sirt", "choice", [("smooth", "Silliq"), ("rough", "G'adir-budur")]),
            COLOR,
        ],
        mark=_round_mark,
        key_of=lambda s: "R:" + _round_mark(s).upper(),
        hs=lambda s: "3926.90",
    ),
    Family(
        "profile",
        "Profil va bort",
        "Профиль",
        "—",
        "Profillar",
        "material",
        "l",
        [
            F("pkind", "Turi", "choice", PROFILE_KIND, req=True),
            F("code", "Kod", "code", req=True, ph="T20, SW30, K17"),
            F("height", "Balandligi", "num", unit="mm", ph="40", min=1, max=500),
            F("material", "Material", "choice", [("PVC", "PVC"), ("PU", "PU"), ("RUBBER", "Rezina")]),
            COLOR,
        ],
        mark=_profile_mark,
        hs=lambda s: "3916.90",
    ),
    Family(
        "fastener",
        "Mexanik ulagich",
        "Механическое соединение",
        "—",
        "Mexanik ulagichlar",
        "goods",
        None,
        [
            F("system", "Tizim (kod)", "code", req=True, ph="MR01, SR07, SE 90/10"),
            F("material", "Material", "choice", METAL),
            F("thick", "Lenta qalinligi", unit="mm", ph="3–6"),
        ],
        mark=_series_mark("system"),
        hs=lambda s: "7326.90",
    ),
    Family(
        "lagging",
        "Val qoplamasi",
        "Футеровка барабана",
        "—",
        "Val qoplamalari",
        "material",
        "l",
        [
            F("code", "Kod", "code", req=True, ph="GRIP 1PVC.G"),
            F("material", "Material", "choice", LAGGING),
            F("thickness", "Qalinlik", "num", unit="mm", ph="8", min=0.5, max=50),
            F("pattern", "Naqsh", ph="silliq, romb, grip"),
        ],
        mark=_series_mark("code"),
        hs=lambda s: "4008.21",
    ),
    Family(
        "pulley",
        "Shkiv va vtulka",
        "Шкив / втулка",
        "ISO 4183 · ISO 5294 · ISO 9982",
        "Shkivlar va vtulkalar",
        "goods",
        None,
        [
            F("part", "Qism", "choice", PULLEY_PART, req=True),
            F("code", "Belgi", "code", req=True, ph="2012, SPB 200-3, 40-8M-30"),
            F("bore", "Teshik", "num", unit="mm", ph="35", min=1, max=500),
        ],
        mark=lambda s: _join(_s(s, "code"), f"Ø{ntxt(s.get('bore'))}" if num(s.get("bore")) else ""),
        hs=lambda s: "8483.50",
    ),
    Family("other", "Boshqa tovar", "", "—", "Boshqa tovarlar", "goods", None, []),
    Family("service", "Xizmat", "", "—", "Xizmatlar", "service", None, []),
]
BY_KEY: dict[str, Family] = {f.key: f for f in FAMILIES}
# eski `attrs.family` → yangi oila
LEGACY = {"timing": "timing", "v": "vbelt", "rib": "ribbed"}


def get(key: str | None) -> Family | None:
    return BY_KEY.get(key or "")


def clean(fam: Family, raw: Any) -> tuple[Spec, dict[str, str]]:
    """Kiruvchi qiymatlar → toza spec va maydon xatolari. Bo'sh maydon — spec'da yo'q."""
    raw = raw if isinstance(raw, dict) else {}
    out: Spec = {}
    errs: dict[str, str] = {}
    for f in fam.fields:
        v = raw.get(f.key)
        if f.type == "bool":
            if v in (True, "true", "1", 1, "on"):
                out[f.key] = True
            continue
        s = "" if v is None else str(v).strip()
        if not s:
            if f.req:
                errs[f.key] = f"{f.label} kerak"
            continue
        if f.type in ("num", "int"):
            d = num(s)
            if d is None:
                errs[f.key] = f"{f.label}: son kiriting"
                continue
            if f.type == "int" and d != d.to_integral_value():
                errs[f.key] = f"{f.label}: butun son"
                continue
            if (f.min is not None and d < Decimal(str(f.min))) or (f.max is not None and d > Decimal(str(f.max))):
                errs[f.key] = f"{f.label}: {ntxt(f.min)}–{ntxt(f.max)}{' ' + f.unit if f.unit else ''} oralig'ida"
                continue
            out[f.key] = int(d) if d == d.to_integral_value() else float(d)
        elif f.type == "choice":
            vals = {o[0].upper(): o[0] for o in f.options}
            if s.upper() not in vals:
                errs[f.key] = f"{f.label}: ro'yxatdan tanlang"
                continue
            out[f.key] = vals[s.upper()]
        elif f.type == "code":
            out[f.key] = " ".join(s.split()).upper() if f.key == "profile" else " ".join(s.split())
        else:
            out[f.key] = " ".join(s.split())[:120]
    if fam.key in ("timing", "sleeve") and "profile" in out:
        out["profile"] = out["profile"].replace(" ", "")
    if not errs:
        errs = fam.check(out)
    return out, errs


def designation(fam: Family, spec: Spec) -> str:
    return fam.mark(spec) if spec else ""


def match_key(fam: Family, spec: Spec) -> str:
    """Analog kaliti: bir xil kalit — o'zaro almashadigan tovarlar (brend farq qilishi mumkin)."""
    d = designation(fam, spec)
    if not d:
        return ""
    if fam.key_of:
        return fam.key_of(spec)
    return f"{fam.key}:{d.upper()}"


def auto_name(fam: Family, spec: Spec, brand: str = "", series: str = "") -> tuple[str, str]:
    """(qisqa nom, to'liq nom ruscha). Belgi bo'lmasa — ("", "")."""
    d = designation(fam, spec)
    if not d:
        return "", ""
    tail = _join(brand.strip().upper(), series.strip())
    short = _join(fam.prefix, d, tail)
    full = _join(fam.title_ru, d, tail)
    return short, full


def computed(fam: Family, spec: Spec) -> list[dict[str, str]]:
    return [{"label": a, "value": b} for a, b in fam.calc(spec)]


def hs_hint(fam: Family, spec: Spec) -> str:
    return fam.hs(spec) if spec else ""


def label_of(fam: Family, spec: Spec) -> list[dict[str, str]]:
    """Ko'rinish uchun: [{label, value}] — tanlov qiymatlari nomi bilan, birlik bilan."""
    out = []
    for f in fam.fields:
        if f.key not in spec:
            continue
        v = spec[f.key]
        if f.type == "bool":
            txt = "ha"
        elif f.type == "choice":
            txt = dict(f.options).get(str(v), str(v))
        else:
            txt = ntxt(v).replace(".", ",") if f.type in ("num", "int") else str(v)
            unit = f.unit
            if f.key == "length" and fam.key in ("timing", "sleeve"):  # dyuymli belgi — 0,1″ da
                unit = "× 0,1″" if TIMING.get(_s(spec, "profile").upper(), (0, ""))[1] == "inch" else "mm"
            txt = f"{txt} {unit}" if unit else txt
        out.append({"key": f.key, "label": f.label, "value": txt})
    return out


def export() -> dict[str, Any]:
    """Frontend formasi uchun reestr (JSON): oilalar, maydonlar, tishli profillar ro'yxati."""
    return {
        "families": [f.json() for f in FAMILIES],
        "timing_profiles": [[p, TIMING_SYS[v[1]]] for p, v in TIMING.items()],
    }
