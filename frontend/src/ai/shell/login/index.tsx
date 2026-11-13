"use client";
// Brauzerda kirish: /login/start → bot havolasi (yangi oyna) → /login/poll har 2 s (5 daqiqagacha) → sessiya. Qayta bosilsa
// ikkinchi havola va ikkinchi so'rov sikli ochilmaydi; ketganda taymerlar to'xtatiladi.
import { useEffect, useRef, useState } from "react";

import { api } from "@/shared/api/client";

import { LoginScreen, type LoginMsg } from "./ui";

const POLL_MS = 2000;
const POLL_MAX_MS = 300000;

export function LoginView({ msg, onLogin }: { msg: string; onLogin: () => void }) {
  const [lmsg, setLmsg] = useState<LoginMsg>({ kind: "text", text: msg });
  const timers = useRef(new Set<number>());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => clearTimeout(id));
  }, []);

  async function startLogin() {
    // qayta bosilsa ikkinchi havola va ikkinchi so'rov sikli ochilmasin
    if (busy) return;
    setBusy(true);
    timers.current.forEach((id) => clearTimeout(id));
    timers.current.clear();
    try {
      const { token, link } = await api<{ token: string; link: string }>("/app/api/login/start", { method: "POST" });
      window.open(link, "_blank");
      setLmsg({ kind: "link", link });
      const started = Date.now();
      const later = (fn: () => void) => {
        const id = window.setTimeout(() => {
          timers.current.delete(id);
          fn();
        }, POLL_MS);
        timers.current.add(id);
      };
      const poll = async () => {
        if (Date.now() - started > POLL_MAX_MS) {
          setLmsg({ kind: "text", text: "Vaqt tugadi, qayta urining." });
          setBusy(false);
          return;
        }
        try {
          const r = await api<{ ok?: boolean }>(`/app/api/login/poll?token=${encodeURIComponent(token)}`);
          if (r.ok) return onLogin();
        } catch (e) {
          setLmsg({ kind: "text", text: (e as Error).message });
          setBusy(false);
          return;
        }
        later(poll);
      };
      later(poll);
    } catch (e) {
      setLmsg({ kind: "text", text: (e as Error).message });
      setBusy(false);
    }
  }

  return <LoginScreen lmsg={lmsg} busy={busy} onStart={() => void startLogin()} />;
}
