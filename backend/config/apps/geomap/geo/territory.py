"""Avtomatik muvozanatli hududlar: tumanlar (ADM2) -> k ta bog'langan hudud, yozuvlar soni yoki savdo bo'yicha teng.

Algoritm (Belting hajmi uchun yetarli — ~200 tuman):
  1. urug'lar: og'irligi bor tumanlardan eng uzoq nuqta tanlash (farthest-point);
  2. o'sish: har qadamda eng yengil hudud o'ziga qo'shni bo'sh tumanni oladi (yaxlitlik saqlanadi);
  3. muvozanat: chegaradagi tuman og'irdan yengil qo'shniga o'tkaziladi, agar farq kamaysa va donor bo'linib
     ketmasa (BFS bilan tekshiriladi).
"""

from __future__ import annotations

import time
from collections import deque

from shapely.geometry import mapping

from .geo import bounds, haversine


def _adjacency(ids: list[str]) -> dict[str, set[str]]:
    b = bounds()
    geoms = {i: b.districts[i]["geom"].buffer(0.002) for i in ids}
    adj = {i: set() for i in ids}
    for n, a in enumerate(ids):
        for c in ids[n + 1 :]:
            if geoms[a].intersects(geoms[c]):
                adj[a].add(c)
                adj[c].add(a)
    return adj


def _parts(units: set[str], adj: dict[str, set[str]]) -> int:
    """Bog'langan bo'laklar soni (birlikni chiqarish hududni yangi bo'laklarga bo'lmasin)."""
    left, n = set(units), 0
    while left:
        n += 1
        q = deque([left.pop()])
        while q:
            u = q.popleft()
            for v in adj[u]:
                if v in left:
                    left.discard(v)
                    q.append(v)
    return n


JUMP_EXACT = 5_000  # "sakrash"da aniq (har a'zogacha) masofa faqat shu hajmgacha
BUDGET_S = 20.0  # bitta so'rov uchun hisob vaqti chegarasi (web jarayonida ishlaydi; minglab katakda daqiqalab ketardi)


def _solve(ids, adj, center, w, k, tries, budget: float | None = None):
    budget = BUDGET_S if budget is None else budget
    k = max(1, min(k, len([d for d in ids if w[d] > 0]) or 1, len(ids)))
    heavy = sorted([d for d in ids if w[d] > 0], key=lambda d: -w[d]) or ids
    best = None
    t0 = time.monotonic()
    for n, first in enumerate(heavy[: max(1, tries)]):
        # kichik masala — avvalgidek hamma urinish; katta masala — birinchi urinish byudjetning yarmigacha
        # muvozanatlanadi, qo'shimcha urinishlar faqat vaqt qolsa (natija baribir to'liq bo'linma, faqat kamroq teng)
        if n and time.monotonic() - t0 > budget / 2:
            break
        owner, total, seeds = _build(
            ids, adj, center, w, k, heavy, first, deadline=t0 + (budget / 2 if n == 0 else budget)
        )
        avg = sum(total) / len(total)
        score = max(abs(t - avg) for t in total)
        if best is None or score < best[0]:
            best = (score, owner, total, seeds)
    _, owner, total, seeds = best
    avg = (sum(total) / len(total)) or 1
    return [
        {
            "units": sorted(u for u, t in owner.items() if t == i),
            "total": total[i],
            "pct": round(100 * total[i] / avg, 1),
        }
        for i in range(len(seeds))
    ]


def auto(weights: dict[str, float], k: int, scope: list[str] | None = None, tries: int = 8) -> list[dict]:
    """Tumanlar asosida. weights: tuman id -> og'irlik (soni yoki savdo). scope: qatnashadigan tumanlar (None —
    og'irligi bor viloyatlarning hamma tumanlari — hudud yaxlit bo'lsin). Bir necha urug' bilan quriladi, eng tengi
    tanlanadi. Natija: [{districts, total, pct, geometry}]."""
    b = bounds()
    if scope is None:
        regions = {b.districts[d]["region"] for d, w in weights.items() if w > 0 and d in b.districts}
        scope = [d for d, x in b.districts.items() if x["region"] in regions]
    ids = [d for d in scope if d in b.districts]
    if not ids:
        return []
    adj = _adjacency(ids)
    center = {d: (b.districts[d]["center"].y, b.districts[d]["center"].x) for d in ids}
    w = {d: float(weights.get(d, 0.0)) for d in ids}
    out = []
    for t in _solve(ids, adj, center, w, k, tries):
        geom = b.union(t["units"]).simplify(0.002, preserve_topology=True)
        out.append({"districts": t["units"], "total": t["total"], "pct": t["pct"], "geometry": mapping(geom)})
    return sorted(out, key=lambda t: -t["total"])


