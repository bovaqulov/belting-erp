"use client";
// CRM yozishmalar paneli: sotuvchining mijozlar bilan yozishmalari — Telegram (Business bot, backend: erp/crm/tg.py),
// WhatsApp va Instagram (rasmiy Meta API, erp/crm/meta.py). Kanal — tab; ro'yxat bitta so'rov (barcha kanallar), tab
// bo'yicha shu yerda filtrlanadi (tez o'tish; tashqaridan istalgan kanal chatini ochish).
// Real vaqt — WebSocket (live.ts): yangi xabar kelishi bilan ro'yxat va ochiq chat yangilanadi. WebSocket uzilganda —
// zaxira so'rov: ro'yxat har 10 s, ochiq chat har 4 s (ulangan paytda — 60 s, xavfsizlik uchun); sahifa yashirin — yo'q. Sotuvchi o'z chatiga javob yozadi
// (bot huquqi bo'lsa). Yozishmalar shaxsiy — har kim faqat o'z chatlarini ko'radi (rahbar ham). Kanban yonida (xl+) yoki o'ngdan chiquvchi panel.
import { useCallback, useEffect, useRef, useState } from "react";

import { confirm, toast } from "@/erp/kit/env";
import { Icon, Loaded, useLoad } from "@/erp/kit/ui";
import { api, post } from "@/erp/crm/api";
import { useCrm } from "@/erp/crm/context";
import { ls, qs } from "@/erp/crm/lib";

import { chOf, TG, unreadTotal, type Ch, type TgChat, type TgChats, type TgMsg, type TgThread } from "./tg.lib";
import { useTgLive } from "./live";
import { TG_W, TgConnect, TgLightbox, TgList, TgMetaOff, TgRail, TgShell, TgTabs, TgThreadView, type TgSize } from "./ui";

export { TgButton } from "./ui";

// kompyuterda panel kengligi va yig'ilgan holati — shu brauzerda eslab qolinadi (crm.chats.panel); standart — yig'ilgan (kanban keng)
type PS = { w: number; min: boolean };
function usePanelSize(): [PS, (p: Partial<PS>) => void] {
  const [s, setS] = useState<PS>(() => {
    const v = ls<Partial<PS>>("chats.panel");
    return { w: Math.min(Math.max(Number(v?.w) || TG_W.def, TG_W.lo), TG_W.hi), min: v?.min ?? true };
  });
  const set = useCallback((p: Partial<PS>) => {
    setS((o) => {
      const n = { ...o, ...p };
      ls("chats.panel", n);
      return n;
    });
  }, []);
  return [s, set];
}

/** Sahifa ko'rinib turganda har `ms` da chaqiradi */
function usePoll(fn: () => void, ms: number, on = true) {
  const f = useRef(fn);
  useEffect(() => {
    f.current = fn;
  });
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => {
      if (!document.hidden) f.current();
    }, ms);
    return () => clearInterval(t);
  }, [ms, on]);
}

