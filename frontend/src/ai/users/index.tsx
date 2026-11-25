"use client";
// Xodimlar — eski vUsers (admin.html 385–619): daraxt (org chart) / ro'yxat ko'rinishi, tasdiq kutayotganlar, bloklanganlar,
// faol taklif havolalari; oynalar — approve/, head-form/, editor/.
import { useEffect, useState } from "react";

import { api } from "@/shared/api/client";
import { useBusy } from "@/shared/ui/panel/ui";
import AgentSheet from "@/ai/agents/sheet";
import { useAdmin } from "@/ai/shell/AdminContext";
import { ApproveSheet } from "@/ai/users/approve";
import { EditorSheet } from "@/ai/users/editor";
import { HeadFormSheet } from "@/ai/users/head-form";
import { InviteSheet } from "@/ai/users/invite";
import { RolesSheet } from "@/ai/users/roles";
import type { RolesResp } from "@/ai/users/roles/roles.lib";

import { activeInvites, headScopes, type HeadsResp, type Invite, type UsersCtx, type UsersResp } from "./users.lib";
import { UsersStatus, UsersView } from "./ui";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Data {
  U: UsersResp;
  invites: Invite[];
  ctx: UsersCtx;
}

export default function Users() {
  const { me, agents, prefs, setPref, openSheet, confirm, toast, render } = useAdmin();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, run] = useBusy();

  useEffect(() => {
    let alive = true;
    Promise.all([
      api<UsersResp>("/app/api/users"),
      api<HeadsResp>("/app/api/heads"),
      api<RolesResp>("/app/api/roles").catch(() => null), // rollar yuklanmasa ham xodimlar ochilsin
    ])
      .then(([U, H, R]) => {
        if (!alive) return;
        const { users, perm_names: PERMS, depts } = U;
        // backend muddatni Toshkent vaqtida zonasiz saqlaydi — UTC bilan solishtirsak 5 soat "faol" ko'rinardi
        const now = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Tashkent" }).replace(" ", "T").slice(0, 19);
        setData({
          U,
          invites: activeInvites(H.invites, now),
          ctx: {
            users,
            byId: Object.fromEntries(users.map((u) => [u.tg_id, u])),
            PERMS,
            depts,
            headScopes: headScopes(depts),
            pendingHeads: U.pending_heads,
            prefOpts: U.pref_opts || null,
            roles: R,
          },
        });
      })
      .catch((e: unknown) => alive && setErr(errMsg(e)));
    return () => {
      alive = false;
    };
  }, []);

  if (err !== null || !data) return <UsersStatus err={err} />;
  const { U, invites, ctx } = data;
  const { byId } = ctx;

  const reject = (id: number) =>
    run(async () => {
      if (!(await confirm("Rad etilsinmi?"))) return;
      try {
        await api(`/app/api/users/${id}`, { method: "POST", body: { role: "blocked" } });
        toast("Rad etildi");
        render();
      } catch (e) {
        toast(errMsg(e), "err");
      }
    });
  const revoke = (code: string) =>
    run(async () => {
      if (!(await confirm("Havola bekor qilinsinmi?"))) return;
      try {
        await api(`/app/api/invites/${encodeURIComponent(code)}/revoke`, { method: "POST" });
        toast("Havola bekor qilindi");
        render();
      } catch (e) {
        toast(errMsg(e), "err");
      }
    });

  return (
    <UsersView
      U={U}
      invites={invites}
      ctx={ctx}
      company={me?.company || "Firma"}
      agents={agents}
      isList={prefs.usersView === "list"}
      busy={busy}
      onView={(v) => setPref("usersView", v)}
      onOpen={(id) => byId[id] && openSheet(<EditorSheet ctx={ctx} id={id} />)}
      onAgent={(ag) => openSheet(<AgentSheet agent={ag} />)}
      onHeadForm={() => openSheet(<HeadFormSheet ctx={ctx} />)}
      onInvite={() => openSheet(<InviteSheet ctx={ctx} />)}
      onRoles={() => openSheet(<RolesSheet ctx={ctx} />)}
      onCopyInvite={(link) =>
        void navigator.clipboard.writeText(link).then(
          () => toast("Havola nusxalandi"),
          () => toast("Nusxalab bo'lmadi", "err"),
        )
      }
      canAdmin={!!me?.can_admin}
      onApprove={(id) => openSheet(<ApproveSheet ctx={ctx} id={id} />)}
      onReject={(id) => void reject(id)}
      onRevoke={(code) => void revoke(code)}
    />
  );
}
