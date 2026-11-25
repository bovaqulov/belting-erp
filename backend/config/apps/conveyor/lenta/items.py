"""Ko'ndalang profillar JOYLASHUVI (markazlar ro'yxati, mm) — `lib/items.ts` nusxasi.

Ro'yxat: o'sish tartibida, [0, uzunlik] ichida, EPS dan yaqin markazlar bitta,
MAX_ITEMS dan ko'p emas. Hammasi sof funksiyalar.
"""

from __future__ import annotations

import math
from typing import Any

from ._js import INF, is_finite, jfloor, jmax, jmin, jround, to_float

EPS = 0.5
MAX_ITEMS = 500


def r1(v: float) -> float:
    """0,1 mm gacha yaxlitlash (JS Math.round)."""
    return jround(v * 10) / 10


def even_positions(length: float, count: float) -> list[float]:
    """Teng taqsimlash: har bo'lak o'rtasida bittadan profil."""
    n = jmax(0, jmin(MAX_ITEMS, jfloor(count)))
    if math.isnan(n) or n == 0 or length <= 0:
        return []
    n = int(n)
    step = length / n
    return [r1(step * (i + 0.5)) for i in range(n)]


def normalize_positions(raw: Any, length: float) -> list[float]:
    """Har qanday kirishdan qoidaga mos ro'yxat; lentadan tashqaridagilar olib tashlanadi."""
    if not isinstance(raw, list) or length <= 0:
        return []
    vals = sorted(r1(to_float(v)) for v in raw if is_finite(v))
    out: list[float] = []
    for v in vals:
        if not (v >= 0 and v <= length):
            continue
        if len(out) >= MAX_ITEMS:
            break
        if out and v - out[-1] < EPS:
            continue
        out.append(v)
    return out


def nearest_index(xs: list[float], v: float) -> int:
    """`v` ga eng yaqin element indeksi."""
    best, best_d = -1, INF
    for i, x in enumerate(xs):
        d = abs(x - v)
        if d < best_d:
            best_d, best = d, i
    return best


def _nearest_free(taken: list[float], want: float, length: float, min_gap: float = EPS) -> float:
    gap = jmax(EPS, min_gap)

    def busy(v: float) -> bool:
        return any(abs(t - v) < gap - 1e-9 for t in taken)

    if not busy(want):
        return want
    free = [v for t in taken for v in (r1(t - gap), r1(t + gap)) if v >= 0 and v <= length and not busy(v)]
    if not free:
        return want
    best = free[0]
    for v in free:
        if abs(v - want) < abs(best - want):
            best = v
    return best


def add_position(xs: list[float], at: float, length: float, min_gap: float = EPS) -> dict[str, Any]:
    """Yangi profil qo'shadi (band bo'lsa eng yaqin bo'sh joyga)."""
    if length <= 0 or len(xs) >= MAX_ITEMS:
        return {"list": xs, "index": -1}
    free = _nearest_free(xs, jmin(length, jmax(0, r1(at))), length, min_gap)
    lst = normalize_positions([*xs, free], length)
    return {"list": lst, "index": nearest_index(lst, free)}


def remove_at(xs: list[float], i: int) -> list[float]:
    """Bitta profilni olib tashlaydi."""
    if i < 0 or i >= len(xs):
        return xs
    return [v for n, v in enumerate(xs) if n != i]


def move_to(xs: list[float], i: int, to: float, length: float, min_gap: float = EPS) -> dict[str, Any]:
    """Profilni yangi joyga suradi (ustiga surilgan yo'qolmaydi)."""
    if i < 0 or i >= len(xs) or length <= 0:
        return {"list": xs, "index": i}
    want = jmin(length, jmax(0, r1(to)))
    rest = [v for n, v in enumerate(xs) if n != i]
    free = _nearest_free(rest, want, length, min_gap)
    lst = normalize_positions([*rest, free], length)
    return {"list": lst, "index": nearest_index(lst, free)}


