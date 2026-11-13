"use client";
// Audit — eski vAudit / voiceRow (admin.html 951–998): hodisalar ro'yxati, "Ovozli xabarlar" filtri (sozlamada),
// ovozni tinglash (blob URL, ketganda bo'shatiladi).
import { useEffect, useState } from "react";

import { api } from "@/shared/api/client";
import { initData } from "@/shared/telegram/telegram";
import { useAdmin } from "@/ai/shell/AdminContext";

import { voiceFetchError, voiceInfo, type AuditRow } from "./audit.lib";
import { AuditView, VoiceRowView } from "./ui";

function VoiceRow({ a }: { a: AuditRow }) {
  const { toast } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const play = async () => {
    setBusy(true);
    try {
      const id = initData();
      const r = await fetch(`/app/api/voice/${a.id}`, {
        credentials: "same-origin",
        headers: id ? { "X-Init-Data": id } : {},
      });
      if (!r.ok) throw new Error(voiceFetchError(r.status));
      setUrl(URL.createObjectURL(await r.blob()));
    } catch (e) {
      toast((e as Error).message, "err");
      setBusy(false);
    }
  };

  return <VoiceRowView a={a} d={voiceInfo(a)} busy={busy} url={url} onPlay={() => void play()} />;
}

export default function Audit() {
  const { prefs, setPref } = useAdmin();
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ audit: AuditRow[] }>("/app/api/audit")
      .then((r) => alive && setAudit(r.audit))
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AuditView
      audit={audit}
      err={err}
      onlyVoice={prefs.auditVoice}
      voiceRow={(a) => <VoiceRow key={a.id} a={a} />}
      onVoice={(v) => setPref("auditVoice", v)}
    />
  );
}
