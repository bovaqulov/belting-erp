"use client";
// Inbox — Telegram'dagidek: chap — chatlar (akkaunt, papkalar, qidiruv), o'ng — suhbat. Telefonda bitta ustun.
// Ma'lumot: API (huquq tekshiruvi bilan); yangilanish — WebSocket hodisasi kelganda ro'yxatning birinchi sahifasi qayta
// olinadi (matn hodisada yo'q). Ochiq suhbatga hodisa `event` orqali uzatiladi.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { backOff, backShow } from "@/shared/telegram/telegram";
import {
  listDialogs,
  listFolders,
  listStaff,
  searchAll,
  type Account,
  type Chat,
  type Folder,
  type GlobalHit,
  type GwStatus,
  type StaffRow,
  type Who,
} from "@/tgcrm/api";
import { useLive, type LiveEvent } from "@/tgcrm/live";

import ChatScreen from "./chat";
import ChatList from "./chat-list";
import { InboxView } from "./ui";

const ACC_KEY = "tgcrm.acc";
const TYPING_MS = 6000;

export type FolderKey = number | "archive" | null;
export type Typing = Record<number, { action: string; user?: number; until: number }>;

function savedAcc(): number | null {
  try {
    const v = Number(localStorage.getItem(ACC_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Yangi birinchi sahifa + eski ro'yxatning undan keyingi qismi (foydalanuvchi pastga yuklagan bo'lsa yo'qolmasin) */
function merge(first: Chat[], old: Chat[] | null): Chat[] {
  if (!old?.length || !first.length) return first;
  const seen = new Set(first.map((c) => c.peer_id));
  const edge = first[first.length - 1].last_date ?? "";
  return [...first, ...old.filter((c) => !seen.has(c.peer_id) && !c.pinned && (c.last_date ?? "") < edge)];
}

export default function Inbox({
  accounts,
  gw,
  openPeer,
  onManage,
  onReport,
}: {
  accounts: Account[];
  gw: GwStatus;
  openPeer?: { acc: number; peer: number } | null;
  onManage: () => void;
  onReport: (acc: number) => void;
}) {
  const [accId, setAccId] = useState<number>(() => {
    if (openPeer && accounts.some((a) => a.id === openPeer.acc)) return openPeer.acc;
    const s = savedAcc();
    return accounts.some((a) => a.id === s) ? (s as number) : accounts[0].id;
  });
  const acc = accounts.find((a) => a.id === accId) ?? accounts[0];
  const [folder, setFolder] = useState<FolderKey>(null);
  const [who, setWho] = useState<Who>("");
  const [staff, setStaff] = useState<{ rows: StaffRow[]; me: number }>({ rows: [], me: 0 });
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [dialogs, setDialogs] = useState<Chat[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [err, setErr] = useState("");
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<number | null>(openPeer?.peer ?? null);
  const [focusMsg, setFocusMsg] = useState<number | null>(null);
  const [hits, setHits] = useState<{ q: string; rows: GlobalHit[] } | null>(null);
  const [typing, setTyping] = useState<Typing>({});
  // ochiq suhbat hodisalarga obuna bo'ladi (prop orqali emas — React effektida sinxron setState bo'lmasin)
  const listeners = useRef(new Set<(e: LiveEvent) => void>());
  const subscribe = useCallback((fn: (e: LiveEvent) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);
  const key = `${acc.id}|${folder ?? ""}|${qApplied}|${who}`;
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  });

  // qidiruv — yozib bo'lgach (250 ms)
  useEffect(() => {
    const t = window.setTimeout(() => setQApplied(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const loadFirst = useCallback(
    async (reset: boolean) => {
      const k = keyRef.current;
      try {
        const r = await listDialogs(acc.id, { folder, q: qApplied, who });
        if (k !== keyRef.current) return; // filtr o'zgargan — eski javob
        setDialogs((old) => (reset ? r.dialogs : merge(r.dialogs, old)));
        if (reset) setNext(r.next);
        setCanWrite(r.can_write);
        setErr("");
      } catch (e) {
        setErr((e as Error).message);
      }
    },
    [acc.id, folder, qApplied, who],
  );

  // xabarlar matni bo'yicha (barcha chatlar, bazadan) — 2 harfdan
  useEffect(() => {
    if (qApplied.length < 2) return;
    let alive = true;
    searchAll(acc.id, qApplied).then(
      (r) => alive && setHits({ q: qApplied, rows: r.results }),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [acc.id, qApplied]);

  // biriktirish va "kim yozmoqda" uchun xodimlar
  useEffect(() => {
    let alive = true;
    listStaff(acc.id).then(
      (r) => alive && setStaff({ rows: r.staff, me: r.me }),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [acc.id]);

  const loadFolders = useCallback(() => {
    listFolders(acc.id).then(setFolders, () => {});
  }, [acc.id]);

  useEffect(() => {
    // filtr/akkaunt almashdi — ro'yxat boshidan; setState faqat `await listDialogs` dan keyin (sinxron kaskad yo'q)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFirst(true);
  }, [loadFirst]);
  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const loadMore = useCallback(async () => {
    if (!next || more) return;
    setMore(true);
    const k = keyRef.current;
    try {
      const r = await listDialogs(acc.id, {
        folder,
        q: qApplied,
        cursor: next,
        who,
      });
      if (k !== keyRef.current) return;
      setDialogs((old) => {
        const have = new Set((old ?? []).map((c) => c.peer_id));
        return [...(old ?? []), ...r.dialogs.filter((c) => !have.has(c.peer_id))];
      });
      setNext(r.next);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setMore(false);
    }
  }, [acc.id, folder, qApplied, next, more, who]);

  // hodisalar ketma-ket keladi — ro'yxatni bir marta (400 ms) yangilaymiz
  const refreshTimer = useRef(0);
  const refreshSoon = useCallback(
    (withFolders = false) => {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        void loadFirst(false);
        if (withFolders) loadFolders();
      }, 400);
    },
    [loadFirst, loadFolders],
  );

  const live = useLive((e) => {
    if (e.account !== acc.id) return;
    if (e.type === "typing" && e.peer) {
      const peer = e.peer;
      setTyping((t) => {
        const n = { ...t };
        if (e.action === "cancel") delete n[peer];
        else
          n[peer] = {
            action: e.action ?? "typing",
            user: e.user,
            until: Date.now() + TYPING_MS,
          };
        return n;
      });
      return;
    }
    if (e.type === "folders") return loadFolders();
    if (e.type === "msg" && e.peer && e.op === "new") {
      setTyping((t) => {
        if (!t[e.peer as number]) return t;
        const n = { ...t };
        delete n[e.peer as number];
        return n;
      });
    }
    if (["msg", "dialog", "read", "dialogs", "status"].includes(e.type)) refreshSoon(e.type !== "status");
    if (e.peer && e.peer === open && ["msg", "read", "status", "history"].includes(e.type)) for (const fn of listeners.current) fn(e);
  });

  // "yozmoqda" muddati o'tganlari tozalanadi
  useEffect(() => {
    if (!Object.keys(typing).length) return;
    const t = window.setInterval(() => {
      const now = Date.now();
      setTyping((cur) => {
        const n = Object.fromEntries(Object.entries(cur).filter(([, v]) => v.until > now));
        return Object.keys(n).length === Object.keys(cur).length ? cur : n;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [typing]);

  // telefonda suhbat ochiq bo'lsa: brauzer/Android "orqaga" va Telegram BackButton — ro'yxatga qaytaradi
  const close = useCallback(() => {
    if (history.state?.tgChat) history.back();
    else setOpen(null);
  }, []);
  useEffect(() => {
    const onPop = () => setOpen((history.state?.tgChat as number | undefined) ?? null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (open === null) return;
    backShow(close);
    return () => backOff(close);
  }, [open, close]);

  const select = (peer: number, msg: number | null = null) => {
    setFocusMsg(msg);
    if (peer === open && msg === null) return;
    if (history.state?.tgChat) history.replaceState({ tgChat: peer }, "");
    else history.pushState({ tgChat: peer }, "");
    setOpen(peer);
  };

  const switchAcc = (id: number) => {
    try {
      localStorage.setItem(ACC_KEY, String(id));
    } catch {
      /* xususiy rejim */
    }
    setAccId(id);
    setFolder(null);
    setWho("");
    setQ("");
    setDialogs(null);
    setOpen(null);
  };

  // suhbat o'qildi deb belgilaganda — ro'yxatda darhol nol
  const onRead = useCallback((peer: number, maxId: number) => {
    setDialogs(
      (rows) =>
        rows?.map((c) =>
          c.peer_id === peer
            ? {
                ...c,
                unread: 0,
                read_inbox_max: Math.max(c.read_inbox_max, maxId),
              }
            : c,
        ) ?? null,
    );
  }, []);
  const onSent = useCallback(() => refreshSoon(), [refreshSoon]);

  const current = useMemo(() => dialogs?.find((c) => c.peer_id === open) ?? null, [dialogs, open]);
  const typingText = (peer: number) => typing[peer]?.action ?? null;

  return (
    <InboxView
      accounts={accounts}
      acc={acc}
      gw={gw}
      live={live}
      folders={folders}
      folder={folder}
      who={who}
      onWho={(w) => {
        setWho(w);
        setDialogs(null);
      }}
      q={q}
      hasOpen={open !== null}
      onAcc={switchAcc}
      onFolder={(f) => {
        setFolder(f);
        setDialogs(null);
      }}
      onQ={setQ}
      onManage={onManage}
      onReport={() => onReport(acc.id)}
      list={
        <ChatList
          acc={acc.id}
          me={staff.me}
          sla={acc.sla_minutes ?? 15}
          dialogs={dialogs}
          err={err}
          hasMore={!!next}
          loadingMore={more}
          open={open}
          typing={typing}
          searching={!!qApplied}
          hits={hits && hits.q === qApplied ? hits.rows : null}
          onHit={(h) => select(h.chat.peer_id, h.message.id)}
          archive={folder === "archive"}
          onOpen={select}
          onMore={() => void loadMore()}
          onRetry={() => void loadFirst(true)}
        />
      }
      chat={
        open !== null ? (
          <ChatScreen
            key={`${acc.id}:${open}:${focusMsg ?? ""}`}
            focusMsg={focusMsg}
            staff={staff.rows}
            me={staff.me}
            isAdmin={acc.role === "admin"}
            acc={acc.id}
            peer={open}
            summary={current}
            canWrite={canWrite && !["frozen", "banned", "logged_out"].includes(acc.status)}
            typing={typingText(open)}
            subscribe={subscribe}
            onBack={close}
            onRead={onRead}
            onSent={onSent}
          />
        ) : null
      }
    />
  );
}
