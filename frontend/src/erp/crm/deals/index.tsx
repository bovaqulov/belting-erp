"use client";
// Bitimlar bo'limi: Sales voronkasi kanbani, qidiruv (300ms kechikish, "/" — fokus), 300+ kun tegilmagan banneri
// ("Ko'rib chiqish" — kanban shu bitimlar bilan cheklanadi); ostida kanban, o'ngda Telegram yozishmalari (telegram/).
import { useEffect, useMemo, useRef, useState } from "react";

import { useLoad } from "@/erp/kit/ui";
import { api } from "@/erp/crm/api";
import { useCrm } from "@/erp/crm/context";
import { DEF, flt, qs, type Query } from "@/erp/crm/lib";

import { TgButton, TgPanel } from "@/erp/crm/telegram";

import { Board } from "./board";
import { DealsToolbar, IdleBanner } from "./ui";
import { MAIN } from "@/erp/crm/tw";

const IDLE_DAYS = 300;
const noop = () => {};

export function Deals({
  tick,
  paused,
}: {
  tick: number;
  /** bitim paneli yoki yangi bitim oynasi ochiq — kanban fon yangilanishi to'xtaydi */
  paused: boolean;
}) {
  const crm = useCrm();
  const { me } = crm;
  const [f, setFState] = useState<Query>(DEF);
  // CRM — faqat Sales voronkasi (ishlab chiqarish va logistika — alohida tizim)
  const pipe = crm.meta.pipelines[0]?.code ?? "main";
  const [q, setQ] = useState("");
  const qRef = useRef<HTMLInputElement>(null);
  // Telegram paneli: xl+ da doim ochiq; kichik ekranda — tugma bilan
  const [tgOpen, setTgOpen] = useState(false);
  const [tgUnread, setTgUnread] = useState(0);

  // qidiruv — 300ms kechikish bilan filtrga
  useEffect(() => {
    const t = setTimeout(() => {
      const v = q.trim();
      setFState((s) => (s.q === v ? s : { ...s, q: v }));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // "/" — qidiruvga fokus (matn maydonida emas)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? "";
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        qRef.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  // 300+ kun tegilmagan ochiq bitimlar (egasi qarori, 2026-11-12)
  const idleOn = !!f.idle;
  const banner = useLoad(
    () =>
      idleOn
        ? Promise.resolve({ total: 0 })
        : api<{ total: number }>(`/app/api/erp/crm/deals?${qs({ idle: IDLE_DAYS, limit: 1, owner: me.is_head ? "" : me.tg_id })}`).catch(() => ({ total: 0 })),
    [idleOn, tick],
  );

  const fp = useMemo(() => flt(f, me.tg_id), [f, me.tg_id]);

  return (
    <>
      <DealsToolbar
        q={q}
        qRef={qRef}
        onQ={setQ}
        onRefresh={crm.refresh}
        extra={<TgButton unread={tgUnread} onClick={() => setTgOpen(true)} />}
      />
      {idleOn || banner.data?.total ? (
        <IdleBanner
          total={banner.data?.total ?? 0}
          active={idleOn}
          onReview={() => setFState((s) => ({ ...s, idle: String(IDLE_DAYS) }))}
          onClear={() => setFState((s) => ({ ...s, idle: "" }))}
        />
      ) : null}
      <div className="flex min-h-0 flex-1">
        <main className={`${MAIN} min-w-0`}>
          <Board pipe={pipe} fp={fp} tick={tick} paused={paused} onLoaded={noop} />
        </main>
        <TgPanel open={tgOpen} tick={tick} onClose={() => setTgOpen(false)} onUnread={setTgUnread} />
      </div>
    </>
  );
}
