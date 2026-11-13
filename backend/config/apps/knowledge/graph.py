"""Bilimlar grafi: manbalar (faol hujjatlar — bo'lim ko'lamida, faol faktlar — «xotira») → LLM obyekt/bog'lanish
ajratadi (matn o'zgarmasa kesh) → ko'lam bo'yicha birlashtiriladi (+ «all») → daraja, jamoalar (label propagation),
hisobot. So'rovlar frontend src/ai/graph/graph.lib.ts shakllarida (GNode, GLink, GraphSummary)."""

from __future__ import annotations

import hashlib
import logging
from collections import Counter, defaultdict
from typing import Any

from django.db import transaction
from django.db.models import Count, Q

from config.apps.core import llm
from config.apps.memory.models import Fact

from .models import Doc, GraphEdge, GraphMeta, GraphNode, GraphSource

log = logging.getLogger(__name__)
ALL, MEMORY = "all", "xotira"
FACTS_PER_SOURCE = 40
CONFIDENCE = ("EXTRACTED", "INFERRED", "AMBIGUOUS")

EXTRACT_SYSTEM = (
    "Sen bilimlar grafi uchun matndan obyektlar va ular orasidagi bog'lanishlarni ajratasan. Firma — Belting rezina "
    "(sanoat remenlari, konveyer lentalari savdosi va ishlab chiqarishi). Obyekt turlari: tovar, mijoz, xodim, bo'lim, "
    "tashkilot, jarayon, hujjat, joy, tushuncha. Nomlar qisqa, matndagi tilda. Ko'pi 25 obyekt, 40 bog'lanish.\n"
    'JSON: {"entities":[{"name":"...","type":"..."}],"relations":[{"a":"...","b":"...","r":"qisqa fe\'l",'
    '"k":"EXTRACTED|INFERRED"}]} — matnda aniq yozilgani EXTRACTED, xulosa qilingani INFERRED.'
)


def _norm(s: str) -> str:
    return " ".join(str(s).lower().split())[:200]


def _sources() -> list[tuple[str, str, str, str]]:
    """(key, scope, title, text)"""
    out = [
        (f"doc:{d.pk}", d.dept, d.title, f"{d.title}\n{d.path}\n\n{d.body[:8000]}")
        for d in Doc.objects.filter(status=Doc.Status.ACTIVE)
    ]
    facts = list(Fact.objects.filter(status=Fact.Status.ACTIVE).order_by("pk").values_list("text", flat=True))
    for i in range(0, len(facts), FACTS_PER_SOURCE):
        part = facts[i : i + FACTS_PER_SOURCE]
        out.append((f"facts:{i // FACTS_PER_SOURCE}", MEMORY, "Xotira", "\n".join(f"- {x}" for x in part)))
    return out


def _extract(key: str, scope: str, title: str, text: str) -> dict[str, Any]:
    digest = hashlib.sha1(text.encode()).hexdigest()  # noqa: S324 — kesh kaliti, xavfsizlik emas
    src = GraphSource.objects.filter(key=key).first()
    if src and src.digest == digest:
        return src.data
    try:
        data = llm.complete_json(EXTRACT_SYSTEM, text)
    except Exception as e:  # bitta manba xatosi butun grafni to'xtatmasin
        log.warning("graf: %s ajratilmadi: %s", key, e)
        return src.data if src else {}
    if not isinstance(data, dict):
        data = {}
    GraphSource.objects.update_or_create(
        key=key, defaults={"scope": scope, "title": title, "digest": digest, "data": data}
    )
    return data


def communities(nodes: list[str], edges: list[tuple[str, str]]) -> dict[str, int]:
    """Label propagation (deterministik): har tugun qo'shnilarining eng ko'p yorlig'ini oladi; jamoalar hajm bo'yicha 0.."""
    nb: dict[str, list[str]] = defaultdict(list)
    for a, b in edges:
        nb[a].append(b)
        nb[b].append(a)
    lab = {n: i for i, n in enumerate(sorted(nodes))}
    for _ in range(20):
        changed = False
        for n in sorted(nodes):
            if not nb[n]:
                continue
            cnt = Counter(lab[m] for m in nb[n])
            best = max(cnt.values())
            new = min(k for k, v in cnt.items() if v == best)
            if new != lab[n]:
                lab[n], changed = new, True
        if not changed:
            break
    sizes = Counter(lab.values())
    order = {old: i for i, (old, _) in enumerate(sorted(sizes.items(), key=lambda x: (-x[1], x[0])))}
    return {n: order[c] for n, c in lab.items()}