def auto_hex(points: list[tuple[float, float, float]], k: int, res: int = 7, tries: int = 8) -> list[dict]:
    """H3 kataklar asosida (res 7 ≈ 5 km²): mijozlar zich joyda mayda birlik — savdo bo'yicha ham teng bo'ladi.
    points: [(lat, lng, og'irlik)]. Birliklar — yozuvi bor kataklar; qo'shnilik — 3 katak masofagacha (bo'shliqlardan
    sakrab o'tadi), uzoq orollar eng yaqin hududga. Natija: [{cells, total, pct, geometry}]."""
    import h3
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    w: dict[str, float] = {}
    for lat, lng, x in points:
        c = h3.latlng_to_cell(lat, lng, res)
        w[c] = w.get(c, 0.0) + float(x)
    ids = list(w)
    if not ids:
        return []
    cells = set(ids)
    adj = {c: {n for n in h3.grid_disk(c, 3) if n in cells and n != c} for c in ids}
    center = {c: h3.cell_to_latlng(c) for c in ids}
    out = []
    for t in _solve(ids, adj, center, w, k, tries):
        polys = [Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(c)]) for c in t["units"]]
        geom = unary_union(polys).buffer(0.004).buffer(-0.002).simplify(0.001, preserve_topology=True)
        out.append({"cells": t["units"], "total": t["total"], "pct": t["pct"], "geometry": mapping(geom)})
    return sorted(out, key=lambda t: -t["total"])


def _build(ids, adj, center, w, k, heavy, first, deadline: float | None = None):
    # 1. urug'lar
    seeds = [first]
    while len(seeds) < k:
        cand = max(
            (d for d in heavy if d not in seeds),
            key=lambda d: min(haversine(center[d], center[s]) for s in seeds) * (1 + w[d] ** 0.25),
            default=None,
        )
        if cand is None:
            break
        seeds.append(cand)
    owner = {s: i for i, s in enumerate(seeds)}
    total = [w[s] for s in seeds]

    # 2. o'sish: har qadamda ENG YENGIL hudud bitta birlik oladi — qo'shnisini, qo'shnisi bo'lmasa eng yaqin bo'sh
    #    birlikka "sakraydi" (zich blokka bitta urug' tushsa ham boshqalar kira olsin)
    free = set(ids) - set(seeds)
    members: list[list[str]] = [[s] for s in seeds]
    # chegaradagi bo'sh qo'shnilar — bosqichma-bosqich yuritiladi (har qadamda qaytadan yig'ish kvadratik edi)
    frontier: list[set[str]] = [{v for v in adj[s] if v in free} for s in seeds]
    while free:
        i = min(range(len(seeds)), key=lambda i: total[i])
        if frontier[i]:
            v = min(frontier[i], key=lambda v: (haversine(center[v], center[seeds[i]]), -w[v]))
        elif len(free) * len(members[i]) <= JUMP_EXACT:
            v = min(free, key=lambda v: min(haversine(center[v], center[u]) for u in members[i]))
        else:  # juda ko'p tarqoq birlik: har a'zogacha masofa (kubik vaqt) o'rniga urug'gacha masofa
            v = min(free, key=lambda v: haversine(center[v], center[seeds[i]]))
        owner[v] = i
        total[i] += w[v]
        members[i].append(v)
        free.discard(v)
        for f in frontier:
            f.discard(v)
        frontier[i].update(u for u in adj[v] if u in free)

    # 3. muvozanat
    for _ in range(2000):
        if deadline is not None and time.monotonic() > deadline:
            break
        avg = sum(total) / len(total)
        moved = False
        for i in sorted(range(len(total)), key=lambda i: -total[i]):
            mine = {u for u, t in owner.items() if t == i}
            if len(mine) <= 1:
                continue
            parts = _parts(mine, adj)
            # har qanday yengilroq qo'shni hududga (zanjir: og'ir -> o'rta -> yengil) — kvadratik chetlanish kamaysa
            border = [(u, owner[v]) for u in mine for v in adj[u] if owner[v] != i and total[owner[v]] < total[i]]
            best = None
            for u, j in border:
                if w[u] <= 0:
                    continue
                gain = (
                    (total[i] - avg) ** 2
                    + (total[j] - avg) ** 2
                    - (total[i] - w[u] - avg) ** 2
                    - (total[j] + w[u] - avg) ** 2
                )
                if gain > 1e-9 and (best is None or gain > best[0]) and _parts(mine - {u}, adj) <= parts:
                    best = (gain, u, j)
            if best:
                _, u, j = best
                owner[u] = j
                total[i] -= w[u]
                total[j] += w[u]
                moved = True
                break
        if not moved:
            break

    return owner, total, seeds