export function TgPanel({
  open,
  tick,
  focus,
  onClose,
  onUnread,
}: {
  open: boolean;
  tick: number;
  /** tashqaridan chat ochish (masalan, lid kartochkasidagi «Chat»): n — har bosishda oshadi */
  focus?: { chat: number; n: number } | null;
  onClose: () => void;
  onUnread: (n: number) => void;
}) {
  const { me, newDeal } = useCrm();
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [cur, setCur] = useState<TgChat | null>(null);
  const [ch, setCh] = useState<Ch>("tg");
  const [ps, setPs] = usePanelSize();
  useEffect(() => {
    const t = setTimeout(() => setQd(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // tick — CRM yangilandi (masalan, chatdan bitim ochildi → mijoz biriktirildi)
  const list = useLoad(() => api<TgChats>(`${TG}/chats?${qs({ q: qd })}`), [qd, tick]);
  // ochiq chat yangilanishi — hodisa raqami (Thread shuni kuzatadi)
  const [bump, setBump] = useState<{ chat: number; n: number }>({ chat: 0, n: 0 });
  const live = useTgLive((e) => {
    void list.reload();
    setBump((b) => ({ chat: e.chat, n: b.n + 1 }));
  });
  usePoll(() => void list.reload(), live ? 60_000 : 10_000);
  const un = useRef(onUnread);
  useEffect(() => {
    un.current = onUnread;
  });
  useEffect(() => {
    un.current(unreadTotal(list.data, me.tg_id));
  }, [list.data, me.tg_id]);

  // tashqi so'rov: shu chatni ochish (ro'yxat yuklangach) — render paytida solishtiriladi (effektsiz, React tavsiyasi)
  const [seenFocus, setSeenFocus] = useState(0);
  if (focus && focus.n !== seenFocus && list.data) {
    const c = list.data.chats.find((x) => x.id === focus.chat);
    if (c) {
      setSeenFocus(focus.n);
      setCh(c.channel ?? "tg");
      setCur(c);
    }
  }

  // Esc — ochiq chatdan ro'yxatga
  useEffect(() => {
    if (!cur) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".mdl")) setCur(null);
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [cur]);

  const close = () => {
    setCur(null);
    onClose();
  };

  const size: TgSize = {
    w: ps.w,
    min: ps.min,
    onW: (w) => setPs({ w }),
    onMin: (min) => setPs({ min }),
    rail: (
      <TgRail
        ch={ch}
        r={list.data ?? null}
        onCh={(k) => {
          setCh(k);
          setCur(null);
        }}
        onOpen={() => setPs({ min: false })}
      />
    ),
  };

  if (cur) {
    const c = list.data?.chats.find((x) => x.id === cur.id) ?? cur; // eng yangi holat (biriktirilgan mijoz)
    return (
      <TgShell
        open={open}
        size={size}
        ch={c.channel}
        title={c.title}
        sub={[c.username && `@${c.username}`, c.customer && `mijoz: ${c.customer.name}`].filter(Boolean).join(" · ") || undefined}
        actions={
          <button type="button" className="b h-8 flex-none px-2.5 text-[13px] coarse:h-11" onClick={() => newDeal({ tg: c })} title="Shu chat bilan yangi bitim">
            <Icon n="plus" /> Bitim
          </button>
        }
        onBack={() => {
          setCur(null);
          void list.reload();
        }}
        onClose={close}
      >
        <Thread key={cur.id} chat={cur} me={me.tg_id} live={live} bump={bump.chat === cur.id ? bump.n : 0} onSent={() => void list.reload()} />
      </TgShell>
    );
  }
  const r = list.data;
  const mine = (d: TgChats): TgChats => ({ ...d, chats: d.chats.filter((x) => (x.channel ?? "tg") === ch) });
  const n = r ? mine(r).chats.length : 0;
  return (
    <TgShell open={open} size={size} ch={ch} title={chOf(ch).name} sub={r ? `${n} chat` : undefined} actions={<TgTabs ch={ch} r={r ?? null} onCh={setCh} />} onClose={close}>
      <Loaded st={list}>
        {(d) => {
          const v = mine(d);
          if (!v.chats.length && !qd) {
            if (ch === "tg" && !d.connection) return <TgConnect bot={d.bot} />;
            if (ch !== "tg" && d.channels && !d.channels[ch].enabled) return <TgMetaOff ch={ch} />;
          }
          return <TgList r={v} ch={ch} me={me.tg_id} q={q} onQ={setQ} onOpen={setCur} />;
        }}
      </Loaded>
    </TgShell>
  );
}

/** Bitim kartochkasidagi chat (mijoz yozishmasi): panelsiz yozishma va javob maydoni; yangilanish — so'rov bilan (4 s). */
export function ChatThread({ chat, onSent }: { chat: TgChat; onSent?: () => void }) {
  const { me } = useCrm();
  return <Thread key={chat.id} chat={chat} me={me.tg_id} live={false} bump={0} onSent={onSent ?? (() => {})} />;
}

function Thread({ chat, me, live, bump, onSent }: { chat: TgChat; me: number; live: boolean; bump: number; onSent: () => void }) {
  const st = useLoad(() => api<TgThread>(`${TG}/chats/${chat.id}/messages`), [chat.id]);
  usePoll(() => void st.reload(), live ? 60_000 : 4_000);
  // WebSocket: shu chatga yangi hodisa — darhol qayta olish
  const reload = useRef(st.reload);
  useEffect(() => {
    reload.current = st.reload;
  });
  useEffect(() => {
    if (bump) void reload.current();
  }, [bump]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [extra, setExtra] = useState<TgMsg[]>([]); // yuborilgan, hali ro'yxatga kelmaganlar
  const [file, setFile] = useState<File | null>(null);
  // javob (reply) beriladigan xabar
  const [replyTo, setReplyTo] = useState<TgMsg | null>(null);
  // rasm ko'rish oynasi; Esc — avval shu yopiladi (chat ochiq qoladi)
  const [view, setView] = useState<{ url: string; alt: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!view) return;
    closeRef.current?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setView(null);
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [view]);
  const [preview, setPreview] = useState<string | null>(null);
  const pick = (f: File) => {
    if (f.size > 50 * 1024 * 1024) return toast("Fayl 50 MB dan katta — yuborib bo'lmaydi", "bad");
    setFile(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
    });
  };
  const clearFile = () => {
    setFile(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  };
  const endRef = useRef<HTMLDivElement>(null);

  const msgs = st.data ? [...st.data.messages, ...extra.filter((x) => !st.data!.messages.some((m) => m.id === x.id))] : extra;
  const last = msgs.at(-1)?.id;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [last]);

  const deliver = useCallback(
    async (body: unknown, path = "send") => {
      setSending(true);
      try {
        const m = await post<TgMsg>(`${TG}/chats/${chat.id}/${path}`, body);
        setExtra((x) => [...x, m]);
        onSent();
        void st.reload();
        return true;
      } catch (e) {
        toast((e as Error).message, "bad");
        return false;
      } finally {
        setSending(false);
      }
    },
    [chat.id, onSent, st],
  );

  const send = useCallback(async () => {
    const t = text.trim();
    if (sending || (!t && !file)) return;
    if (file) {
      const fd = new FormData();
      fd.append("file", file, file.name || "rasm.png");
      if (t) fd.append("caption", t);
      if (replyTo) fd.append("reply_to", String(replyTo.id));
      if (await deliver(fd, "send-file")) {
        setText("");
        clearFile();
        setReplyTo(null);
      }
      return;
    }
    if (await deliver({ text: t, reply_to: replyTo?.id })) {
      setText("");
      setReplyTo(null);
    }
  }, [text, sending, file, deliver, replyTo]);

  const location = () => {
    if (!("geolocation" in navigator)) return toast("Brauzer joylashuvni bermaydi", "bad");
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        if (!(await confirm("Joriy joylashuvingiz mijozga yuborilsinmi?"))) return;
        if (await deliver({ latitude: Math.round(p.coords.latitude * 1e6) / 1e6, longitude: Math.round(p.coords.longitude * 1e6) / 1e6, reply_to: replyTo?.id })) setReplyTo(null);
      },
      () => toast("Joylashuvga ruxsat berilmadi — brauzer sozlamasida yoqing", "bad"),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <>
    {view ? <TgLightbox url={view.url} alt={view.alt} closeRef={closeRef} onClose={() => setView(null)} /> : null}
    <Loaded st={st}>
      {(d) => (
        <TgThreadView
          msgs={msgs}
          chat={d.chat}
          me={me}
          text={text}
          sending={sending}
          endRef={endRef}
          file={file ? { name: file.name || "rasm.png", size: file.size, preview } : null}
          onText={setText}
          onSend={() => void send()}
          onPick={pick}
          onClearFile={clearFile}
          onLocation={location}
          onView={(url, alt) => setView({ url, alt })}
          replyTo={replyTo}
          onReply={(m) => {
            setReplyTo(m);
            document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Javob matni"]')?.focus();
          }}
          onCancelReply={() => setReplyTo(null)}
        />
      )}
    </Loaded>
    </>
  );
}
