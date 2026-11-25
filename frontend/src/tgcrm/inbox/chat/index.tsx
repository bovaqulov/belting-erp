// Suhbat: xabarlar (dangasa tarix), jonli yangilanish, yuborish (matn/fayl — optimistik), javob, tahrir, o'chirish,
// uzatish, reaksiya, qadash; chat amallari (qadash, ovozsiz, arxiv), profil paneli, chat ichida qidiruv.
// O'qildi — faqat oxirgi xabar ko'ringanda (Telegram qoidasi: o'qildi belgisi soxtalashtirilmaydi).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError } from "@/shared/api/client";
import { confirmDo } from "@/shared/telegram/telegram";
import {
  assignChat,
  deleteMsgs,
  editMsg,
  forwardMsgs,
  getChat,
  getChatInfo,
  getMessages,
  lockState,
  markRead,
  releaseLock,
  pinMsg,
  reactMsg,
  sendFile,
  sendText,
  sendTyping,
  setChatArchived,
  setChatMuted,
  setChatAiOff,
  setChatPinned,
  takeLock,
  type Chat,
  type ChatInfo,
  type FileKind,
  type Msg,
  type MsgPeer,
  type StaffRow,
} from "@/tgcrm/api";
import type { LiveEvent } from "@/tgcrm/live";

import Composer from "./composer";
import AiPanel from "./ai-panel";
import CrmCard from "./crm-card";
import Forward from "./forward";
import Messages, { type Acts } from "./messages";
import Profile from "./profile";
import ChatSearch from "./search";
import { AssignButton, ChatView, DeleteDialog, type MenuItem } from "./ui";

const byId = (a: Msg, b: Msg) => a.id - b.id;
const INFO_TTL = 5 * 60_000;
// profil ma'lumoti (GetFullUser — og'irroq so'rov) — chatga qayta kirilganda 5 daqiqa qayta so'ralmaydi
const infoCache = new Map<string, { at: number; info: ChatInfo }>();

/** Serverdagilar + kutilayotganlar (pending — oxirida). Bir xil id — yangisi ustun. */
function mergeMsgs(old: Msg[], fresh: Msg[]): Msg[] {
  const map = new Map<number, Msg>();
  for (const m of old) if (!m.pending) map.set(m.id, m);
  for (const m of fresh) map.set(m.id, m);
  const pending = old.filter((m) => m.pending);
  return [...[...map.values()].sort(byId), ...pending];
}

function draftMsg(id: number, o: Partial<Msg>): Msg {
  return {
    id,
    date: new Date().toISOString(),
    out: true,
    sender_id: null,
    text: "",
    entities: [],
    media: null,
    action: null,
    reply_to: null,
    fwd: null,
    grouped_id: null,
    edit_date: null,
    views: null,
    post_author: "",
    reactions: null,
    deleted: false,
    read: false,
    sent_by: null,
    pending: "sending",
    ...o,
  };
}

/** Reaksiyani darhol ko'rsatish (server tasdiqlaguncha) */
function toggleReaction(m: Msg, emoji: string): Msg {
  const rs = (m.reactions ?? []).map((r) => (r.mine ? { ...r, mine: false, count: r.count - 1 } : r)).filter((r) => r.count > 0);
  if (emoji) {
    const i = rs.findIndex((r) => r.emoji === emoji);
    if (i >= 0) rs[i] = { ...rs[i], mine: true, count: rs[i].count + 1 };
    else rs.push({ emoji, custom: null, count: 1, mine: true });
  }
  return { ...m, reactions: rs.length ? rs : null };
}

