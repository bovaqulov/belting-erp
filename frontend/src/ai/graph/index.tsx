"use client";
// Graf — eski vGraph(opt) (admin.html 734–874): statistika, vis-network bosqichma-bosqich (/graph/data → /graph/chunk),
// qidiruv, explain oynasi, jamoa fokus, to'liq ekran (Telegram "Orqaga"), hisobot, qayta qurish.
// Memory/Kb ichida ko'rinish: scope — eski opt.scope ("xotira" | bo'lim kaliti | "all"; berilsa ko'lam tanlovi yo'q),
// seg — tepadagi ko'rinish almashtirgich (eski opt.seg). scope berilmasa — prefs.graphScope.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DataSet, Network } from "vis-network/standalone";

import { api } from "@/shared/api/client";
import { backOff, backShow, tg } from "@/shared/telegram/telegram";
import { setFullscreen } from "@/ai/shell/fullscreen-flag";
import { useAdmin } from "@/ai/shell/AdminContext";

import {
  focusUpdates,
  isDarkBg,
  scopeName,
  toVisEdge,
  toVisNode,
  type GraphChunk,
  type GraphSummary,
  type VisEdge,
  type VisNode,
} from "./graph.lib";
import { GraphStatus, GraphView, TextSheet } from "./ui";

export interface GraphProps {
  scope?: string;
  seg?: ReactNode;
}

/** bosqichma-bosqich: avval faqat eng muhim GPAGE ta tugun; qolgani bosilganda / qidirilganda / "Ko'proq" bilan */
const GPAGE = 150;

const tgx = tg;

const enc = encodeURIComponent;

interface Ctrl {
  more(): Promise<void>;
  community(id: number, on: boolean): Promise<void>;
  search(v: string): void;
}

/** To'liq ekran: Telegram "Orqaga" tugmasi chiqaradi, tasodifiy yopishdan oldin tasdiq so'raladi */
function makeFull(setFull: (on: boolean) => void, isSheetOpen: () => boolean) {
  const st: { net: Network | null; on: boolean } = { net: null, on: false };
  const fit = () => setTimeout(() => st.net?.fit({ animation: true }), 120);
  const leave = () => {
    st.on = false;
    setFull(false);
    setFullscreen(false);
    backOff(exit);
    try {
      tgx()?.disableClosingConfirmation?.();
    } catch {
      /* eski Telegram */
    }
  };
  const exit = () => {
    if (isSheetOpen()) return; // avval ochiq varaq yopiladi (eskidagidek)
    leave();
    fit();
  };
  const toggle = () => {
    if (st.on) return exit();
    st.on = true;
    setFull(true);
    setFullscreen(true);
    tgx()?.HapticFeedback?.impactOccurred?.("light");
    backShow(exit);
    try {
      tgx()?.enableClosingConfirmation?.();
    } catch {
      /* eski Telegram */
    }
    fit();
  };
  /** bo'lim almashganda to'liq ekranda qolib ketmasin */
  const cleanup = () => {
    if (st.on) leave();
  };
  const setNet = (n: Network | null) => {
    st.net = n;
  };
  return { toggle, cleanup, setNet };
}