def gaps_of(xs: list[float], length: float) -> list[float]:
    """O'lcham zanjiri: boshidan 1-chisigacha, ..., oxirgisidan oxirigacha."""
    if length <= 0:
        return []
    if not xs:
        return [length]
    out = [r1(xs[i] - (0 if i == 0 else xs[i - 1])) for i in range(len(xs))]
    out.append(r1(length - xs[-1]))
    return out


def _shift(xs: list[float], delta: float, length: float) -> list[float]:
    d = jmin(length - xs[-1], jmax(-xs[0], delta))
    return [r1(jmin(length, jmax(0, v + d))) for v in xs]


def set_gap(xs: list[float], k: int, value: float, length: float) -> list[float]:
    """k-oraliqni o'zgartiradi: undan keyingi hamma profil birga suriladi."""
    n = len(xs)
    if n == 0 or length <= 0 or k < 0 or k > n:
        return xs
    want = jmax(0, r1(value))
    if k == n:
        return _shift(xs, length - want - xs[n - 1], length)
    prev = 0 if k == 0 else xs[k - 1]
    delta = prev + want - xs[k]
    lo = prev + EPS - xs[k]
    hi = length - xs[n - 1]
    d = jmin(hi, jmax(lo, delta))
    return [v if i < k else r1(jmin(length, jmax(0, v + d))) for i, v in enumerate(xs)]


def move_one(xs: list[float], i: int, v: float, lo: float, hi: float, min_gap: float) -> list[float]:
    """BITTA elementni qo'shnilari va chetlar orasida siljitadi."""
    if i < 0 or i >= len(xs):
        return xs
    a = lo if i == 0 else xs[i - 1] + min_gap
    b = hi if i == len(xs) - 1 else xs[i + 1] - min_gap
    if a > b:
        return xs
    nxt = r1(jmin(b, jmax(a, v)))
    return [nxt if j == i else u for j, u in enumerate(xs)]


def set_gap_left(xs: list[float], k: int, value: float, length: float, foot: float) -> list[float]:
    """Oraliqning CHAP uchidagi bitta profil siljiydi."""
    n = len(xs)
    if n == 0 or length <= 0 or k < 0 or k > n:
        return xs
    want = jmax(0, value)
    half = jmin(foot / 2, length / 2)
    gap = jmax(foot, EPS)
    if k == 0:
        return move_one(xs, 0, want, half, length - half, gap)
    if k == n:
        return move_one(xs, n - 1, length - want, half, length - half, gap)
    return move_one(xs, k - 1, xs[k] - want, half, length - half, gap)


def set_gap_local(
    xs: list[float], k: int, value: float, width: float, lo: float, hi: float, min_gap: float
) -> list[float]:
    """Oraliqni mahalliy o'zgartirish (yo'naltiruvchilar uchun)."""
    n = len(xs)
    if n == 0 or k < 0 or k > n:
        return xs
    want = jmax(0, value)
    if k == n:
        return move_one(xs, n - 1, width - want, lo, hi, min_gap)
    left = 0 if k == 0 else xs[k - 1]
    return move_one(xs, k, left + want, lo, hi, min_gap)


def mid_slot(xs: list[float], at: float, length: float) -> float:
    """Tashlangan nuqtani o'rab turgan ikki qo'shnining o'rtasi."""
    prev, nxt = 0.0, length
    for v in xs:
        if v <= at and v > prev:
            prev = v
        if v > at and v < nxt:
            nxt = v
    return r1((prev + nxt) / 2)


