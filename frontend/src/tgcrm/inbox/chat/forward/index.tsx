// Uzatish: manzil chatni tanlash (shu akkaunt chatlari, qidiruv bilan).
import { useEffect, useState } from "react";

import { listDialogs, type Chat } from "@/tgcrm/api";

import { ForwardView } from "./ui";

export default function Forward({ acc, busy, onPick, onClose }: { acc: number; busy: boolean; onPick: (c: Chat) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Chat[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      listDialogs(acc, { q: q.trim() }).then(
        (r) => alive && setRows(r.dialogs.filter((c) => c.kind !== "channel")),
        (e: Error) => alive && setErr(e.message),
      );
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [acc, q]);
  return <ForwardView acc={acc} q={q} rows={rows} err={err} busy={busy} onQ={setQ} onPick={onPick} onClose={onClose} />;
}
