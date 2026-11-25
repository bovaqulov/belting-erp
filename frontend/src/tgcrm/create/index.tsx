// Yangi akkaunt kartasi: rahbar — firma yoki shaxsiy; xodim — faqat o'z shaxsiy raqami. Keyin — ulash oqimi.
import { useState } from "react";

import { useBusy } from "@/shared/ui/panel/ui";
import { createAccount, type Account, type Kind } from "@/tgcrm/api";

import { CreateView } from "./ui";

export default function CreateScreen({ isHead, onBack, onCreated }: { isHead: boolean; onBack: () => void; onCreated: (a: Account) => void }) {
  const [kind, setKind] = useState<Kind>(isHead ? "company" : "personal");
  const [title, setTitle] = useState("");
  const [err, setErr] = useState("");
  const [busy, run] = useBusy();

  const submit = () =>
    run(async () => {
      setErr("");
      if (kind === "company" && !title.trim()) return setErr("Firma raqamiga nom bering — masalan, «Sotuv bo'limi».");
      try {
        onCreated(await createAccount(kind, title.trim()));
      } catch (e) {
        setErr((e as Error).message);
      }
    });

  return (
    <CreateView
      isHead={isHead}
      kind={kind}
      title={title}
      err={err}
      busy={busy}
      onKind={setKind}
      onTitle={setTitle}
      onSubmit={() => void submit()}
      onBack={onBack}
    />
  );
}