def _report(scope: str, nodes: list[dict], n_edges: int, comms: list[dict]) -> str:
    top = sorted(nodes, key=lambda n: -n["degree"])[:10]
    lines = [
        f"# Graf: {scope}",
        "",
        f"{len(nodes)} tugun · {n_edges} bog'lanish · {len(comms)} jamoa",
        "",
        "## Markaziy tugunlar",
    ]
    lines += [f"- {n['label']} ({n['type'] or '—'}) — {n['degree']} bog'lanish" for n in top]
    lines += ["", "## Jamoalar"] + [f"- {c['label']} — {c['size']} tugun" for c in comms[:15]]
    return "\n".join(lines)


@transaction.atomic
def _save_scope(scope: str, items: list[dict[str, Any]]) -> None:
    nodes: dict[str, dict] = {}
    edges: dict[tuple[str, str, str], str] = {}
    for it in items:
        data, src = it["data"], it["key"]
        for e in data.get("entities") or []:
            if not isinstance(e, dict) or not str(e.get("name", "")).strip():
                continue
            k = _norm(e["name"])
            n = nodes.setdefault(k, {"label": str(e["name"]).strip()[:200], "types": Counter(), "sources": set()})
            n["types"][str(e.get("type") or "")[:40]] += 1
            n["sources"].add(src)
        for r in data.get("relations") or []:
            if not isinstance(r, dict):
                continue
            a, b = _norm(r.get("a", "")), _norm(r.get("b", ""))
            if not a or not b or a == b:
                continue
            for k, raw in ((a, r["a"]), (b, r["b"])):
                nodes.setdefault(k, {"label": str(raw).strip()[:200], "types": Counter(), "sources": set()})[
                    "sources"
                ].add(src)
            conf = r.get("k") if r.get("k") in CONFIDENCE else "INFERRED"
            edges.setdefault((a, b, str(r.get("r") or "")[:120]), conf)
    deg = Counter()
    for a, b, _ in edges:
        deg[a] += 1
        deg[b] += 1
    comm = communities(list(nodes), [(a, b) for a, b, _ in edges])
    GraphNode.objects.filter(scope=scope).delete()
    objs = GraphNode.objects.bulk_create(
        [
            GraphNode(
                scope=scope, key=k, label=n["label"], type=(n["types"].most_common(1)[0][0] if n["types"] else ""),
                community=comm.get(k, 0), degree=deg[k], sources=sorted(n["sources"]),
            )
            for k, n in nodes.items()
        ]
    )  # fmt: skip
    ids = {o.key: o for o in objs}
    GraphEdge.objects.bulk_create(
        [GraphEdge(scope=scope, a=ids[a], b=ids[b], relation=r, confidence=c) for (a, b, r), c in edges.items()]
    )
    by_comm: dict[int, list[GraphNode]] = defaultdict(list)
    for o in objs:
        by_comm[o.community].append(o)
    comms = [
        {"id": c, "label": max(ns, key=lambda x: x.degree).label, "size": len(ns)}
        for c, ns in sorted(by_comm.items(), key=lambda x: (-len(x[1]), x[0]))
    ]
    plain = [{"label": o.label, "type": o.type, "degree": o.degree} for o in objs]
    GraphMeta.objects.update_or_create(
        scope=scope, defaults={"communities": comms, "report": _report(scope, plain, len(edges), comms)}
    )


def rebuild() -> dict[str, int]:
    """Barcha ko'lamlarni qayta quradi. Natija: {ko'lam: tugunlar soni}."""
    by_scope: dict[str, list[dict]] = defaultdict(list)
    for key, scope, title, text in _sources():
        item = {"key": key, "data": _extract(key, scope, title, text)}
        by_scope[scope].append(item)
        by_scope[ALL].append(item)
    for scope in set(GraphMeta.objects.values_list("scope", flat=True)) - set(by_scope):  # manbasi qolmagan ko'lam
        GraphNode.objects.filter(scope=scope).delete()
        GraphMeta.objects.filter(scope=scope).delete()
    for scope, items in by_scope.items():
        _save_scope(scope, items)
    return {s: GraphNode.objects.filter(scope=s).count() for s in by_scope}


# ---------------------------------------------------------------- so'rovlar


def _gnode(n: GraphNode) -> dict[str, Any]:
    return {"id": n.pk, "label": n.label, "d": n.degree, "c": n.community, "t": n.type or None}


