"use client";
// Rollar: ro'yxat (nimaga ruxsat, nechta xodimda) → tahrir (nom, izoh, ruxsatlar guruhlab, kimlarda bor).
// O'zgartirish — faqat ega/admin (backend ham tekshiradi); tizim rollari o'chirilmaydi. Saqlangach Xodimlar yangilanadi.
import { useCallback, useEffect, useState } from "react";

import { api } from "@/shared/api/client";
import s from "@/shared/ui/panel/styles";
import { Avatar, Icon, SectionHeader, Sq, useBusy } from "@/shared/ui/panel/ui";
import { useAdmin } from "@/ai/shell/AdminContext";
import type { UsersCtx } from "@/ai/users/users.lib";

import { groupPerms, permSummary, roleNameError, togglePerm, type AccessRole, type RolesResp } from "./roles.lib";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
type Draft = { id?: number; name: string; note: string; perms: string[]; system: boolean; members: number[] };

export function RolesSheet({ ctx }: { ctx: UsersCtx }) {
  const { me, toast, confirm, render } = useAdmin();
  const canEdit = !!me?.can_admin;
  const [data, setData] = useState<RolesResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, run] = useBusy();

  const load = useCallback(
    () =>
      api<RolesResp>("/app/api/roles")
        .then((d) => (setData(d), setErr(null)))
        .catch((e: unknown) => setErr(errMsg(e))),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (err) return <div className={s.err}>{err}</div>;
  if (!data) return <div className={s.empty}>Yuklanmoqda…</div>;
  const defs = data.perms;

  const open = (r?: AccessRole) =>
    setEdit(r ? { ...r, perms: [...r.perms] } : { name: "", note: "", perms: [], system: false, members: [] });

  const save = () =>
    run(async () => {
      if (!edit) return;
      const bad = roleNameError(edit.name, data.roles, edit.id);
      if (bad) return toast(bad, "err");
      try {
        const body = { name: edit.name.trim(), note: edit.note.trim(), perms: edit.perms };
        await api(edit.id ? `/app/api/roles/${edit.id}` : "/app/api/roles", { method: "POST", body });
        toast("Saqlandi");
        setEdit(null);
        await load();
        render();
      } catch (e) {
        toast(errMsg(e), "err");
      }
    });

  const remove = () =>
    run(async () => {
      if (!edit?.id) return;
      const who = edit.members.length ? ` U ${edit.members.length} xodimdan olinadi.` : "";
      if (!(await confirm(`«${edit.name}» roli o'chirilsinmi?${who}`))) return;
      try {
        await api(`/app/api/roles/${edit.id}/delete`, { method: "POST" });
        toast("O'chirildi");
        setEdit(null);
        await load();
        render();
      } catch (e) {
        toast(errMsg(e), "err");
      }
    });

  if (edit) {
    const ro = !canEdit;
    return (
      <>
        <button className={s.lnk} style={{ marginInline: 16, minHeight: 44 }} onClick={() => setEdit(null)}>
          <Icon name="chevron-left" /> Rollar
        </button>
        <SectionHeader>{edit.id ? "Rol" : "Yangi rol"}</SectionHeader>
        <div className={`${s.list} ${s.plain}`}>
          <div className={s.field}>
            <label htmlFor="role-name">Nomi</label>
            <input
              id="role-name"
              value={edit.name}
              readOnly={ro}
              maxLength={80}
              placeholder="Masalan: Kassir"
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </div>
          <div className={s.field}>
            <label htmlFor="role-note">Izoh</label>
            <input
              id="role-note"
              value={edit.note}
              readOnly={ro}
              maxLength={240}
              placeholder="Kim uchun, nima qiladi"
              onChange={(e) => setEdit({ ...edit, note: e.target.value })}
            />
          </div>
        </div>
        {groupPerms(defs).map(([g, ps]) => (
          <div key={g}>
            <SectionHeader>{g}</SectionHeader>
            <div className={s.list}>
              {ps.map((p) => (
                <label key={p.key} className={`${s.item} ${ro ? "" : s.tap}`}>
                  <div className={s.main}>
                    <div className={s.t} style={{ whiteSpace: "normal" }}>
                      {p.name.split(":")[0]}
                    </div>
                    {p.name.includes(":") ? (
                      <div className={s.s} style={{ whiteSpace: "normal" }}>
                        {cap(p.name.split(":").slice(1).join(":").trim())}
                      </div>
                    ) : null}
                  </div>
                  <input
                    type="checkbox"
                    className={s.sw}
                    checked={edit.perms.includes(p.key)}
                    disabled={ro}
                    onChange={(e) => setEdit({ ...edit, perms: togglePerm(edit.perms, p.key, e.target.checked, defs) })}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className={s.sf}>
          Xodimning huquqi = bo&apos;limidan kelgan huquq + rollari. Ega, adminlar va Rahbariyat bo&apos;limi — hammasiga kiradi.
        </div>
        {edit.id ? (
          <>
            <SectionHeader>Kimlarda bor · {edit.members.length}</SectionHeader>
            <div className={s.list}>
              {edit.members.length ? (
                edit.members.map((id) => {
                  const u = ctx.byId[id];
                  return (
                    <div key={id} className={s.item}>
                      {u ? <Avatar u={u} /> : null}
                      <div className={s.main}>
                        <div className={s.t}>{u?.name || id}</div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={s.item}>
                  <div className={`${s.main} ${s.s}`}>Hali hech kimda yo&apos;q — xodim kartasida «Rollar» bo&apos;limidan beriladi.</div>
                </div>
              )}
            </div>
          </>
        ) : null}
        {canEdit ? (
          <div className={s.actions}>
            {edit.id && !edit.system ? (
              <button className={`${s.btn} ${s.sec} ${s.danger}`} disabled={busy} onClick={() => void remove()}>
                O&apos;chirish
              </button>
            ) : null}
            <button className={s.btn} disabled={busy} onClick={() => void save()}>
              {busy ? "Saqlanmoqda…" : "Saqlash"}
            </button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <SectionHeader>Rollar</SectionHeader>
      <div className={s.list}>
        {data.roles.map((r) => (
          <div
            key={r.id}
            className={`${s.item} ${s.tap}`}
            role="button"
            tabIndex={0}
            onClick={() => open(r)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open(r))}
          >
            <Sq icon={r.perms.includes("crm.head") || r.key === "rahbariyat" ? "crown" : "shield-check"} color="#8b6cf0" />
            <div className={s.main}>
              <div className={s.t}>{r.name}</div>
              <div className={s.s}>{permSummary(r.perms, defs)}</div>
            </div>
            <span className={s.s} title="Xodimlar soni">
              {r.members.length ? `${r.members.length} xodim` : ""}
            </span>
            <span className={s.chev}>
              <Icon name="chevron-right" />
            </span>
          </div>
        ))}
      </div>
      <div className={s.sf}>Rol — ruxsatlar to&apos;plami. Xodimga bir nechta rol berish mumkin (xodim kartasi → «Rollar»).</div>
      {canEdit ? (
        <div className={s.actions}>
          <button className={s.btn} onClick={() => open()}>
            <Icon name="plus" /> Yangi rol
          </button>
        </div>
      ) : null}
    </>
  );
}
