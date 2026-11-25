"use client";
// Xodimni tahrirlash — eski openEditor (admin.html 517–604): bo'limlar, rol, rahbar, afzalliklar, telefoniya (Yeastar /
// Moizvonki ro'yxati bir marta yuklanadi), boshliq huquqlari; saqlash — buildSavePayload (users.lib).
import { useEffect, useState } from "react";

import { api } from "@/shared/api/client";
import { useAdmin } from "@/ai/shell/AdminContext";
import {
  buildSavePayload,
  EDIT_ROLES,
  initScopes,
  managerCandidates,
  pickValue,
  toggleScope,
  togglePerm,
  type AdminUser,
  type PhoneOpts,
  type ScopeState,
  type UsersCtx,
} from "@/ai/users/users.lib";

import { initPrefs, phoneSel, type PhoneLoad, type PhoneSel } from "./editor.lib";
import { EditorView, OwnerView } from "./ui";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Yeastar/Moizvonki ro'yxati (bir marta yuklanadi) — eski PHONE_OPTS
let PHONE_OPTS: PhoneOpts | null = null;

export function EditorSheet({ ctx, id }: { ctx: UsersCtx; id: number }) {
  const u = ctx.byId[id];
  if (u.role === "owner") return <OwnerView u={u} />;
  return <Editor ctx={ctx} u={u} />;
}

function Editor({ ctx, u }: { ctx: UsersCtx; u: AdminUser }) {
  const { toast, closeSheet, render } = useAdmin();
  const { users, PERMS, depts, headScopes, prefOpts } = ctx;
  const managers = managerCandidates(users, u);

  const [deps, setDeps] = useState<string[]>(() => depts.filter((d) => u.departments.includes(d.key)).map((d) => d.key));
  const [role, setRole] = useState<string>(() => ((EDIT_ROLES as readonly string[]).includes(u.role) ? u.role : EDIT_ROLES[0]));
  const [mgr, setMgr] = useState(() => pickValue(u.manager_id, managers.map((x) => x.tg_id)));
  const [scopes, setScopes] = useState<Record<string, ScopeState>>(() => initScopes(u, headScopes, Object.keys(PERMS)));
  const [prefs, setPrefs] = useState<Record<string, string>>(() => initPrefs(u, prefOpts));
  const [phone, setPhone] = useState<PhoneLoad>(() => (PHONE_OPTS ? { st: "ok", o: PHONE_OPTS } : { st: "loading" }));
  const [sel, setSel] = useState<PhoneSel>(() =>
    PHONE_OPTS ? phoneSel(u, PHONE_OPTS) : { yext: "", mzu: "" },
  );
  const [roles, setRoles] = useState<string[]>(() => u.roles ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (PHONE_OPTS) return;
    let alive = true;
    api<PhoneOpts>("/app/api/phone/options")
      .then((o) => {
        PHONE_OPTS ||= o;
        if (!alive) return;
        setSel(phoneSel(u, PHONE_OPTS));
        setPhone({ st: "ok", o: PHONE_OPTS });
      })
      .catch((e: unknown) => alive && setPhone({ st: "err", msg: errMsg(e) }));
    return () => {
      alive = false;
    };
  }, [u]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const o = phone.st === "ok" ? phone.o : null;
    const departments = depts.filter((d) => deps.includes(d.key)).map((d) => d.key);
    const body = buildSavePayload({
      departments,
      role,
      origRole: u.role,
      scopes: headScopes,
      scopeState: scopes,
      manager: mgr,
      phone: {
        loaded: !!o,
        yeastarCount: o ? o.yeastar.length : 0,
        mzCount: o ? o.moizvonki.length : 0,
        mzDisabled: o?.moizvonki_enabled === false,
        ...sel,
        orig: o ? phoneSel(u, o) : undefined,
      },
      prefs,
      roles: ctx.roles ? roles : undefined,
    });
    try {
      await api(`/app/api/users/${u.tg_id}`, { method: "POST", body });
      toast("Saqlandi");
      closeSheet();
      render();
    } catch (e) {
      toast(errMsg(e), "err");
      setSaving(false);
    }
  };

  return (
    <EditorView
      u={u}
      depts={depts}
      PERMS={PERMS}
      headScopes={headScopes}
      prefOpts={prefOpts}
      managers={managers}
      deps={deps}
      role={role}
      mgr={mgr}
      scopes={scopes}
      prefs={prefs}
      phone={phone}
      sel={sel}
      saving={saving}
      rolesData={ctx.roles}
      roles={roles}
      onRoleKey={(key, on) => setRoles((cur) => (on ? [...cur, key] : cur.filter((k) => k !== key)))}
      onDep={(key, on) => setDeps((cur) => (on ? [...cur, key] : cur.filter((k) => k !== key)))}
      onRole={setRole}
      onMgr={setMgr}
      onPref={(k, v) => setPrefs((cur) => ({ ...cur, [k]: v }))}
      onSel={(p) => setSel((c) => ({ ...c, ...p }))}
      onScope={(key, on) => setScopes((c) => ({ ...c, [key]: toggleScope(c[key], on) }))}
      onPerm={(key, perm, on) => setScopes((c) => ({ ...c, [key]: togglePerm(c[key], perm, on) }))}
      onCancel={closeSheet}
      onSave={() => void save()}
    />
  );
}