def _links(scope: str, ids: set[int]) -> list[dict[str, Any]]:
    qs = GraphEdge.objects.filter(scope=scope, a_id__in=ids, b_id__in=ids)
    return [{"i": e.pk, "a": e.a_id, "b": e.b_id, "k": e.confidence, "r": e.relation or None} for e in qs]


def summary(scope: str) -> dict[str, Any]:
    meta = GraphMeta.objects.filter(scope=scope).first()
    nodes = GraphNode.objects.filter(scope=scope)
    edges = GraphEdge.objects.filter(scope=scope)
    conf = dict(edges.values_list("confidence").annotate(n=Count("id")))
    comm_of = dict(nodes.values_list("pk", "community"))
    surprises = [
        {"source": e.a.label, "target": e.b.label, "relation": e.relation or None, "confidence": e.confidence}
        for e in edges.filter(confidence__in=("INFERRED", "AMBIGUOUS")).select_related("a", "b")[:200]
        if comm_of.get(e.a_id) != comm_of.get(e.b_id)
    ][:10]
    scopes = sorted(GraphMeta.objects.values_list("scope", flat=True), key=lambda s: (s != ALL, s != MEMORY, s))
    return {
        "nodes": nodes.count(),
        "edges": edges.count(),
        "confidence": conf,
        "communities": meta.communities if meta else [],
        "scopes": scopes or [ALL],
        "god_nodes": [{"label": n.label, "degree": n.degree} for n in nodes[:10]],
        "surprises": surprises,
        "questions": [],
        "report": meta.report if meta else "Graf hali qurilmagan — «Qayta qurish» ni bosing.",
    }


def chunk(scope: str, *, mode: str = "top", have: list[Any] | None = None, ids: list[Any] | None = None,
          community: int | None = None, limit: int = 150) -> dict[str, Any]:  # fmt: skip
    have_ids = {int(x) for x in (have or []) if str(x).isdigit()}
    want = [int(x) for x in (ids or []) if str(x).isdigit()]
    limit = max(1, min(int(limit or 150), 500))
    base = GraphNode.objects.filter(scope=scope).exclude(pk__in=have_ids)
    if mode == "neighbors":
        e = GraphEdge.objects.filter(scope=scope).filter(Q(a_id__in=want) | Q(b_id__in=want))
        near = {x for a, b in e.values_list("a_id", "b_id") for x in (a, b)} - set(want)
        qs = base.filter(pk__in=near)
    elif mode == "community":
        qs = base.filter(community=community or 0)
    elif mode == "ids":
        qs = base.filter(pk__in=want)
    else:
        qs = base
    total = qs.count()
    picked = list(qs[:limit])
    new = {n.pk for n in picked}
    return {
        "nodes": [_gnode(n) for n in picked],
        "links": _links(scope, have_ids | new | set(want)),
        "total": GraphNode.objects.filter(scope=scope).count(),
        "more": max(0, total - len(picked)),
    }


def search(scope: str, q: str) -> list[dict[str, Any]]:
    q = q.strip()
    if not q:
        return []
    return [{"id": n.pk, "label": n.label} for n in GraphNode.objects.filter(scope=scope, label__icontains=q)[:30]]


def explain(scope: str, name: str) -> str:
    n = (
        GraphNode.objects.filter(scope=scope, label__iexact=name).first()
        or GraphNode.objects.filter(scope=scope, label__icontains=name).first()
    )
    if n is None:
        return f"«{name}» grafda topilmadi."
    meta = GraphMeta.objects.filter(scope=scope).first()
    cname = next((c["label"] for c in (meta.communities if meta else []) if c["id"] == n.community), n.community)
    lines = [
        f"{n.label} — {n.type or 'turi noma`lum'}",
        f"Jamoa: {cname} · {n.degree} bog'lanish",
        "",
        "Bog'lanishlar:",
    ]
    for e in GraphEdge.objects.filter(scope=scope).filter(Q(a=n) | Q(b=n)).select_related("a", "b")[:40]:
        other, arrow = (e.b, "→") if e.a_id == n.pk else (e.a, "←")
        lines.append(f"  {arrow} {e.relation or 'bog`liq'}: {other.label} ({e.confidence})")
    titles = dict(GraphSource.objects.filter(key__in=n.sources).values_list("key", "title"))
    lines += ["", "Manbalar:"] + [f"  • {titles.get(k, k)}" for k in n.sources[:15]]
    return "\n".join(lines)
