// Xodim uchun AI: suhbat xulosasi, mijozga javob taklifi (yozish maydoniga qo'yiladi), erkin savol,
// avto-javob sinovi (AI yordamchi shu chatga nima yozardi — yubormasdan).
import { useState } from "react";

import { askAi, type AiMode } from "@/tgcrm/api";

import { AiPanelView } from "./ui";

export type AiKind = AiMode | "ask";

export default function AiPanel({
  acc,
  peer,
  canWrite,
  onDraft,
  onClose,
}: {
  acc: number;
  peer: number;
  canWrite: boolean;
  onDraft: (text: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ kind: AiKind; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const run = async (kind: AiKind) => {
    if (loading || (kind === "ask" && !q.trim())) return;
    setLoading(true);
    setErr("");
    try {
      const r = await askAi(acc, peer, kind === "ask" ? { question: q.trim() } : { mode: kind });
      setRes({ kind, text: r.answer });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AiPanelView
      q={q}
      res={res}
      loading={loading}
      err={err}
      canWrite={canWrite}
      onQ={setQ}
      onRun={(k) => void run(k)}
      onUse={() => res && onDraft(res.text)}
      onClose={onClose}
    />
  );
}
