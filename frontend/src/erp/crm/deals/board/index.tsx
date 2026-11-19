"use client";
// Kanban: yuklash, fon yangilanishi (har daqiqa), kartochkani sudrab bosqichga o'tkazish (sichqoncha), "Yana N ta".
// Telefonda: tepada bosqichlar tasmasi (joriy — belgilangan, bosilsa o'sha ustunga o'tadi), ustunlar ekran kengligida
// gorizontal suriladi; bosqich bitim panelidagi strelkalar bilan o'zgartiriladi.
import { useEffect, useRef, useState } from "react";

import { toast } from "@/erp/kit/env";
import { short } from "@/erp/kit/fmt";
import { Loaded, useLoad } from "@/erp/kit/ui";
import { api } from "@/erp/crm/api";
import { moveTo, useCrm } from "@/erp/crm/context";
import { boardTotals, qs, type BoardResp, type Deal } from "@/erp/crm/lib";

import { BoardView, type Zone } from "./ui";

export function Board({
  pipe,
  fp,
  tick,
  paused,
  onLoaded,
}: {
  pipe: string;
  fp: Record<string, unknown>;
  tick: number;
  paused: boolean;
  onLoaded: (counts: Record<string, number>, sum: string) => void;
}) {
  const crm = useCrm();
  const fkey = JSON.stringify(fp);
  const st = useLoad(() => api<BoardResp>(`/app/api/erp/crm/board?${qs({ pipeline: pipe, ...fp })}`), [pipe, fkey, tick]);
  const [drag, setDrag] = useState<Deal | null>(null);
  const [over, setOver] = useState("");
  // "Yana N ta" bilan qo'shilgan kartochkalar — faqat shu yuklanishga tegishli (yangilanganda tozalanadi)
  const [extra, setExtra] = useState<{ at: number; m: Record<string, Deal[]> }>({ at: 0, m: {} });
  const more = extra.at === st.at ? extra.m : {};
  // telefon: joriy ustun (surish bo'yicha) va tasmadan tanlash
  const kb = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    kb.current?.parentElement?.querySelector('nav[aria-label="Bosqichlar"] [aria-current]')?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [active]);
  const col = () => {
    const el = kb.current?.querySelector<HTMLElement>("section[data-st]");
    return el ? el.offsetWidth + 12 : 1;
  };

  const loaded = useRef(onLoaded);
  useEffect(() => {
    loaded.current = onLoaded;
  });
  useEffect(() => {
    if (!st.data) return;
    const t = boardTotals(st.data.stages);
    loaded.current(st.data.counts, `${t.count} bitim · ${short(t.amount)} so'm · prognoz ≈ ${short(t.weighted)}`);
  }, [st.data]);

  // fon yangilanishi: har daqiqada (panel/oyna ochiq emas, sudralmayapti, sahifa ko'rinib turibdi)
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused || !!drag;
  });
  useEffect(() => {
    const t = setInterval(() => {
      if (!pausedRef.current && !document.hidden && !document.querySelector(".mdl")) void st.reload();
    }, 60000);
    return () => clearInterval(t);
  }, [st]);

  const drop = async (code: string) => {
    const d = drag;
    setDrag(null);
    setOver("");
    if (!d || d.stage === code) return;
    await moveTo(crm, d.id, code);
    void st.reload();
  };
  const zone = (code: string): Zone => ({
    onDragOver: (e) => {
      if (!drag) return;
      e.preventDefault();
      if (over !== code) setOver(code);
    },
    onDragLeave: (e) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver((o) => (o === code ? "" : o));
    },
    onDrop: (e) => {
      e.preventDefault();
      void drop(code);
    },
  });

  const loadMore = async (code: string, off: number) => {
    try {
      const r = await api<BoardResp>(`/app/api/erp/crm/board?${qs({ pipeline: pipe, stage: code, offset: off, ...fp })}`);
      const s = r.stages.find((x) => x.code === code);
      if (!s) return;
      setExtra({ at: st.at, m: { ...more, [code]: [...(more[code] ?? []), ...s.deals] } });
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  return (
    <Loaded st={st}>
      {(r) => (
        <BoardView
          r={r}
          more={more}
          drag={drag}
          over={over}
          zone={zone}
          nameOf={(tg) => (tg != null && crm.users[tg]) || "—"}
          onOpen={crm.openDeal}
          onDrag={setDrag}
          onMore={(code, off) => void loadMore(code, off)}
          onNew={() => crm.newDeal()}
          kbRef={kb}
          active={active}
          onScroll={() => {
            const i = Math.round((kb.current?.scrollLeft ?? 0) / col());
            if (i !== active) setActive(i);
          }}
          onPick={(i) => {
            setActive(i);
            kb.current?.scrollTo({ left: i * col(), behavior: "smooth" });
          }}
        />
      )}
    </Loaded>
  );
}