def mid_slot_fit(stops: list[float], at: float, length: float, need: float) -> float:
    """`mid_slot`, lekin tor oraliqda eng keng oraliq o'rtasi."""
    xs = sorted([0, *[v for v in stops if v > 0 and v < length], length])
    best = (xs[0], xs[1])
    here = None
    for i in range(1, len(xs)):
        a, b = xs[i - 1], xs[i]
        if b - a > best[1] - best[0]:
            best = (a, b)
        if at >= a and at <= b and here is None:
            here = (a, b)
    pick = here if here and here[1] - here[0] >= need else best
    return r1((pick[0] + pick[1]) / 2)


def nearest_allowed(want: float, blocked: list[list[float]], lo: float, hi: float) -> float:
    """Surilayotgan obyekt uchun eng yaqin ruxsat etilgan joy."""
    v = jmin(hi, jmax(lo, want))
    ivs = sorted(([jmin(a, b), jmax(a, b)] for a, b in blocked), key=lambda p: p[0])
    merged: list[list[float]] = []
    for cur in ivs:
        if merged and cur[0] <= merged[-1][1]:
            merged[-1][1] = jmax(merged[-1][1], cur[1])
        else:
            merged.append([cur[0], cur[1]])
    hit = next((iv for iv in merged if v > iv[0] and v < iv[1]), None)
    if not hit:
        return r1(v)
    cands = [c for c in hit if c >= lo and c <= hi]
    if not cands:
        return r1(v)
    best = cands[0]
    for c in cands:
        if abs(c - want) < abs(best - want):
            best = c
    return r1(best)


def group_count(xs: list[float], n: float, length: float) -> list[float]:
    """Soni o'zgarsa: chekkalar joyida, oraliq teng."""
    cnt = jmax(0, jmin(MAX_ITEMS, jfloor(n)))
    if cnt == 0 or length <= 0 or math.isnan(cnt):
        return []
    cnt = int(cnt)
    if len(xs) < 2:
        return even_positions(length, cnt)
    a, b = xs[0], xs[-1]
    if cnt == 1:
        return [r1((a + b) / 2)]
    return [r1(a + ((b - a) * i) / (cnt - 1)) for i in range(cnt)]


def group_pitch(xs: list[float], pitch: float, length: float) -> list[float]:
    """Qadam o'zgarsa: birinchisi joyida, sig'maganlari olinadi."""
    if not xs or pitch <= 0:
        return xs
    a = xs[0]
    out: list[float] = []
    for i in range(len(xs)):
        v = a + i * pitch
        if v > length:
            break
        out.append(r1(v))
    return out


def group_start(xs: list[float], start: float, length: float) -> list[float]:
    """Boshidan birinchisigacha: butun qator suriladi."""
    if not xs:
        return xs
    span = xs[-1] - xs[0]
    a = jmin(jmax(0, start), jmax(0, length - span))
    return [r1(v - xs[0] + a) for v in xs]


def group_end(xs: list[float], end: float, length: float) -> list[float]:
    """Oxirgisidan oxirigacha: birinchisi joyida, qadam moslanadi."""
    if len(xs) < 2:
        return [r1(jmax(0, length - end))] if xs else xs
    a = xs[0]
    b = jmax(a, length - jmax(0, end))
    return [r1(a + ((b - a) * i) / (len(xs) - 1)) for i in range(len(xs))]


def uniform_pitch(xs: list[float], length: float) -> float | None:
    """Teng qadam (ichki oraliqlar 0,6 mm aniqlikda teng bo'lsa), aks holda None."""
    if len(xs) < 2 or length <= 0:
        return None
    inner = gaps_of(xs, length)[1:-1]
    if not inner:
        return None
    return inner[0] if all(abs(v - inner[0]) < 0.6 for v in inner) else None


def _valid_list(xs: list[float], length: float, min_gap: float, moved: list[int]) -> bool:
    gap = jmax(min_gap, EPS)
    for i in moved:
        if not (xs[i] >= 0 and xs[i] <= length):
            return False
        if i > 0 and xs[i] - xs[i - 1] < gap:
            return False
        if i < len(xs) - 1 and xs[i + 1] - xs[i] < gap:
            return False
    return True


