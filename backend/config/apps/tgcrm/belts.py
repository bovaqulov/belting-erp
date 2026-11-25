"""Remen belgisini tahlil qilish (AI yordamchi uchun): "SPB1650", "B 1450 Li", "8PK2553", "600-S8M-20", "17x1450" → Spec.

Eski Jarvis'dagi sinovdan o'tgan `integrations/belts.parse` ko'chirmasi (o'sha qoidalar, bazasiz). Klinli remenda
uzunlik standarti: katalog Lp bo'yicha; mijoz Li/La aytsa — profil bo'yicha odatiy farq bilan Lp'ga o'giriladi
(eski tizimdagi narx bazasi jadvali bu yerda yo'q — shuning uchun o'girilganda solishtirish tolerantligi kengroq).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

_LOOK = str.maketrans("АВСЕНКМОРТХУаусекмортхн", "ABCEHKMOPTXYAYCEKMOPTXH")
_GOST = {"О": "Z", "0": "Z", "А": "A", "Б": "B", "В": "C", "Г": "D", "Д": "E"}
_W2P = {10: "Z", 13: "A", 17: "B", 22: "C", 32: "D", 38: "E", 40: "E"}
V_PROFILES = (
    *("SPZ", "SPA", "SPB", "SPC", "XPZ", "XPA", "XPB", "XPC", "3VX", "5VX", "3V", "5V", "8V"),
    *("AX", "BX", "CX", "AA", "BB", "CC", "Z", "A", "B", "C", "D", "E"),
)
_TP = (
    r"(S\d{1,2}M|STD\d{1,2}|D?S?\d{1,2}M|HTD\s?\d{1,2}M|T\d{1,2}(?:\.\d)?|AT\d{1,2}|MXL|XXH|XH|XL|L|H|RPP\d{1,2}"
    r"|SLV\d{1,2}|GLD\d{1,2}|TTM\d{1,2}|TT\d{1,2})"
)
# Li → Lp farqi (mm, ISO 4184 / DIN 2215 odatiy qiymatlari); La → Lp — taxminan −20 (avto remenlar)
_LI_TO_LP = {"Z": 22, "A": 30, "B": 40, "C": 58, "D": 75, "E": 80, "SPZ": 37, "SPA": 45, "SPB": 60, "SPC": 83}
LA_TO_LP = -20
INCH = {"MXL", "XXL", "XL", "L", "H", "XH", "XXH"}  # dyuymli qadam: 210 XL = 21.0" = 533.4 mm
CONV_TOL = 10.0


@dataclass
class Spec:
    family: str = ""  # v | rib | timing
    profile: str = ""
    length: float = 0
    lstd: str = ""  # li | lp | la | ""
    width: float = 0  # tishli: kenglik mm
    ribs: int = 0  # poliklinli: qovurg'a soni
    notes: list[str] = field(default_factory=list)

    def label(self) -> str:
        if self.family == "rib":
            return f"{self.ribs or ''}{self.profile} {self.length:.0f}"
        if self.family == "timing":
            return f"{self.length:.0f} {self.profile}" + (f" × {self.width:.0f} mm" if self.width else "")
        return f"{self.profile} {self.length:.0f}" + (f" {self.lstd.capitalize()}" if self.lstd else "")

    @property
    def kind(self) -> str:
        return {"v": "klinli (V) remen", "rib": "poliklinli (poly-V) remen", "timing": "tishli (timing) remen"}.get(
            self.family, "remen"
        )


def _pitch(p: str) -> str:
    p = p.replace(" ", "").upper()
    if p.startswith("HTD"):
        p = p[3:]
    if re.fullmatch(r"STD(\d+)", p):
        p = f"S{p[3:]}M"
    return p


_SERIES = re.compile(r"\b(STS|HTD|STD)\s+(?=[SD]?\d{1,2}M\b)", re.I)
_AVX = re.compile(r"\bAVX\s*(10|13)\s*[xх×*\- ]\s*(\d{3,4})\b", re.I)
_STD = {"LI": "li", "LA": "la", "LE": "la"}


def parse(text: str) -> Spec | None:
    raw = _SERIES.sub("", (text or "").strip())
    if m := _AVX.search(raw):
        prof = _W2P[int(m.group(1))]
        return Spec(
            "v", prof, float(m.group(2)), "la", notes=[f"AVX{m.group(1)} — avto remen (uzunlik La), {prof} profil"]
        )
    up = raw.upper()
    if m := re.search(r"(?<![А-ЯA-Z])([ОАБВГД])\s*\(?\s*([ОАБВГД])\s*\)?\s*[-‐]?\s*(\d{3,5})\b", up):
        a1, a2 = m.group(1), m.group(2)
        return Spec("v", _GOST[a2], float(m.group(3)), "", notes=[f"'{a1}{a2}': {_GOST[a2]} profil deb olindi"])
    m = re.search(r"(?<![А-ЯA-Z])([ОАБВГД])\s*[-‐]?\s*(\d{3,5})\b", up)
    if m and not re.search(r"[A-Z]", up.replace("РЕМЕНЬ", "")[: m.start()]):
        return Spec("v", _GOST[m.group(1)], float(m.group(2)), "", notes=[f"GOST {m.group(1)} = {_GOST[m.group(1)]}"])
    s = raw.translate(_LOOK).upper().replace("×", "X").replace("Х", "X")
    s = re.sub(r"(\d),(\d)", r"\1.\2", s)
    if m := re.search(
        r"(?:(\d{1,2})\s*-?\s*)?(PJ|PK|PL|PM|PH)\s*-?\s*(\d{3,5})(?:\s*(?:LE|LA|LP|LB)?\s*[-X]\s*(\d{1,2})\b)?", s
    ):
        return Spec("rib", m.group(2), float(m.group(3)), "la", ribs=int(m.group(1) or m.group(4) or 0))
    m = re.search(
        rf"(?<![\d.])(\d{{2,5}})\s*-?\s*{_TP}(?![A-Z0-9])"
        r"(?:\s*[-X ]\s*(\d{1,3})(?:\s*MM)?\b(?!\s*(?:TA|Ш[TТ]|DONA|ДOHA|ДОНА|PCS|ДOH)))?",
        s,
    )
    if m and not re.fullmatch(r"\d{1,2}", m.group(1) or ""):
        return Spec("timing", _pitch(m.group(2)), float(m.group(1)), "", width=float(m.group(3) or 0))
    m = re.search(rf"(?<![A-Z]){_TP}\s*-?\s*(\d{{2,5}})(?:\s*[-X]\s*(\d{{1,3}})\b)?", s)
    if m and not re.fullmatch(r"[A-E]", m.group(1)):
        w = float(m.group(3) or 0)
        lead = re.search(r"(?<![\d.])(\d{1,3})\s*-\s*$", s[: m.start()])  # "10-TT5-6600": kenglik-profil-uzunlik
        return Spec("timing", _pitch(m.group(1)), float(m.group(2)), "", width=w or float(lead.group(1) if lead else 0))
    pr = "|".join(V_PROFILES)
    if m := re.search(rf"(?<![A-Z])({pr})\s*[-/]?\s*(\d{{2,5}}(?:\.\d)?)\s*(LI|LP|LW|LD|LA|LE)?(?![A-Z0-9])", s):
        sp = Spec("v", m.group(1), float(m.group(2)), _STD.get(m.group(3) or "", "lp" if m.group(3) else ""))
        if sp.length < 300:
            sp.notes.append(f"{sp.length:g} — dyuym (Li ≈ {sp.length * 25.4:.0f} mm)")
            sp.length, sp.lstd = round(sp.length * 25.4), "li"
        return sp
    if (m := re.search(r"(\d{1,2}(?:\.\d)?)\s*X\s*(\d{3,5})\s*(LI|LP|LW|LD|LA|LE)?", s)) and round(
        float(m.group(1))
    ) in _W2P:
        prof = _W2P[round(float(m.group(1)))]
        sp = Spec("v", prof, float(m.group(2)), _STD.get(m.group(3) or "", "lp" if m.group(3) else ""))
        sp.notes.append(f"kenglik {m.group(1)} mm → {prof} profil")
        return sp
    return None


def lp_len(sp: Spec) -> float:
    """Klinli remen uzunligi Lp da (katalog Lp bo'yicha)."""
    if sp.family == "v" and sp.lstd == "li":
        return sp.length + _LI_TO_LP.get(sp.profile.replace("XP", "SP"), 30)
    if sp.family == "v" and sp.lstd == "la":
        return sp.length + LA_TO_LP
    return sp.length


def _converted(got: Spec, want: Spec) -> bool:
    """Uzunlik standarti farq qiladi (Li/La ↔ Lp) — taxminiy o'girish bilan solishtiriladi."""
    return want.family == "v" and (got.lstd or "lp") != (want.lstd or "lp")


def len_diff(got: Spec, want: Spec) -> float:
    """got − want, mm. Turli standartda (Li/La/Lp) — ikkalasi Lp da; dyuymli qadamda mm ga o'giriladi."""
    if _converted(got, want):
        return lp_len(got) - lp_len(want)
    d = got.length - want.length
    return d * 2.54 if want.family == "timing" and want.profile in INCH else d


def same_size(got: Spec, want: Spec) -> bool:
    """Bir xil remenmi: oila, profil, uzunlik (+ poliklinlida qovurg'a soni, tishlida kenglik — ikkalasida bo'lsa)."""
    if got.family != want.family or got.profile != want.profile or not got.length:
        return False
    if want.family == "rib" and want.ribs and got.ribs and got.ribs != want.ribs:
        return False
    if want.family == "timing" and want.width and got.width and abs(got.width - want.width) >= 1:
        return False
    return abs(len_diff(got, want)) < (CONV_TOL if _converted(got, want) else 1)