export default function ChatScreen(p: {
  acc: number;
  peer: number;
  summary: Chat | null;
  canWrite: boolean;
  typing: string | null;
  subscribe: (fn: (e: LiveEvent) => void) => () => void;
  onBack: () => void;
  onRead: (peer: number, maxId: number) => void;
  onSent: () => void;
  /** global qidiruvdan ochilganda — shu xabarga o'tish */
  focusMsg?: number | null;
  staff: StaffRow[];
  me: number;
  isAdmin: boolean;
}) {
  const { acc, peer, focusMsg } = p;
  const [fetched, setChat] = useState<Chat | null>(null);
  // sarlavha: ro'yxatdagi yangi ma'lumot (onlayn, o'qilmagan …) + to'liq so'rov (can_write)
  const chat = useMemo<Chat | null>(
    () => (fetched && p.summary ? { ...fetched, ...p.summary, can_write: fetched.can_write } : (fetched ?? p.summary)),
    [fetched, p.summary],
  );
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [peers, setPeers] = useState<Record<string, MsgPeer>>({});
  const [staff, setStaff] = useState<Record<string, string>>({});
  const [hasMore, setHasMore] = useState(true);
  const [older, setOlder] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [reply, setReply] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<Msg | null>(null);
  const [delReq, setDelReq] = useState<Msg | null>(null);
  const [fwd, setFwd] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"profile" | "search" | "crm" | "ai" | null>(null);
  const [insert, setInsert] = useState<{ text: string; seq: number } | null>(null);
  const [info, setInfo] = useState<ChatInfo | null>(() => {
    const c = infoCache.get(`${acc}:${peer}`);
    return c && Date.now() - c.at < INFO_TTL ? c.info : null;
  });
  const [target, setTarget] = useState<{ id: number; seq: number } | null>(null);
  const [lockedBy, setLockedBy] = useState<{ name: string; until: number } | null>(null);
  const tmp = useRef(-1);
  const staffName = useCallback((tg: number) => p.staff.find((s) => s.tg_id === tg)?.name || "Boshqa xodim", [p.staff]);
  const readUpTo = useRef(p.summary?.read_inbox_max ?? 0);

  const absorb = useCallback((r: { peers: Record<string, MsgPeer>; staff?: Record<string, string> }) => {
    setPeers((x) => ({ ...x, ...r.peers }));
    if (r.staff) setStaff((x) => ({ ...x, ...r.staff }));
  }, []);

  const loadInfo = useCallback(
    (force = false) => {
      const key = `${acc}:${peer}`;
      const c = infoCache.get(key);
      if (!force && c && Date.now() - c.at < INFO_TTL) return;
      getChatInfo(acc, peer).then(
        (i) => {
          infoCache.set(key, { at: Date.now(), info: i });
          setInfo(i);
        },
        () => {},
      );
    },
    [acc, peer],
  );

  // birinchi yuklash: chat ma'lumoti + oxirgi sahifa + profil (qadalgan xabar)
  useEffect(() => {
    let alive = true;
    getChat(acc, peer).then(
      (c) => {
        if (!alive) return;
        setChat(c);
        readUpTo.current = Math.max(readUpTo.current, c.read_inbox_max);
      },
      () => {},
    );
    getMessages(acc, peer).then(
      (r) => {
        if (!alive) return;
        setMsgs(r.messages);
        setHasMore(r.has_more);
        absorb(r);
        const f = focusMsg;
        if (f) {
          if (r.messages.some((m) => m.id === f)) setTarget({ id: f, seq: 1 });
          else setNotice("Topilgan xabar eskiroq — yuqoriga aylantiring yoki chat ichida qidiring.");
        }
        setNotice(r.stale ? r.notice || "Telegram bilan aloqa yo'q — saqlangan xabarlar ko'rsatilmoqda." : "");
      },
      (e: Error) => alive && setErr(e.message),
    );
    loadInfo();
    return () => {
      alive = false;
    };
  }, [acc, peer, absorb, loadInfo, focusMsg]);

  const loadOlder = useCallback(async () => {
    if (older || !hasMore || !msgs?.length) return;
    const first = msgs.find((m) => !m.pending);
    if (!first) return;
    setOlder(true);
    try {
      const r = await getMessages(acc, peer, first.id);
      setMsgs((cur) => mergeMsgs(cur ?? [], r.messages));
      setHasMore(r.has_more && r.messages.length > 0);
      absorb(r);
      if (r.stale) setNotice(r.notice || "Telegram bilan aloqa yo'q.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setOlder(false);
    }
  }, [acc, peer, msgs, older, hasMore, absorb]);

  const msgsRef = useRef(msgs);
  const meRef = useRef(p.me);
  const staffNameRef = useRef(staffName);
  useEffect(() => {
    msgsRef.current = msgs;
    meRef.current = p.me;
    staffNameRef.current = staffName;
  });

  // ochilganda — kimdir yozayotganmi; qulf muddati o'tsa — banner yo'qoladi; chiqishda — o'z qulfimni bo'shataman
  const lockMine = useRef(0);
  useEffect(() => {
    let alive = true;
    lockState(acc, peer).then(
      (s) => alive && s.holder && !s.mine && setLockedBy({ name: s.name || "Boshqa xodim", until: Date.now() + 25_000 }),
      () => {},
    );
    return () => {
      alive = false;
      if (lockMine.current) releaseLock(acc, peer).catch(() => {});
    };
  }, [acc, peer]);
  useEffect(() => {
    if (!lockedBy) return;
    const t = window.setTimeout(() => setLockedBy(null), Math.max(0, lockedBy.until - Date.now()));
    return () => window.clearTimeout(t);
  }, [lockedBy]);

  // jonli: yangi/tahrir — oxirgi sahifani qayta olib birlashtiramiz; o'chirish/o'qildi — joyida
  const { subscribe } = p;
  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === "msg" && e.op === "delete" && e.ids) {
          const ids = new Set(e.ids);
          setMsgs((cur) => cur?.map((m) => (ids.has(m.id) ? { ...m, deleted: true } : m)) ?? cur);
          return;
        }
        if (e.type === "read" && e.outbox && e.max_id) {
          const max = e.max_id;
          setMsgs((cur) => cur?.map((m) => (m.out && m.id <= max && !m.read ? { ...m, read: true } : m)) ?? cur);
          return;
        }
        if (e.type === "msg" || e.type === "history") {
          getMessages(acc, peer).then(
            (r) => {
              // yangi "xabar qadaldi" xizmat xabari — qadalgan xabar paneli yangilanadi
              const known = new Set((msgsRef.current ?? []).map((m) => m.id));
              if (r.messages.some((m) => m.action?.type === "PinMessage" && !known.has(m.id))) loadInfo(true);
              setMsgs((cur) => mergeMsgs(cur ?? [], r.messages));
              absorb(r);
            },
            () => {},
          );
        }
        if (e.type === "status") getChat(acc, peer).then(setChat, () => {});
        if (e.type === "lock") {
          if (!e.user) setLockedBy(null);
          else if (e.user !== meRef.current) setLockedBy({ name: staffNameRef.current(e.user), until: Date.now() + 25_000 });
        }
      }),
    [subscribe, acc, peer, absorb, loadInfo],
  );
  // o'qildi: oxirgi kiruvchi xabar ko'ringanda (Messages chaqiradi), 700 ms jamlab
  const readTimer = useRef(0);
  const onSeen = useCallback(
    (maxId: number) => {
      if (maxId <= readUpTo.current) return;
      window.clearTimeout(readTimer.current);
      readTimer.current = window.setTimeout(() => {
        if (document.visibilityState !== "visible" || maxId <= readUpTo.current) return;
        readUpTo.current = maxId;
        p.onRead(peer, maxId);
        markRead(acc, peer, maxId).catch(() => {
          readUpTo.current = 0; // keyingi safar qayta urinadi
        });
      }, 700);
    },
    [acc, peer, p],
  );
  useEffect(() => () => window.clearTimeout(readTimer.current), []);

  // ------------------------------------------------------------------ yuborish
  const send = useCallback(
    async (text: string, replyTo: Msg | null, retryId?: number): Promise<void> => {
      const id = retryId ?? tmp.current--;
      setMsgs((cur) => [...(cur ?? []).filter((m) => m.id !== id), draftMsg(id, { text, reply_to: replyTo?.id ?? null })]);
      // 2 urinish: oddiy; boshqa operator yozayotgan bo'lsa (409) — so'raymiz, tasdiqlansa — qulfga qaramay (force)
      for (const force of [false, true]) {
        try {
          const r = await sendText(acc, peer, text, replyTo?.id, force);
          setMsgs((cur) => {
            const rest = (cur ?? []).filter((m) => m.id !== id);
            return r.message ? mergeMsgs(rest, [r.message]) : rest;
          });
          setNotice("");
          p.onSent();
          return;
        } catch (e) {
          if (!force && e instanceof ApiError && e.status === 409 && (await confirmDo(`${e.message} Baribir yuborasizmi?`))) continue;
          setMsgs((cur) => cur?.map((m) => (m.id === id ? { ...m, pending: "failed" } : m)) ?? cur);
          setNotice((e as Error).message);
          return;
        }
      }
    },
    [acc, peer, p],
  );

  // fayl: optimistik pufakcha (mahalliy ko'rinish + foiz); xato bo'lsa — qayta yuborish uchun fayl eslab qolinadi
  const [attach, setAttach] = useState<File | null>(null);
  const failedFiles = useRef(new Map<number, { file: File; kind: FileKind; caption: string; reply: Msg | null }>());
  const sendAttachment = useCallback(
    async (file: File, kind: FileKind, caption: string, replyTo: Msg | null, retryId?: number): Promise<void> => {
      const id = retryId ?? tmp.current--;
      const local = /^(image|video)\//.test(file.type) ? URL.createObjectURL(file) : null;
      const media = { kind: kind === "file" ? "file" : kind, name: file.name, size: file.size, local, progress: 0 };
      setMsgs((cur) => [...(cur ?? []).filter((m) => m.id !== id), draftMsg(id, { text: caption, media, reply_to: replyTo?.id ?? null })]);
      const setPct = (pct: number) => setMsgs((cur) => cur?.map((m) => (m.id === id && m.media ? { ...m, media: { ...m.media, progress: pct } } : m)) ?? cur);
      try {
        for (const force of [false, true]) {
          try {
            const r = await sendFile(acc, peer, file, file.name, { kind, caption, reply_to: replyTo?.id, force, onProgress: setPct });
            failedFiles.current.delete(id);
            setMsgs((cur) => {
              const rest = (cur ?? []).filter((m) => m.id !== id);
              return r.message ? mergeMsgs(rest, [r.message]) : rest;
            });
            setNotice("");
            p.onSent();
            return;
          } catch (e) {
            if (!force && e instanceof ApiError && e.status === 409 && (await confirmDo(`${e.message} Baribir yuborasizmi?`))) continue;
            failedFiles.current.set(id, { file, kind, caption, reply: replyTo });
            setMsgs((cur) => cur?.map((m) => (m.id === id ? { ...m, pending: "failed" } : m)) ?? cur);
            setNotice((e as Error).message);
            return;
          }
        }
      } finally {
        if (local) window.setTimeout(() => URL.revokeObjectURL(local), 60_000);
      }
    },
    [acc, peer, p],
  );

  const lastTyping = useRef(0);
  const onTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTyping.current < 4500) return;
    lastTyping.current = now;
    sendTyping(acc, peer).catch(() => {});
    if (now - lockMine.current > 10_000) {
      lockMine.current = now;
      takeLock(acc, peer).then(
        (s) => {
          if (s.holder && !s.mine) setLockedBy({ name: s.name || "Boshqa xodim", until: Date.now() + 25_000 });
        },
        () => {},
      );
    }
  }, [acc, peer]);

  // ------------------------------------------------------------------ amallar
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      setNotice(ok ?? "");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = (text: string) => {
    const m = editing;
    if (!m) return;
    setEditing(null);
    const before = m.text;
    setMsgs((cur) => cur?.map((x) => (x.id === m.id ? { ...x, text, entities: [], edit_date: new Date().toISOString() } : x)) ?? cur);
    void run(async () => {
      try {
        const r = await editMsg(acc, peer, m.id, text);
        setMsgs((cur) => mergeMsgs(cur ?? [], [r.message]));
      } catch (e) {
        setMsgs((cur) => cur?.map((x) => (x.id === m.id ? { ...x, text: before } : x)) ?? cur);
        throw e;
      }
    });
  };

  const confirmDelete = (revoke: boolean) => {
    const m = delReq;
    if (!m) return;
    void run(async () => {
      await deleteMsgs(acc, peer, [m.id], revoke);
      setMsgs((cur) => cur?.map((x) => (x.id === m.id ? { ...x, deleted: true } : x)) ?? cur);
      setDelReq(null);
    });
  };

  const doForward = (to: Chat) => {
    const m = fwd;
    if (!m) return;
    void run(
      async () => {
        await forwardMsgs(acc, peer, [m.id], to.peer_id);
        setFwd(null);
      },
      `Uzatildi: ${to.title || to.username || "chat"}`,
    );
  };

  const react = (m: Msg, emoji: string) => {
    const before = m;
    setMsgs((cur) => cur?.map((x) => (x.id === m.id ? toggleReaction(x, emoji) : x)) ?? cur);
    reactMsg(acc, peer, m.id, emoji).catch((e: Error) => {
      setMsgs((cur) => cur?.map((x) => (x.id === m.id ? before : x)) ?? cur);
      setNotice(e.message);
    });
  };

  const pin = (m: Msg) => {
    const unpin = info?.pinned_msg_id === m.id;
    void run(async () => {
      await pinMsg(acc, peer, m.id, unpin);
      const next = {
        ...(info ?? { about: "", members: null, admins: null, common_chats: null, can_write: true }),
        pinned_msg_id: unpin ? null : m.id,
        pinned: unpin ? null : m,
      };
      infoCache.set(`${acc}:${peer}`, { at: Date.now(), info: next });
      setInfo(next);
    });
  };

  const chatAct = (fn: () => Promise<unknown>, patch: Partial<Chat>) =>
    void run(async () => {
      await fn();
      setChat((c) => (c ? { ...c, ...patch } : c));
      p.onSent(); // ro'yxat yangilansin
    });

  const writable = p.canWrite && chat?.can_write !== false && chat?.kind !== "channel";
  const canAct = p.canWrite && chat?.can_write !== false;
  const why =
    !p.canWrite || chat?.can_write === false ? "Shaxsiy raqamdan faqat egasi yozadi." : chat?.kind === "channel" ? "Kanalga yozish — keyingi bosqichda." : "";

  const acts: Acts = {
    reply: writable ? setReply : undefined,
    edit: writable
      ? (m) => {
          setReply(null);
          setAttach(null);
          setEditing(m);
        }
      : undefined,
    remove: canAct ? setDelReq : undefined,
    forward: canAct ? setFwd : undefined,
    pin: canAct && chat?.kind !== "channel" ? pin : undefined,
    react: canAct ? react : undefined,
    copy: (m) => void navigator.clipboard?.writeText(m.text).catch(() => {}),
    retry: (m) => {
      const f = failedFiles.current.get(m.id);
      if (f) return void sendAttachment(f.file, f.kind, f.caption, f.reply, m.id);
      const r = msgs?.find((x) => x.id === m.reply_to) ?? null;
      void send(m.text, r, m.id);
    },
    discard: (m) => {
      failedFiles.current.delete(m.id);
      setMsgs((cur) => cur?.filter((x) => x.id !== m.id) ?? cur);
    },
    pinnedId: info?.pinned_msg_id ?? null,
  };

  const jump = (id: number) => {
    if (msgs?.some((m) => m.id === id)) {
      setTarget((t) => ({ id, seq: (t?.seq ?? 0) + 1 }));
      return true;
    }
    setNotice("Bu xabar hali yuklanmagan — yuqoriga aylantirib boring.");
    return false;
  };

  const assign = (tg: number | null) =>
    void run(async () => {
      const c = await assignChat(acc, peer, tg);
      setChat((x) => (x ? { ...x, assignee: c.assignee } : c));
      p.onSent();
    });

  const mute = (seconds: number | null) => chatAct(() => setChatMuted(acc, peer, seconds), { muted: seconds !== null });
  const menu: MenuItem[] = [
    { label: "Profil", icon: "info", on: () => setPanel("profile") },
    { label: "Qidirish", icon: "search", on: () => setPanel("search") },
    ...(chat?.kind === "user" && !chat.is_self ? [{ label: "Mijoz kartasi", icon: "briefcase", on: () => setPanel("crm") }] : []),
    { label: "AI yordamchi", icon: "sparkles", on: () => setPanel("ai") },
    ...(canAct && chat?.kind === "user" && !chat.is_self
      ? [
          {
            label: chat.ai_off ? "Bu chatda AI'ni yoqish" : "Bu chatda AI javob bermasin",
            icon: "bot",
            on: () => chatAct(() => setChatAiOff(acc, peer, !chat.ai_off), { ai_off: !chat.ai_off }),
          },
        ]
      : []),
    ...(canAct && chat
      ? [
          {
            label: chat.pinned ? "Qadashni olish" : "Qadash",
            icon: "pin",
            on: () => chatAct(() => setChatPinned(acc, peer, !chat.pinned), { pinned: !chat.pinned }),
          },
          chat.muted ? { label: "Ovozni yoqish", icon: "bell", on: () => mute(null) } : { label: "Ovozsiz (doimiy)", icon: "bell", on: () => mute(0) },
          {
            label: chat.archived ? "Arxivdan chiqarish" : "Arxivlash",
            icon: "archive",
            on: () => chatAct(() => setChatArchived(acc, peer, !chat.archived), { archived: !chat.archived }),
          },
        ]
      : []),
  ];

  return (
    <>
      <ChatView
        acc={acc}
        chat={chat}
        typing={p.typing}
        notice={notice}
        pinned={info?.pinned ?? null}
        menu={menu}
        assign={
          chat && chat.kind === "user" && !chat.is_self && canAct ? (
            <AssignButton assignee={chat.assignee ?? null} staff={p.staff} me={p.me} isAdmin={p.isAdmin} onAssign={assign} />
          ) : null
        }
        lockedBy={lockedBy?.name ?? ""}
        onBack={p.onBack}
        onProfile={() => setPanel((x) => (x === "profile" ? null : "profile"))}
        onSearch={() => setPanel("search")}
        onCrm={chat?.kind === "user" && !chat.is_self ? () => setPanel((x) => (x === "crm" ? null : "crm")) : undefined}
        onPinnedClick={() => info?.pinned_msg_id && jump(info.pinned_msg_id)}
        onDropFile={writable ? setAttach : undefined}
        messages={
          <Messages
            acc={acc}
            peer={peer}
            msgs={msgs}
            err={err}
            chat={chat}
            peers={peers}
            staff={staff}
            hasMore={hasMore}
            loadingOlder={older}
            onOlder={() => void loadOlder()}
            onSeen={onSeen}
            acts={acts}
            target={target}
          />
        }
        overlay={
          panel === "search" ? (
            <ChatSearch
              acc={acc}
              peer={peer}
              onClose={() => setPanel(null)}
              onPick={(m) => {
                if (jump(m.id)) setPanel(null);
              }}
            />
          ) : null
        }
        panel={
          panel === "ai" ? (
            <AiPanel
              acc={acc}
              peer={peer}
              canWrite={writable}
              onClose={() => setPanel(null)}
              onDraft={(text) => {
                setInsert((x) => ({ text, seq: (x?.seq ?? 0) + 1 }));
                setPanel(null);
              }}
            />
          ) : panel === "crm" ? (
            <CrmCard acc={acc} peer={peer} staff={p.staff} me={p.me} onClose={() => setPanel(null)} onChanged={p.onSent} />
          ) : panel === "profile" && chat ? (
            <Profile
              acc={acc}
              chat={chat}
              info={info}
              canAct={canAct}
              onClose={() => setPanel(null)}
              onPin={() => chatAct(() => setChatPinned(acc, peer, !chat.pinned), { pinned: !chat.pinned })}
              onArchive={() => chatAct(() => setChatArchived(acc, peer, !chat.archived), { archived: !chat.archived })}
              onMute={mute}
            />
          ) : null
        }
        composer={
          writable ? (
            <Composer
              acc={acc}
              isAdmin={p.isAdmin}
              draftKey={`tgcrm.draft.${acc}.${peer}`}
              reply={reply}
              replyName={reply ? (reply.out ? "Siz" : peers[String(reply.sender_id)]?.title || chat?.title || "") : ""}
              editing={editing}
              insert={insert}
              onEdit={saveEdit}
              onCancelEdit={() => setEditing(null)}
              attach={attach}
              onAttach={setAttach}
              onClearAttach={() => setAttach(null)}
              onCancelReply={() => setReply(null)}
              onSend={(text) => {
                void send(text, reply);
                setReply(null);
              }}
              onSendFile={(file, kind, caption) => {
                void sendAttachment(file, kind, caption, reply);
                setReply(null);
              }}
              onError={setNotice}
              onTyping={onTyping}
            />
          ) : (
            <div className="border-t border-sep bg-sec px-4 py-3 text-center text-[14px] text-hint">{why}</div>
          )
        }
      />
      {delReq ? (
        <DeleteDialog
          m={delReq}
          canRevoke={!!chat && (chat.kind === "user" || chat.kind === "bot") && !chat.is_self}
          busy={busy}
          onConfirm={confirmDelete}
          onClose={() => setDelReq(null)}
        />
      ) : null}
      {fwd ? <Forward acc={acc} busy={busy} onPick={doForward} onClose={() => setFwd(null)} /> : null}
    </>
  );
}
