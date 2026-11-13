"use client";
// Brauzerda kirish: Jarvis login oqimi — bot havolasi ochiladi, /start bosilgach sessiya cookie o'rnatiladi.
import { useEffect, useRef, useState } from "react";

import { loginPoll, loginStart } from "@/geomap/lib/api";

import { LoginView } from "./ui";

export default function Login({ onDone, message }: { onDone: () => void; message?: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const start = async () => {
    if (busy) return; // ikki marta bosilsa ikkita so'rov sikli ochilardi
    setBusy(true);
    setErr("");
    try {
      const { token, link } = await loginStart();
      setLink(link);
      window.open(link, "_blank", "noopener");
      if (timer.current) clearInterval(timer.current);
      let n = 0;
      timer.current = setInterval(async () => {
        if (++n > 150) {
          clearInterval(timer.current!);
          setErr("Vaqt tugadi — qaytadan urinib ko'ring");
          setLink(null);
          return;
        }
        if (await loginPoll(token)) {
          clearInterval(timer.current!);
          onDone();
        }
      }, 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return <LoginView message={message} link={link} err={err} busy={busy} onStart={() => void start()} />;
}
