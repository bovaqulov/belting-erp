"""O'zbekiston chegaralari (geoBoundaries gbOpen, CC BY 4.0): 14 viloyat (ADM1) va 199 tuman (ADM2).

- viloyat kalitlari barqaror (`samarqand`, `toshkent_v`, …) — viloyat nomi (ro'yxatdagi matn) va manzil matnidan aniqlanadi;
- tuman — ADM2 `shapeID`; manzil matnidagi tuman nomi kirill/lotin farqisiz "skelet" bo'yicha topiladi;
- nuqta qaysi viloyat/tumanga tushishi — shapely (STRtree).
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from functools import lru_cache
from pathlib import Path

from shapely import STRtree
from shapely.geometry import Point, mapping, shape
from shapely.ops import unary_union

DATA = Path(__file__).resolve().parent / "data"

# ADM1 shapeName -> (kalit, o'zbekcha nom)
REGIONS: dict[str, tuple[str, str]] = {
    "Tashkent": ("toshkent", "Toshkent shahri"),
    "Tashkent Region": ("toshkent_v", "Toshkent viloyati"),
    "Andijan Region": ("andijon", "Andijon viloyati"),
    "Namangan Region": ("namangan", "Namangan viloyati"),
    "Fergana Region": ("fargona", "Farg'ona viloyati"),
    "Sirdaryo Region": ("sirdaryo", "Sirdaryo viloyati"),
    "Jizzakh Region": ("jizzax", "Jizzax viloyati"),
    "Samarqand Region": ("samarqand", "Samarqand viloyati"),
    "Navoiy Region": ("navoiy", "Navoiy viloyati"),
    "Bukhara Region": ("buxoro", "Buxoro viloyati"),
    "Qashqadaryo Region": ("qashqadaryo", "Qashqadaryo viloyati"),
    "Surxondaryo Region": ("surxondaryo", "Surxondaryo viloyati"),
    "Xorazm Region": ("xorazm", "Xorazm viloyati"),
    "Republic of Karakalpakstan": ("qoraqalpogiston", "Qoraqalpog'iston Respublikasi"),
}
REGION_LABEL = {k: label for k, label in REGIONS.values()}

# Manzil matnidan viloyatni aniqlash (kichik harfda qidiriladi). Tartib muhim: viloyat shahardan oldin.
REGION_HINTS: list[tuple[str, tuple[str, ...]]] = [
    (
        "toshkent_v",
        (
            "toshkent vil",
            "toshkent v.",
            "tashkent region",
            "ташкентская обл",
            "ташкент вил",
            "тошкент вил",
            "ташкентской обл",
            "chirchiq",
            "чирчик",
            "angren",
            "ангрен",
            "olmaliq",
            "алмалык",
            "bekobod",
            "бекабад",
            "yangiyo'l",
            "янгиюль",
            "zangiota",
            "зангиат",
            "qibray",
            "кибрай",
            "nurafshon",
            "нурафшон",
        ),
    ),
    ("samarqand", ("samarqand", "samarkand", "самарканд", "самарқанд")),
    ("buxoro", ("buxoro", "bukhara", "бухар", "бухоро")),
    ("navoiy", ("navoi", "навои", "навоий", "zarafshon", "зарафшан")),
    ("andijon", ("andijon", "andijan", "андижан", "андижон")),
    ("namangan", ("namangan", "наманган")),
    (
        "fargona",
        (
            "farg'ona",
            "farg`ona",
            "farg‘ona",
            "fargona",
            "fergana",
            "ферган",
            "фарғона",
            "фаргона",
            "qo'qon",
            "qoqon",
            "коканд",
            "қўқон",
            "marg'ilon",
            "margilan",
            "маргилан",
        ),
    ),
    ("qoraqalpogiston", ("qoraqalpo", "karakalpak", "каракалпак", "қорақалпоғ", "nukus", "нукус")),
    ("xorazm", ("xorazm", "khorezm", "хорезм", "хоразм", "urganch", "urgench", "ургенч", "xiva", "хива")),
    ("surxondaryo", ("surxon", "surkhan", "сурхан", "термез", "termiz", "termez")),
    (
        "qashqadaryo",
        ("qashqa", "kashkadar", "кашкадар", "қашқадар", "qarshi", "karshi", "карши", "шахрисабз", "shahrisabz"),
    ),
    ("jizzax", ("jizzax", "jizzakh", "джизак", "жиззах")),
    ("sirdaryo", ("sirdaryo", "syrdarya", "сырдар", "сирдарё", "guliston", "гулистан", "гулистон")),
    ("toshkent", ("toshkent", "tashkent", "ташкент", "тошкент")),
]

# Viloyat nomi (ro'yxat qiymati, matn) -> kalit
REGION_NAMES = {
    "toshkent": "toshkent",
    "toshkent viloyati": "toshkent_v",
    "andijon viloyati": "andijon",
    "farg'ona viloyati": "fargona",
    "namangan viloyati": "namangan",
    "sirdaryo viloyati": "sirdaryo",
    "jizzax viloyati": "jizzax",
    "navoiy viloyati": "navoiy",
    "samarqand viloyati": "samarqand",
    "buxoro viloyati": "buxoro",
    "qashqadaryo viloyati": "qashqadaryo",
    "surxondaryo viloyati": "surxondaryo",
    "xorazm viloyati": "xorazm",
    "qoraqalpog'iston": "qoraqalpogiston",
    "qozog'iston": "xorij:kz",
    "tojikiston": "xorij:tj",
    "qirg'iziston": "xorij:kg",
}


# Xorijiy mijozlar (viloyat o'rnida davlat: Qozog'iston, Tojikiston, Qirg'iziston; yoki manzil/nomdagi davlat/shahar).
# center — poytaxt (davlat aniq, shahar noma'lum bo'lsa — "taxminiy"); cities — nom/manzildagi shahar -> markazi.
FOREIGN: dict[str, dict] = {
    "kz": {
        "name": "Qozog'iston",
        "center": (51.169, 71.449),
        "hints": ("qozog'iston", "qozogiston", "kazakhstan", "kazakstan", "казахстан", "қазақстан", "kazaxstan"),
        "cities": {
            "almaty": (43.238, 76.946),
            "алматы": (43.238, 76.946),
            "алма-ата": (43.238, 76.946),
            "astana": (51.169, 71.449),
            "астана": (51.169, 71.449),
            "shymkent": (42.317, 69.596),
            "shimkent": (42.317, 69.596),
            "chimkent": (42.317, 69.596),
            "шымкент": (42.317, 69.596),
            "чимкент": (42.317, 69.596),
            "semey": (50.411, 80.227),
            "семей": (50.411, 80.227),
            "taraz": (42.900, 71.366),
            "тараз": (42.900, 71.366),
            "turkistan": (43.297, 68.251),
            "туркестан": (43.297, 68.251),
            "karaganda": (49.807, 73.088),
            "караганд": (49.807, 73.088),
            "aktobe": (50.283, 57.167),
            "актобе": (50.283, 57.167),
            "kyzylorda": (44.849, 65.482),
            "кызылорд": (44.849, 65.482),
            "saryagash": (41.452, 69.169),
            "сарыагаш": (41.452, 69.169),
        },
    },
    "tj": {
        "name": "Tojikiston",
        "center": (38.560, 68.774),
        "hints": ("tojikiston", "tajikistan", "tadjikistan", "таджикистан", "тоҷикистон", "тожикистон"),
        "cities": {
            "dushanbe": (38.560, 68.774),
            "душанбе": (38.560, 68.774),
            "khujand": (40.283, 69.622),
            "xo'jand": (40.283, 69.622),
            "xujand": (40.283, 69.622),
            "худжанд": (40.283, 69.622),
            "хужанд": (40.283, 69.622),
            "сугд": (40.283, 69.622),
            "sughd": (40.283, 69.622),
            "сагдий": (40.283, 69.622),
            "согд": (40.283, 69.622),
            "kulob": (37.914, 69.784),
            "куляб": (37.914, 69.784),
            "bokhtar": (37.836, 68.781),
            "бохтар": (37.836, 68.781),
            "istaravshan": (39.911, 69.004),
            "истаравшан": (39.911, 69.004),
            "panjakent": (39.495, 67.609),
            "пенджикент": (39.495, 67.609),
            "tursunzoda": (38.511, 68.229),
            "турсунзаде": (38.511, 68.229),
        },
    },
    "kg": {
        "name": "Qirg'iziston",
        "center": (42.875, 74.604),
        "hints": ("qirg'iziston", "qirgiziston", "kyrgyzstan", "kirgizstan", "кыргызстан", "киргизия", "кыргыз"),
        "cities": {
            "bishkek": (42.875, 74.604),
            "бишкек": (42.875, 74.604),
            "osh ": (40.513, 72.816),
            "ош ": (40.513, 72.816),
            "jalal-abad": (40.933, 73.000),
            "джалал-абад": (40.933, 73.000),
            "jalolobod": (40.933, 73.000),
            "batken": (40.063, 70.819),
            "баткен": (40.063, 70.819),
        },
    },
    "tm": {
        "name": "Turkmaniston",
        "center": (37.960, 58.326),
        "hints": ("turkmaniston", "turkmenistan", "туркменистан"),
        "cities": {
            "ashgabat": (37.960, 58.326),
            "ашхабад": (37.960, 58.326),
            "turkmenabat": (39.073, 63.578),
            "туркменабад": (39.073, 63.578),
            "dashoguz": (41.836, 59.967),
            "дашогуз": (41.836, 59.967),
        },
    },
    "ru": {
        "name": "Rossiya",
        "center": (55.756, 37.617),
        "hints": ("rossiya", "russia", "россия", "российская"),
        "cities": {
            "moskva": (55.756, 37.617),
            "moscow": (55.756, 37.617),
            "москва": (55.756, 37.617),
            "санкт-петербург": (59.939, 30.316),
            "novosibirsk": (55.008, 82.935),
            "новосибирск": (55.008, 82.935),
        },
    },
}


def foreign_label(key: str) -> str:
    cc = key.split(":", 1)[-1]
    return FOREIGN[cc]["name"] if cc in FOREIGN else f"Xorij ({cc.upper()})"


def foreign_from_text(text: str | None, cities: bool = True) -> str | None:
    """Matnda xorijiy davlat (yoki cities=True bo'lsa yirik shahri) bo'lsa — 'xorij:<cc>'. Faqat O'zbekiston viloyati
    topilmaganda chaqiriladi. Kompaniya NOMIDA faqat davlat nomi qidiriladi (cities=False): "MAZALI OSH" O'sh emas;
    qisqa shahar nomlari (osh, ош) davlatni aniqlashda ishlatilmaydi."""
    t = " " + _apos(text or "").lower() + " "
    for cc, f in FOREIGN.items():
        if any(h in t for h in f["hints"]):
            return f"xorij:{cc}"
        if cities and any(c in t for c in f["cities"] if len(c.strip()) >= 5):
            return f"xorij:{cc}"
    return None


def foreign_city(cc: str, *texts: str | None) -> tuple[float, float] | None:
    f = FOREIGN.get(cc)
    if not f:
        return None
    t = " " + " ".join(_apos(x or "").lower() for x in texts) + " "
    for c, ll in f["cities"].items():
        if c in t:
            return ll
    return None


def _apos(s: str) -> str:
    return re.sub(r"[’‘`ʻʼ']", "'", s)


def region_key(value: str | None) -> str | None:
    if not value:
        return None
    return REGION_NAMES.get(_apos(value).strip().lower())


_STREET_AFTER = re.compile(
    r"^\W{0,3}(yo'li|yoli|ko'chasi|kochasi|shox ko'chasi|ulitsa|улица|ул\.|шоссе|тракт|"
    r"проспект|massivi|mavzesi|йули|кучаси)"
)


def region_from_text(text: str | None) -> str | None:
    """Manzilda BIRINCHI uchragan viloyat/shahar ("ГОРОД ТАШКЕНТ, … FARG'ONA YO'LI" — Toshkent). Ko'cha nomidagi
    shahar nomlari ("Farg'ona yo'li", "Самарканд кучаси") hisobga olinmaydi; bir joyda — uzunroq mos (viloyat) ustun."""
    t = _apos(text or "").lower()
    best = None
    for key, hints in REGION_HINTS:
        for h in hints:
            for m in re.finditer(re.escape(h), t):
                tail = t[m.end() :]
                word_end = re.match(r"[\w'‘’-]*", tail).end()  # 'ташкент|ская обл' — so'z oxirigacha
                if _STREET_AFTER.match(tail[word_end:]):
                    continue
                cand = (m.start(), -len(h), key)
                if best is None or cand < best:
                    best = cand
                break
    return best[2] if best else None


# ------------------------------------------------------------------ transliteratsiya / skelet
_CYR = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "yo",
    "ж": "j",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "x",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "sh",
    "ъ": "",
    "ы": "i",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya",
    "ў": "o",
    "қ": "q",
    "ғ": "g",
    "ҳ": "h",
}


def translit(s: str) -> str:
    return "".join(_CYR.get(ch, ch) for ch in _apos(s).lower())


def skeleton(word: str) -> str:
    """Kirill/lotin, o'zbekcha/ruscha/inglizcha yozuv farqlarini yo'qotadigan undoshlar skeleti.
    'Zangiata' / 'ЗАНГИАТИНСКИЙ' / 'Zangiota' -> 'zngt'."""
    w = translit(word)
    w = re.sub(r"[^a-z]", "", w)
    for a, b in (
        ("kh", "x"),
        ("sh", "s"),
        ("ch", "c"),
        ("ts", "s"),
        ("q", "k"),
        ("h", "x"),
        ("dzh", "j"),
        ("dj", "j"),
        ("zh", "j"),
        ("yo", ""),
        ("ya", ""),
        ("yu", ""),
        ("y", ""),
        ("w", "v"),
    ):
        w = w.replace(a, b)
    return re.sub(r"[aeiou]", "", re.sub(r"(.)\1+", r"\1", w))


_DIST_STOP = re.compile(r"\b(city|district|region|tumani|tuman|rayon|shahri|sh)\b", re.I)
_CITY_MARK = re.compile(r"(\bsh\.|\bshahri?\b|\bshahar\b|\bg\.|\bgorod\b|\bcity\b)")


# ------------------------------------------------------------------ chegaralar
class Boundaries:
    def __init__(self) -> None:
        a1 = json.loads((DATA / "uz_ADM1.geojson").read_text(encoding="utf-8"))["features"]
        a2 = json.loads((DATA / "uz_ADM2.geojson").read_text(encoding="utf-8"))["features"]
        self.regions: dict[str, dict] = {}
        for f in a1:
            key, label = REGIONS[f["properties"]["shapeName"]]
            g = shape(f["geometry"])
            self.regions[key] = {"key": key, "name": label, "geom": g, "center": g.representative_point()}
        self._rkeys = list(self.regions)
        self._rtree = STRtree([self.regions[k]["geom"] for k in self._rkeys])
        self.districts: dict[str, dict] = {}
        for f in a2:
            p = f["properties"]
            g = shape(f["geometry"])
            c = g.representative_point()
            name = p["shapeName"].replace("а", "a")  # manbada bitta kirill 'а' bor (Rаmitan)
            self.districts[p["shapeID"]] = {
                "id": p["shapeID"],
                "name": name,
                "geom": g,
                "center": c,
                "region": self._region_of(g),
                "skel": skeleton(_DIST_STOP.sub(" ", name).strip().split()[0]),
                "is_city": "city" in name.lower(),
            }
        self._dkeys = list(self.districts)
        self._dtree = STRtree([self.districts[k]["geom"] for k in self._dkeys])

    def _region_of(self, g) -> str | None:
        """Tuman qaysi viloyatda: eng katta kesishma maydoni (ADM1/ADM2 turlicha soddalashtirilgan — markaz nuqtasi
        qo'shni viloyatga tushishi mumkin: Toshkent shahri tumanlari)."""
        best, area = None, 0.0
        for i in self._rtree.query(g, predicate="intersects"):
            a = self.regions[self._rkeys[int(i)]]["geom"].intersection(g).area
            if a > area:
                best, area = self._rkeys[int(i)], a
        return best

    def region_at(self, lat: float, lng: float) -> str | None:
        pt = Point(lng, lat)
        for i in self._rtree.query(pt, predicate="intersects"):
            return self._rkeys[int(i)]
        return None

    def district_at(self, lat: float, lng: float) -> str | None:
        pt = Point(lng, lat)
        for i in self._dtree.query(pt, predicate="intersects"):
            return self._dkeys[int(i)]
        return None

    def district_from_text(self, text: str | None, region: str | None) -> str | None:
        """Manzildagi so'zlar skeleti tuman skeletiga mos kelsa (viloyat ma'lum bo'lsa — faqat uning ichida)."""
        if not text:
            return None
        words = [skeleton(w) for w in re.split(r"[\s,.;:()/\\-]+", translit(text)) if len(w) >= 4]
        words = [w for w in words if w]
        # viloyat nomining o'zi ("Фергана вил.") — viloyat markazi shahri emas; boshqa tuman topilsa u ustun
        region_skels = {skeleton(REGION_LABEL[region].split()[0])} if region in REGION_LABEL else set()
        found: list[tuple[tuple, str, str]] = []
        for d in self.districts.values():
            if region and d["region"] != region:
                continue
            s = d["skel"]
            if len(s) < 2 or (not region and len(s) < 4):
                continue
            # qisqa skelet (Asaka -> 'sk') — faqat to'liq teng so'z; uzunrog'i — so'z boshi (qo'shimchalar: -ский, -tumani)
            hit = next(
                (w for w in words if (w in (s, s + "sk") if len(s) < 3 else w.startswith(s) and len(w) - len(s) <= 6)),
                None,
            )
            if hit:
                found.append(((len(s), d["is_city"]), d["id"], hit))
        if not found:
            return None
        specific = [f for f in found if f[2] not in region_skels]
        if specific:
            return max(specific)[1]
        # faqat viloyat nomi bor: "Samarqand sh." — shahar; "Farg'ona viloyati" — tuman noma'lum
        return max(found)[1] if _CITY_MARK.search(translit(text)) else None

    def geojson(self, level: str) -> dict:
        items = self.regions.values() if level == "region" else self.districts.values()
        feats = []
        for it in items:
            props = (
                {"id": it["key"], "name": it["name"]}
                if level == "region"
                else {"id": it["id"], "name": it["name"], "region": it["region"]}
            )
            feats.append({"type": "Feature", "id": props["id"], "properties": props, "geometry": mapping(it["geom"])})
        return {"type": "FeatureCollection", "features": feats}

    def union(self, district_ids: list[str]):
        return unary_union([self.districts[d]["geom"] for d in district_ids if d in self.districts])


@lru_cache(maxsize=1)
def bounds() -> Boundaries:
    return Boundaries()


def jitter(record_id: str, lat: float, lng: float, meters: float) -> tuple[float, float]:
    """Taxminiy (tuman/viloyat markazi) nuqtalar bir joyga yig'ilib qolmasin — id bo'yicha barqaror siljish."""
    h = hashlib.sha1(record_id.encode()).digest()
    ang = h[0] / 255 * 2 * math.pi
    r = (0.3 + 0.7 * h[1] / 255) * meters
    dlat = r * math.cos(ang) / 111_320
    dlng = r * math.sin(ang) / (111_320 * math.cos(math.radians(lat)))
    return lat + dlat, lng + dlng


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Ikki nuqta (lat, lng) orasidagi masofa, metr."""
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))
