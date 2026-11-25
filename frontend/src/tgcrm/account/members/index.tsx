// Akkauntga kirish: a'zolar va rollari (admin / operator / kuzatuvchi). Firma raqamida ro'yxat bo'sh — bo'limning hamma
// xodimi operator; birinchi a'zo qo'shilgach — faqat ro'yxatdagilar. O'zgartirish — admin.
import { useCallback, useEffect, useState } from "react";

import { confirmDo } from "@/shared/telegram/telegram";
import { useBusy } from "@/shared/ui/panel/ui";
import { getAccountMembers, setAccountMember, type AccMembers, type AccRole } from "@/tgcrm/api";

import { MembersView } from "./ui";

export default function Members({ acc, company }: { acc: number; company: boolean }) {
  const [data, setData] = useState<AccMembers | null>(null);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState<{ tg: number; role: AccRole }>({ tg: 0, role: "operator" });
  const [busy, run] = useBusy();

  const load = useCallback(() => {
    getAccountMembers(acc).then(setData, (e: Error) => setErr(e.message));
  }, [acc]);
  useEffect(() => {
    load();
  }, [load]);

  const set = (tg: number, role: AccRole | null) =>
    void run(async () => {
      if (role === null && !(await confirmDo("Xodimni akkauntdan olib tashlaysizmi? Uning chatlari bo'shaydi."))) return;
      if (company && role !== null && data?.open && !(await confirmDo("Birinchi a'zo qo'shilgach, akkauntni faqat ro'yxatdagilar ko'radi. Davom etasizmi?")))
        return;
      try {
        setData(await setAccountMember(acc, tg, role));
        setErr("");
        setPick({ tg: 0, role: "operator" });
      } catch (e) {
        setErr((e as Error).message);
      }
    });

  return (
    <MembersView
      data={data}
      err={err}
      busy={busy}
      company={company}
      pick={pick}
      onPick={setPick}
      onAdd={() => pick.tg && set(pick.tg, pick.role)}
      onRole={(tg, role) => set(tg, role)}
      onRemove={(tg) => set(tg, null)}
    />
  );
}
