// Chat ichida qidiruv — Telegram'dan (butun tarix bo'yicha), 40 tadan; natija bosilsa — xabarga o'tish.
import { useEffect, useState } from "react";

import { searchChat, type Msg, type MsgPeer } from "@/tgcrm/api";

import { SearchView } from "./ui";

export default function ChatSearch({ acc, peer, onPick, onClose }: { acc: number; peer: number; onPick: (m: Msg) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ q: string; msgs: Msg[]; peers: Record<string, MsgPeer>; more: boolean; total: number | null } | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchChat(acc, peer, { q: t }).then(
        (r) => {
          if (!alive) return;
          setRes({ q: t, msgs: [...r.messages].reverse(), peers: r.peers, more: r.has_more, total: r.total });
          setErr("");
          setLoading(false);
        },
        (e: Error) => {
          if (!alive) return;
          setErr(e.message);
          setLoading(false);
        },
      );
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [acc, peer, q]);

  const more = async () => {
    if (!res?.more || loading) return;
    const last = res.msgs[res.msgs.length - 1];
    setLoading(true);
    try {
      const r = await searchChat(acc, peer, { q: res.q, offset_id: last.id });
      setRes({ ...res, msgs: [...res.msgs, ...[...r.messages].reverse()], peers: { ...res.peers, ...r.peers }, more: r.has_more });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const shown = q.trim().length >= 2 ? res : null;
  return <SearchView q={q} res={shown} err={err} loading={loading} onQ={setQ} onPick={onPick} onMore={() => void more()} onClose={onClose} />;
}
