"use client";
// Xodimni tasdiqlash — eski openApprove: bo'lim tanlanadi → xodim (employee) shu bo'limga. Ikki marta bosilsa — bittasi.
import { api } from "@/shared/api/client";
import { useBusy } from "@/shared/ui/panel/ui";
import { useAdmin } from "@/ai/shell/AdminContext";
import type { UsersCtx } from "@/ai/users/users.lib";

import { ApproveView } from "./ui";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ApproveSheet({ ctx, id }: { ctx: UsersCtx; id: number }) {
  const { toast, closeSheet, render } = useAdmin();
  const [busy, run] = useBusy();
  const pick = (dk: string) =>
    run(async () => {
      try {
        await api(`/app/api/users/${id}`, { method: "POST", body: { role: "employee", departments: [dk] } });
        toast("Tasdiqlandi");
        closeSheet();
        render();
      } catch (e) {
        toast(errMsg(e), "err");
      }
    });
  return <ApproveView u={ctx.byId[id]} depts={ctx.depts} busy={busy} onPick={(dk) => void pick(dk)} />;
}