def _is_int(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and float(v).is_integer()


def _replace_at(xs: list[float], ids_in: list[int], vals_in: list[float]) -> dict[str, list]:
    keep = [_is_int(i) and 0 <= i < len(xs) for i in ids_in]
    ids = [int(i) for k, i in enumerate(ids_in) if keep[k]]
    vals = [v for k, v in enumerate(vals_in) if keep[k]]
    tagged = [{"v": v, "sel": ids.index(i) if i in ids else -1} for i, v in enumerate(xs)]
    for k, i in enumerate(ids):
        tagged[i] = {"v": vals[k], "sel": k}
    srt = sorted(tagged, key=lambda t: t["v"])
    return {
        "list": [jround(t["v"] * 10) / 10 for t in srt],
        "ids": [j for j, t in enumerate(srt) if t["sel"] >= 0],
    }


def move_many(xs: list[float], ids: list[int], delta: float, length: float, min_gap: float) -> dict[str, list]:
    """Tanlanganlarni birga `delta` ga surish (to'siqqacha)."""
    if not ids or delta == 0:
        return {"list": xs, "ids": ids}

    def try_d(d: float) -> dict[str, list] | None:
        r = _replace_at(xs, ids, [xs[i] + d if _is_int(i) and 0 <= i < len(xs) else math.nan for i in ids])
        return r if _valid_list(r["list"], length, min_gap, r["ids"]) else None

    full = try_d(delta)
    if full:
        return full
    lo, hi = 0.0, delta
    for _ in range(30):
        mid = (lo + hi) / 2
        if try_d(mid):
            lo = mid
        else:
            hi = mid
    return try_d(lo) or {"list": xs, "ids": ids}


def distribute_many(xs: list[float], ids: list[int], length: float, min_gap: float) -> dict[str, list]:
    """Tanlanganlarni birinchisi va oxirgisi orasida teng taqsimlash."""
    order = sorted(ids, key=lambda i: xs[i])
    if len(order) < 3:
        return {"list": xs, "ids": ids}
    a, b = xs[order[0]], xs[order[-1]]
    step = (b - a) / (len(order) - 1)
    r = _replace_at(xs, order, [a + k * step for k in range(len(order))])
    return r if _valid_list(r["list"], length, min_gap, r["ids"]) else {"list": xs, "ids": ids}


def pitch_many(xs: list[float], ids: list[int], pitch: float, length: float, min_gap: float) -> dict[str, list]:
    """Tanlanganlar orasi `pitch` bo'ladi."""
    order = sorted(ids, key=lambda i: xs[i])
    if len(order) < 2 or pitch <= 0:
        return {"list": xs, "ids": ids}
    a = xs[order[0]]
    r = _replace_at(xs, order, [a + k * pitch for k in range(len(order))])
    return r if _valid_list(r["list"], length, min_gap, r["ids"]) else {"list": xs, "ids": ids}


def remove_many(xs: list[float], ids: list[int]) -> list[float]:
    """Tanlanganlarni olib tashlash."""
    return [v for i, v in enumerate(xs) if i not in ids]


def fit_cleat_ends(xs: list[float], length: float, foot: float) -> list[float]:
    """Profil lentadan chiqmasin: markaz chetdan kamida foot/2 ichkarida."""
    if not xs or length <= 0 or foot <= 0:
        return xs
    half = jmin(foot / 2, length / 2)
    lo = r1(half)
    hi = r1(length - half)
    if xs[0] >= lo - 1e-9 and xs[-1] <= hi + 1e-9:
        return xs
    out = [v for v in xs if v >= lo and v <= hi]
    if xs[0] < lo and (not out or out[0] - lo >= foot - 1e-9):
        out.insert(0, lo)
    if xs[-1] > hi and (not out or hi - out[-1] >= foot - 1e-9) and (not out or out[-1] != hi):
        out.append(hi)
    return out
