"use client";
// Boshliq tayinlash — eski openHeadForm: @username + bo'lim (botga hali kirmagan bo'lsa ham — kirganda boshliq bo'ladi);
// tayinlanganlarni o'chirish.
import { useEffect, useRef, useState } from "react";

import { api } from "@/shared/api/client";
import { useBusy } from "@/shared/ui/panel/ui";
import { useAdmin } from "@/ai/shell/AdminContext";
import type { PendingHead, UsersCtx } from "@/ai/users/users.lib";

import { HeadFormView } from "./ui";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function HeadFormSheet({ ctx }: { ctx: UsersCtx }) {
  const { toast, closeSheet, render } = useAdmin();
  const inp = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [dept, setDept] = useState(ctx.headScopes[0]?.key ?? "");
  const [busy, run] = useBusy();
  useEffect(() => inp.current?.focus(), []);

  const add = () =>
    run(async () => {
      const un = username.trim().replace(/^@/, "");
      if (!un) return toast("@username kiriting", "err");
      try {
        await api("/app/api/heads", { method: "POST", body: { dept, username: un } });
        toast(`@${un} boshliq qilib tayinlandi`);
        closeSheet();
        render();
      } catch (e) {
        toast(errMsg(e), "err");
      }
    });
  const del = (hid: PendingHead["id"]) =>
    run(async () => {
      try {
        await api(`/app/api/heads/${hid}`, { method: "DELETE" });
        toast("O'chirildi");
        closeSheet();
        render();
      } catch (e) {
        toast(errMsg(e), "err");
      }
    });

  return (
    <HeadFormView
      inpRef={inp}
      username={username}
      dept={dept}
      headScopes={ctx.headScopes}
      pendingHeads={ctx.pendingHeads}
      depts={ctx.depts}
      busy={busy}
      onUsername={setUsername}
      onDept={setDept}
      onAdd={() => void add()}
      onDel={(id) => void del(id)}
    />
  );
}