export default function Graph({ scope: scopeProp, seg }: GraphProps) {
  const { prefs, setPref, depts, toast, openSheet, render, isSheetOpen } = useAdmin();
  const scope = scopeProp || prefs.graphScope || "all";

  const [loaded, setLoaded] = useState<{ scope: string; g: GraphSummary; data: GraphChunk } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [netState, setNetState] = useState<{ scope: string; ready: boolean; err: string | null } | null>(null);
  const [count, setCount] = useState<{ have: number; total: number } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  const [fs] = useState(() => makeFull(setFull, isSheetOpen));

  const netEl = useRef<HTMLDivElement>(null);
  const legEl = useRef<HTMLDivElement>(null);
  const ctrl = useRef<Ctrl | null>(null);
  // tarmoq hodisalari eng so'nggi toast/openSheet bilan ishlasin (effekt qayta ishga tushmasin)
  const latest = useRef({ toast, openSheet, depts });
  useEffect(() => {
    latest.current = { toast, openSheet, depts };
  });

  const explain = async (name: string) => {
    try {
      const { text } = await api<{ text: string }>(`/app/api/graph/explain?scope=${enc(scope)}&name=${enc(name)}`);
      latest.current.openSheet(<TextSheet title={name} sub="graphify explain" text={text} />);
    } catch (e) {
      latest.current.toast((e as Error).message, "err");
    }
  };
  const explainRef = useRef(explain);
  useEffect(() => {
    explainRef.current = explain;
  });

  // yuklash: umumiy ma'lumot + birinchi GPAGE tugun
  useEffect(() => {
    let alive = true;
    Promise.all([
      api<GraphSummary>(`/app/api/graph?scope=${enc(scope)}`),
      api<GraphChunk>(`/app/api/graph/data?scope=${enc(scope)}&limit=${GPAGE}`),
    ])
      .then(([g, data]) => alive && setLoaded({ scope, g, data }))
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [scope]);

  const cur = loaded && loaded.scope === scope ? loaded : null;

  // to'liq ekrandan chiqmay bo'lim yopilsa — BackButton/yopish tasdig'i qolib ketmasin
  useEffect(() => fs.cleanup, [fs]);

  // chip qatori boshida o'ngga surish Telegram'ning "orqaga" imo-ishorasiga o'tmasin: chetga 1px yetkazmaymiz
  useEffect(() => {
    const leg = legEl.current;
    if (!cur || !leg) return;
    leg.scrollLeft = 1;
    const onScroll = () => {
      if (leg.scrollLeft < 1) leg.scrollLeft = 1;
    };
    leg.addEventListener("scroll", onScroll, { passive: true });
    return () => leg.removeEventListener("scroll", onScroll);
  }, [cur]);

  // vis-network: faqat brauzerda, dinamik import
  useEffect(() => {
    if (!cur) return;
    const { data } = cur;
    let alive = true;
    let net: Network | null = null;
    let qt: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      let vis: typeof import("vis-network/standalone");
      try {
        vis = await import("vis-network/standalone");
      } catch {
        if (alive) setNetState({ scope, ready: false, err: "Graf kutubxonasi yuklanmadi" });
        return;
      }
      const el = netEl.current;
      if (!alive || !el) return;

      const dark = isDarkBg(getComputedStyle(document.body).backgroundColor);
      const total = data.total || (data.nodes || []).length;
      const have = new Set<string | number>();
      let maxD = 1;
      const nodes: DataSet<VisNode> = new vis.DataSet<VisNode>([]);
      const edges: DataSet<VisEdge> = new vis.DataSet<VisEdge>([]);
      const toast = (m: string, k?: "ok" | "err") => latest.current.toast(m, k);
      const updCount = () => setCount({ have: have.size, total });

      // yangi bo'lakni qo'shadi: faqat yangi tugunlar chiziladi, joylashuv qisqa fizika bilan moslashadi, keyin to'xtaydi
      const add = (chunk: GraphChunk, near?: string | number): number => {
        const fresh = (chunk.nodes || []).filter((n) => !have.has(n.id));
        if (!fresh.length && !(chunk.links || []).length) return 0;
        fresh.forEach((n) => {
          have.add(n.id);
          maxD = Math.max(maxD, n.d);
        });
        const pos = near !== undefined && net ? net.getPositions([near])[near] : null;
        nodes.add(
          fresh.map((n) =>
            pos
              ? { ...toVisNode(n, dark, maxD), x: pos.x + (Math.random() - 0.5) * 80, y: pos.y + (Math.random() - 0.5) * 80 }
              : toVisNode(n, dark, maxD),
          ),
        );
        const ne = (chunk.links || []).filter((l) => !edges.get(l.i));
        if (ne.length) edges.add(ne.map((l) => toVisEdge(l, dark)));
        if (net) {
          net.setOptions({ physics: { enabled: true } });
          net.stabilize(fresh.length > 60 ? 160 : 80);
        }
        updCount();
        return fresh.length;
      };
      const chunk = (body: Record<string, unknown>) =>
        api<GraphChunk>("/app/api/graph/chunk", { method: "POST", body: { scope, have: [...have], ...body } });
      const focus = (ids: (string | number)[]) => nodes.update(focusUpdates(nodes.get(), ids, maxD));

      add(data);
      setNetState({ scope, ready: true, err: null });
      const n = new vis.Network(
        el,
        { nodes, edges } as unknown as ConstructorParameters<typeof vis.Network>[1],
        {
          nodes: {
            scaling: { min: 6, max: 38, label: { enabled: true, min: 12, max: 26, maxVisible: 30, drawThreshold: 7 } },
            borderWidth: 1.5,
          },
          edges: { smooth: false, arrows: { to: { enabled: false } }, selectionWidth: 1.6 },
          physics: {
            solver: "forceAtlas2Based",
            forceAtlas2Based: { gravitationalConstant: -38, springLength: 70, avoidOverlap: 0.4 },
            stabilization: { iterations: 200, fit: true },
          },
          interaction: { hover: false, tooltipDelay: 120, hideEdgesOnDrag: true, zoomSpeed: 0.7 },
        },
      );
      net = n;
      fs.setNet(n);
      n.on("stabilized", () => n.setOptions({ physics: false }));
      n.once("stabilizationIterationsDone", () => n.setOptions({ physics: false }));

      n.on("click", async (p: { nodes: (string | number)[] }) => {
        if (!p.nodes.length) {
          focus([]);
          return;
        }
        const id = p.nodes[0];
        tg()?.HapticFeedback?.selectionChanged?.();
        // bosilgan tugunning qo'shnilari faqat shu paytda yuklanadi (har bosishda keyingi 40 tasi)
        try {
          const r = await chunk({ mode: "neighbors", ids: [id], limit: 40 });
          if (!alive) return;
          add(r, id);
          if (r.more) toast(`Yana ${r.more} ta bog'langan tugun bor — qayta bosing`);
        } catch (e) {
          toast((e as Error).message, "err");
        }
        if (!alive) return;
        focus([id, ...n.getConnectedNodes(id)] as (string | number)[]);
        const node = nodes.get(id);
        if (node) void explainRef.current(node.full);
      });

      ctrl.current = {
        async more() {
          try {
            const k = add(await chunk({ mode: "top", limit: GPAGE }));
            if (!k) toast("Hammasi ko'rsatildi");
          } catch (e) {
            toast((e as Error).message, "err");
          }
        },
        async community(c, on) {
          if (on) {
            try {
              add(await chunk({ mode: "community", community: c, limit: GPAGE }));
            } catch (e) {
              toast((e as Error).message, "err");
            }
          }
          if (!alive) return;
          const ids = on ? nodes.get().filter((x) => String(x.c) === String(c)).map((x) => x.id) : [];
          focus(ids);
          if (ids.length) n.fit({ nodes: ids.map(String), animation: true });
          else n.fit({ animation: true });
        },
        search(raw) {
          clearTimeout(qt);
          qt = setTimeout(async () => {
            const v = raw.trim();
            if (v.length < 2) {
              focus([]);
              return;
            }
            try {
              const { nodes: hit } = await api<{ nodes: { id: string | number }[] }>(
                `/app/api/graph/search?scope=${enc(scope)}&q=${enc(v)}`,
              );
              const ids = hit.map((x) => x.id);
              if (ids.some((i) => !have.has(i))) add(await chunk({ mode: "ids", ids })); // topilgan, hali chizilmagan tugunlar
              if (!alive) return;
              focus(ids);
              if (ids.length && ids.length < 40) n.fit({ nodes: ids.map(String), animation: true });
              else if (!ids.length) toast("Topilmadi");
            } catch (e) {
              toast((e as Error).message, "err");
            }
          }, 300);
        },
      };
    })();

    return () => {
      alive = false;
      clearTimeout(qt);
      ctrl.current = null;
      fs.setNet(null);
      net?.destroy();
    };
  }, [cur, scope, fs]);

  if (err !== null) return <GraphStatus seg={seg} err={err} />;
  if (!cur) return <GraphStatus seg={seg} />;

  const { g } = cur;
  const dn = (k: string) => scopeName(k, depts);
  const ns = netState && netState.scope === scope ? netState : null;

  const onMore = async () => {
    if (!ctrl.current) return;
    setMoreBusy(true);
    await ctrl.current.more();
    setMoreBusy(false);
  };
  const onChip = (id: number) => {
    if (!ctrl.current) return;
    const on = active !== id;
    setActive(on ? id : null);
    void ctrl.current.community(id, on);
  };
  const onRebuild = async () => {
    setRebuilding(true);
    try {
      await api("/app/api/graph/rebuild", { method: "POST" });
      toast("Graf qayta qurildi");
      render();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <GraphView
      seg={seg}
      g={g}
      scope={scope}
      scopeProp={scopeProp}
      dn={dn}
      ns={ns}
      count={count}
      moreBusy={moreBusy}
      rebuilding={rebuilding}
      active={active}
      full={full}
      netRef={netEl}
      legRef={legEl}
      onSearch={(v) => ctrl.current?.search(v)}
      onScope={(v) => setPref("graphScope", v)}
      onFull={fs.toggle}
      onMore={() => void onMore()}
      onChip={onChip}
      onReport={() => openSheet(<TextSheet title="GRAPH_REPORT" sub={dn(scope)} text={g.report || ""} />)}
      onRebuild={() => void onRebuild()}
      onExplain={(name) => void explain(name)}
    />
  );
}
