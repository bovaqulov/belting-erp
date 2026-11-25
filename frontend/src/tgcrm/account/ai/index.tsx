// AI yordamchi sozlamalari (akkaunt): yoqish/o'chirish, egasining ko'rsatmalari, kechikish, jimlik, soatlik limit.
import { useEffect, useState } from "react";

import { useBusy } from "@/shared/ui/panel/ui";
import { getAi, patchAi, type AiSettings } from "@/tgcrm/api";

import { AiView } from "./ui";

export default function AiSettingsPart({ acc }: { acc: number }) {
  const [data, setData] = useState<AiSettings | null>(null);
  const [draft, setDraft] = useState<Partial<AiSettings>>({});
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, run] = useBusy();
  useEffect(() => {
    getAi(acc).then(setData, (e: Error) => setErr(e.message));
  }, [acc]);

  const save = (body: Partial<AiSettings>) =>
    void run(async () => {
      try {
        setData(await patchAi(acc, body));
        setDraft({});
        setErr("");
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        setErr((e as Error).message);
      }
    });

  return <AiView data={data} draft={draft} err={err} busy={busy} saved={saved} onDraft={(d) => setDraft((x) => ({ ...x, ...d }))} onSave={save} />;
}
