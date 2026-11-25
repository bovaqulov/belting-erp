"use client";
// TelegramCRM (/app/tgcrm) — "miya": holat, so'rovlar, ekranlar (ro'yxat → akkaunt → ulash; yangi karta).
// 1-bosqich: akkauntlarni ulash/uzish (Telethon gateway orqali). Chatlar — 2–3-bosqichda (docs/tgcrm/PLAN.md).
import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/shared/api/client";
import { disableZoom, initTelegram } from "@/shared/telegram/telegram";
import { getStatus, listAccounts, type Account, type GwStatus } from "@/tgcrm/api";

import AccountScreen from "./account";
import AccountsScreen from "./accounts";
import CreateScreen from "./create";
import Inbox from "./inbox";
import Report from "./report";
import { hasSession } from "./lib";
import { GoneView, TgCrmView, type Boot } from "./ui";

export type View = { k: "inbox" } | { k: "list" } | { k: "account"; id: number } | { k: "create" } | { k: "report"; id: number };

const POLL = 5000;

export default function TgCrmApp() {
  const [boot, setBoot] = useState<Boot>({ k: "loading" });
  const [gw, setGw] = useState<GwStatus | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  // birinchi yuklashdan keyin: ulangan akkaunt bo'lsa — chatlar, aks holda — akkauntlar
  const [stack, setStack] = useState<View[] | null>(null);
  // hisobotdan — shu chatni ochib qaytish
  const [openPeer, setOpenPeer] = useState<{ acc: number; peer: number } | null>(null);
  const view: View = stack?.[stack.length - 1] ?? { k: "list" };

  const load = useCallback(async () => {
    try {
      const [st, rows] = await Promise.all([getStatus(), listAccounts()]);
      setGw(st);
      setAccounts(rows);
      setStack((s) => s ?? [rows.some((a) => hasSession(a.status)) ? { k: "inbox" } : { k: "list" }]);
      setBoot({ k: "ok" });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 401) return setBoot({ k: "login" });
      if (status === 403) return setBoot({ k: "denied", msg: (e as Error).message });
      setBoot((b) =>
        b.k === "ok"
          ? b
          : {
              k: "err",
              msg: (e as Error).message,
              net: !(e instanceof ApiError),
            },
      );
    }
  }, []);

  useEffect(() => {
    initTelegram();
    const undo = disableZoom();
    // birinchi yuklash asinxron (setState — await'dan keyin)
    void load();
    // holat (ulanish, flood, QR tasdig'i) gateway'da o'zgaradi — fon yangilanishi; sahifa yashirin bo'lsa — yo'q
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL);
    return () => {
      undo();
      window.clearInterval(t);
    };
  }, [load]);

  const go = (v: View) => setStack((s) => [...(s ?? []), v]);
  const back = () => setStack((s) => (s && s.length > 1 ? s.slice(0, -1) : [{ k: "list" }]));
  const live = accounts?.filter((a) => hasSession(a.status)) ?? [];
  const upsert = (a: Account) =>
    setAccounts((rows) => (rows ? (rows.some((r) => r.id === a.id) ? rows.map((r) => (r.id === a.id ? a : r)) : [...rows, a]) : [a]));
  const remove = (id: number) => setAccounts((rows) => rows?.filter((r) => r.id !== id) ?? null);

  let screen = null;
  if (boot.k === "ok" && gw && accounts && stack) {
    if (view.k === "inbox" && live.length)
      screen = <Inbox accounts={live} gw={gw} openPeer={openPeer} onManage={() => go({ k: "list" })} onReport={(id) => go({ k: "report", id })} />;
    else if (view.k === "inbox" || view.k === "list")
      screen = (
        <AccountsScreen
          gw={gw}
          accounts={accounts}
          onBack={stack.length > 1 ? back : undefined}
          onOpen={(id) => go({ k: "account", id })}
          onCreate={() => go({ k: "create" })}
        />
      );
    else if (view.k === "report") {
      const acc = accounts.find((a) => a.id === view.id);
      screen = acc ? (
        <Report
          account={acc}
          onBack={back}
          onOpenChat={(peer) => {
            setOpenPeer({ acc: acc.id, peer });
            back();
          }}
        />
      ) : (
        <GoneView onBack={back} />
      );
    } else if (view.k === "create")
      screen = (
        <CreateScreen
          isHead={gw.me.is_head}
          onBack={back}
          onCreated={(a) => {
            upsert(a);
            setStack((s) => [...(s ?? []).filter((v) => v.k === "inbox"), { k: "list" }, { k: "account", id: a.id }]);
          }}
        />
      );
    else {
      const acc = accounts.find((a) => a.id === view.id);
      screen = acc ? (
        <AccountScreen key={acc.id} account={acc} gw={gw} onBack={back} onChanged={upsert} onDeleted={() => (remove(acc.id), back())} />
      ) : (
        <GoneView onBack={back} />
      );
    }
  }
  return (
    <TgCrmView boot={boot} wide={view.k === "inbox" && live.length > 0} onRetry={() => void load()}>
      {screen}
    </TgCrmView>
  );
}
