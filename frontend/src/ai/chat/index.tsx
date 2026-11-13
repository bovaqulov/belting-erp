"use client";
// Jarvis → Chat: istalgan agent (bo'lim, xodim, mustaqil, sub-agent) bilan veb'da yozishish. Agent tanlanadi; har agent bilan alohida
// suhbat (session_id). Javob oqim bilan keladi: matn bo'lak-bo'lak, ishlatilgan vositalar belgisi. API — stream.ts.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { useAdmin } from "@/ai/shell/AdminContext";

import { applyEvent, chatError, defaultAgent, msgId, type ChatMsg } from "./chat.lib";
import { streamChat } from "./stream";
import { ChatView } from "./ui";

export default function Chat() {
  const { me, agents, reloadOverview } = useAdmin();
  const [agentKey, setAgentKey] = useState<string | null>(null);
  const [byDept, setByDept] = useState<Record<string, ChatMsg[]>>({});
  const [sessions, setSessions] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const ta = useRef<HTMLTextAreaElement | null>(null);

  // bo'limlar (agentlar) ro'yxati — boshqa tab ochilmagan bo'lsa ham
  useEffect(() => {
    if (!agents.length) void reloadOverview().catch(() => {});
  }, [agents.length, reloadOverview]);
  const cur = agentKey ?? defaultAgent(agents, me?.user.departments);
  const d = agents.find((x) => x.key === cur);
  const msgs = (cur && byDept[cur]) || [];

  // yangi xabar — pastga
  const last = msgs[msgs.length - 1];
  useEffect(() => {
    if (msgs.length) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }, [msgs.length, last?.text.length]);

  // matn maydoni balandligi — matnga qarab (160px gacha)
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => () => abort.current?.abort(), []);

  async function send(message: string) {
    const q = message.trim();
    if (!q || !cur || busy) return;
    const k = cur;
    const aid = msgId();
    const upd = (f: (m: ChatMsg[]) => ChatMsg[]) => setByDept((all) => ({ ...all, [k]: f(all[k] ?? []) }));
    upd((m) => [
      ...m,
      { id: msgId(), role: "user", agent: k, text: q, tools: [] },
      { id: aid, role: "agent", agent: k, text: "", tools: [], pending: true },
    ]);
    setText("");
    setBusy(true);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      await streamChat(
        { agent: k, message: q, session_id: sessions[k] },
        (ev) => {
          if (ev.type === "done" && ev.session_id) setSessions((x) => ({ ...x, [k]: ev.session_id as string }));
          upd((m) => applyEvent(m, aid, ev));
        },
        ctl.signal,
      );
    } catch (e) {
      upd((m) => applyEvent(m, aid, { type: "error", detail: chatError(e) }));
    } finally {
      abort.current = null;
      setBusy(false);
      ta.current?.focus();
    }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(text);
    }
  };

  const reset = () => {
    if (!cur) return;
    abort.current?.abort();
    setByDept((all) => ({ ...all, [cur]: [] }));
    setSessions((x) => {
      const n = { ...x };
      delete n[cur];
      return n;
    });
  };

  return (
    <ChatView
      agents={agents}
      cur={cur}
      d={d}
      msgs={msgs}
      text={text}
      busy={busy}
      taRef={ta}
      onAgent={setAgentKey}
      onReset={reset}
      onSend={(q) => void send(q)}
      onText={setText}
      onKey={onKey}
      onStop={() => abort.current?.abort()}
    />
  );
}
