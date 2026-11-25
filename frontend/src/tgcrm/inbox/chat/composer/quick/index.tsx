// Tez javoblar (shablonlar): ro'yxat (shu akkaunt + umumiy), "/" bilan qidiruv, yangi shablon, o'chirish.
// Tanlansa — matn maydonga qo'yiladi (operator ko'rib chiqib o'zi yuboradi; avtomatik yuborilmaydi).
import { useEffect, useState } from "react";

import { addQuickReply, deleteQuickReply, listQuickReplies, type QuickReply } from "@/tgcrm/api";

import { QuickView } from "./ui";

export default function QuickReplies({
  acc,
  filter,
  isAdmin,
  onPick,
  onClose,
}: {
  acc: number;
  filter: string;
  isAdmin: boolean;
  onPick: (text: string) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<QuickReply[] | null>(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<{ title: string; text: string; shared: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    listQuickReplies(acc).then(
      (r) => alive && setRows(r),
      (e: Error) => alive && setErr(e.message),
    );
    return () => {
      alive = false;
    };
  }, [acc]);

  const f = filter.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => !f || r.title.toLowerCase().includes(f) || r.text.toLowerCase().includes(f));

  return (
    <QuickView
      rows={rows === null ? null : shown}
      err={err}
      form={form}
      isAdmin={isAdmin}
      onPick={onPick}
      onClose={onClose}
      onForm={setForm}
      onSave={async () => {
        if (!form?.title.trim() || !form.text.trim()) return;
        try {
          setRows(await addQuickReply(acc, { title: form.title.trim(), text: form.text.trim(), shared: form.shared }));
          setForm(null);
          setErr("");
        } catch (e) {
          setErr((e as Error).message);
        }
      }}
      onDelete={async (id) => {
        try {
          await deleteQuickReply(acc, id);
          setRows((x) => x?.filter((r) => r.id !== id) ?? x);
        } catch (e) {
          setErr((e as Error).message);
        }
      }}
    />
  );
}
