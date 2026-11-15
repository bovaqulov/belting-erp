"use client";
// Xodim taklif qilish: POST /app/api/invites → t.me/<bot>?start=inv_<kod> havolasi (nusxa / Telegram'da yuborish).
// Admin rolida taklif — faqat ega (backend ham tekshiradi). Yopilganda ro'yxat yangilanadi (faol havolalar).
import { useState } from "react";

import { api } from "@/shared/api/client";
import { useBusy } from "@/shared/ui/panel/ui";
import { useAdmin } from "@/ai/shell/AdminContext";
import type { Invite, UsersCtx } from "@/ai/users/users.lib";

import { InviteView, type InviteForm } from "./ui";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function InviteSheet({ ctx }: { ctx: UsersCtx }) {
  const { me, toast, render } = useAdmin();
  const depts = ctx.depts;
  // standart — oddiy bo'lim (Rahbariyat hamma narsani ko'radi — ataylab tanlansin)
  const first = depts.find((d) => !d.sees_all) ?? depts[0];
  const [v, setV] = useState<InviteForm>({ dept: first?.key ?? "", role: "employee", name: "", max_uses: "1", days: "7" });
  const [link, setLink] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const roles = me?.user.role === "owner" ? ["employee", "admin"] : ["employee"];

  const create = () =>
    run(async () => {
      try {
        const r = await api<Invite & { link: string }>("/app/api/invites", {
          method: "POST",
          body: { dept: v.dept, role: v.role, name: v.name.trim(), max_uses: Number(v.max_uses), days: Number(v.days) },
        });
        setLink(r.link);
        render(); // ro'yxatda "Faol taklif havolalari"
      } catch (e) {
        toast(errMsg(e), "err");
      }
    });
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast("Havola nusxalandi");
    } catch {
      toast("Nusxalab bo'lmadi — havolani belgilab, qo'lda nusxalang", "err");
    }
  };

  return (
    <InviteView
      v={v}
      depts={depts}
      roles={roles}
      busy={busy}
      link={link}
      onSet={(k, val) => setV((s) => ({ ...s, [k]: val }))}
      onCreate={() => void create()}
      onCopy={() => void copy()}
      onAgain={() => setLink(null)}
    />
  );
}
