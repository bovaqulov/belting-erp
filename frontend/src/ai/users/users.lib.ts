// Xodimlar bo'limi sof mantiqi (eski admin.html vUsers/buildTree/openEditor ichidagi hisoblar) — JSX'siz, Vitest uchun.

export type Perms = Record<string, boolean>;

export interface HeadRow {
  dept_group: string;
  perms: Perms;
}

export interface UserProfile {
  summary?: string | null;
  updated?: string | null;
  stats?: {
    messages?: number;
    voice?: number;
    peak_hours?: (string | number)[];
    script?: string | null;
    words?: [string, number][];
    topics?: [string, number][];
    days?: number;
  } | null;
}

export interface PrefVal {
  value?: string | null;
  source?: string | null;
}

export interface UserPhone {
  yeastar_ext?: string | number | null;
  mz_user?: string | number | null;
  bx_user?: string | number | null;
}

export interface AdminUser {
  tg_id: number;
  name?: string | null;
  username?: string | null;
  role: string;
  departments: string[];
  heads: HeadRow[];
  manager_id?: number | null;
  last_seen?: string | null;
  profile?: UserProfile | null;
  prefs?: Record<string, PrefVal | undefined> | null;
  phone?: UserPhone | null;
}

export interface UDept {
  key: string;
  name: string;
  icon: string;
  color: string;
  group?: string;
  sees_all?: boolean;
  /** yuqori bo'lim (ai/org/dept-tree): undefined — eski ma'lumot, null — eng yuqori */
  parent?: string | null;
}

export interface PendingHead {
  id: number | string;
  username: string;
  dept_group: string;
}

export interface Invite {
  code: string;
  dept: string;
  name?: string | null;
  created_by: number;
  uses: number;
  max_uses: number;
  expires: string;
  revoked?: boolean | number | null;
  /** t.me/<bot>?start=inv_<kod> */
  link?: string;
  role?: string;
}

export interface PrefOpts {
  known: Record<string, Record<string, string>>;
  labels: Record<string, string>;
}

/** GET /app/api/users */
export interface UsersResp {
  users: AdminUser[];
  perm_names: Record<string, string>;
  depts: UDept[];
  pref_opts?: PrefOpts | null;
  pending_heads: PendingHead[];
}

/** GET /app/api/heads */
export interface HeadsResp {
  invites: Invite[];
}

export interface PhoneOpts {
  yeastar: { ext: string | number; name: string }[];
  moizvonki: { id: string | number; name: string }[];
  bitrix?: { id: string | number; name: string; inner?: string | number | null }[];
  moizvonki_enabled?: boolean;
  errors: string[];
}

export interface HeadScope {
  key: string;
  name: string;
  icon: string;
  color: string;
}

export interface TreeNode<T> {
  m: T;
  children: TreeNode<T>[];
}

/** Eski buildTree: manager_id bo'yicha daraxt (sikl uziladi); yagona boshliq bo'lsa — qolgan ildizlar unga osiladi.
 *  Bolalar: avval boshliqlar, keyin ism bo'yicha. */
export function buildTree<T extends { tg_id: number; manager_id?: number | null; name?: string | null }>(
  members: T[],
  isHead: (m: T) => boolean,
): TreeNode<T>[] {
  const ids = new Set(members.map((m) => m.tg_id));
  const parent = new Map<number, number | null>();
  for (const m of members)
    parent.set(m.tg_id, m.manager_id != null && ids.has(m.manager_id) && m.manager_id !== m.tg_id ? m.manager_id : null);
  for (const m of members) {
    const seen = new Set([m.tg_id]);
    let p = parent.get(m.tg_id) ?? null;
    while (p) {
      if (seen.has(p)) {
        parent.set(m.tg_id, null);
        break;
      }
      seen.add(p);
      p = parent.get(p) ?? null;
    }
  }
  const tops = members.filter((m) => parent.get(m.tg_id) === null && isHead(m));
  if (tops.length === 1)
    for (const m of members) if (parent.get(m.tg_id) === null && !isHead(m)) parent.set(m.tg_id, tops[0].tg_id);
  const kids = (id: number | null): T[] =>
    members
      .filter((m) => parent.get(m.tg_id) === id)
      .sort((a, b) => Number(isHead(b)) - Number(isHead(a)) || (a.name || "").localeCompare(b.name || ""));
  const walk = (m: T): TreeNode<T> => ({ m, children: kids(m.tg_id).map(walk) });
  return kids(null).map(walk);
}

export const anyPerm = (h: HeadRow): boolean => Object.values(h.perms).some(Boolean);

export const FALLBACK_DEPT = (k: string): UDept => ({ key: k, name: k, icon: "folder", color: "#8e8e93" });

export const deptOf = (depts: UDept[], k: string): UDept => depts.find((d) => d.key === k) || FALLBACK_DEPT(k);

/** Eski headScopes: sees_all bo'lmagan bo'limlar + "Butun guruh: A + B" (group !== key bo'lgan guruhlar). */
export function headScopes(depts: UDept[]): HeadScope[] {
  const groups = [...new Set(depts.filter((d) => d.group !== d.key).map((d) => d.group))];
  return [
    ...depts.filter((d) => !d.sees_all).map((d) => ({ key: d.key, name: d.name, icon: d.icon, color: d.color })),
    ...groups.map((g) => ({
      key: String(g),
      name:
        "Butun guruh: " +
        depts
          .filter((d) => d.group === g)
          .map((d) => d.name)
          .join(" + "),
      icon: "folder",
      color: "#8e8e93",
    })),
  ];
}

/** Eski headRow(u, dk): bo'lim (yoki uning guruhi) bo'yicha huquqli boshliq yozuvi. */
export function headRow(u: AdminUser, dk: string, depts: UDept[]): HeadRow | undefined {
  const g = deptOf(depts, dk).group;
  return u.heads.find((h) => (h.dept_group === dk || h.dept_group === g) && anyPerm(h));
}

/** Faol taklif havolalari. now — `new Date().toISOString().slice(0, 19)` (UTC, eskidagidek). */
export const activeInvites = (invites: Invite[], now: string): Invite[] =>
  invites.filter((i) => !i.revoked && i.expires > now && i.uses < i.max_uses);

export interface Groups {
  active: AdminUser[];
  pending: AdminUser[];
  blocked: AdminUser[];
  owner: AdminUser | undefined;
  admins: AdminUser[];
  /** rahbariyat (sees_all) bo'limi a'zolari — "rahbar" lavozimi */
  leaders: AdminUser[];
}

export function groupUsers(users: AdminUser[], depts: UDept[]): Groups {
  const active = users.filter((u) => ["owner", "admin", "employee"].includes(u.role));
  const leadKeys = depts.filter((d) => d.sees_all).map((d) => d.key);
  return {
    active,
    pending: users.filter((u) => u.role === "pending"),
    blocked: users.filter((u) => u.role === "blocked"),
    owner: users.find((u) => u.role === "owner"),
    admins: active.filter((u) => u.role === "admin"),
    leaders: active.filter((u) => u.role === "employee" && u.departments.some((k) => leadKeys.includes(k))),
  };
}

/** Bo'lim a'zolari (ega bundan mustasno) */
export const deptMembers = (active: AdminUser[], dk: string): AdminUser[] =>
  active.filter((u) => u.departments.includes(dk) && u.role !== "owner");

/** Bo'limga tegishli "botga kirmagan" boshliqlar */
export const deptPendingHeads = (ph: PendingHead[], d: UDept): PendingHead[] =>
  ph.filter((h) => h.dept_group === d.key || h.dept_group === d.group);

// ---------------- tahrir oynasi ----------------

export const EDIT_ROLES = ["employee", "admin", "pending", "blocked"] as const;

/** «Rahbari» ro'yxati: o'zidan boshqa, boshliq yozuvi bor yoki ega/admin */
export const managerCandidates = (users: AdminUser[], u: AdminUser): AdminUser[] =>
  users.filter((x) => x.tg_id !== u.tg_id && (x.heads.length > 0 || ["owner", "admin"].includes(x.role)));

export interface ScopeState {
  on: boolean;
  perms: Perms;
}

/** Har bir doira uchun boshlang'ich holat: yozuv bo'lsa — uning huquqlari, bo'lmasa hammasi belgilangan (lekin o'chiq). */
export function initScopes(u: AdminUser, scopes: HeadScope[], permKeys: string[]): Record<string, ScopeState> {
  const out: Record<string, ScopeState> = {};
  for (const sc of scopes) {
    const h = u.heads.find((x) => x.dept_group === sc.key && anyPerm(x));
    out[sc.key] = { on: !!h, perms: Object.fromEntries(permKeys.map((pk) => [pk, !h || !!h.perms[pk]])) };
  }
  return out;
}

/** Eski .hon onchange: yoqilganda birorta huquq belgilanmagan bo'lsa — hammasi belgilanadi. */
export function toggleScope(st: ScopeState, on: boolean): ScopeState {
  if (on && !Object.values(st.perms).some(Boolean))
    return { on, perms: Object.fromEntries(Object.keys(st.perms).map((k) => [k, true])) };
  return { ...st, on };
}

/** Eski .perm change: oxirgi huquq olib tashlansa — boshliqlik o'chadi. */
export function togglePerm(st: ScopeState, pk: string, checked: boolean): ScopeState {
  const perms = { ...st.perms, [pk]: checked };
  return { on: Object.values(perms).some(Boolean) ? st.on : false, perms };
}

/** select value: joriy qiymat ro'yxatda bo'lsa — o'sha, aks holda "" (birinchi variant, eskidagidek) */
export function pickValue(val: unknown, values: unknown[]): string {
  const v = String(val ?? "");
  return values.some((x) => String(x) === v) ? v : "";
}

export interface PhoneState {
  /** /app/api/phone/options yuklanib, selectlar to'ldirildi */
  loaded: boolean;
  /** yeastar variantlari soni (bo'sh birinchi variantdan tashqari) */
  yeastarCount: number;
  /** bitrix / moizvonki variantlari soni — 0 bo'lsa (API xatosi) o'sha bog'lanishga tegilmaydi */
  bitrixCount?: number;
  mzCount?: number;
  mzDisabled: boolean;
  yext: string;
  mzu: string;
  bxu: string;
  /** foydalanuvchining hozirgi (saqlangan) qiymatlari — o'zgarmagan maydon yuborilmaydi */
  orig?: { yext: string; mzu: string; bxu: string };
}

export interface SavePayload {
  role?: string;
  departments: string[];
  heads: { dept: string; perms: Perms }[];
  manager_id: number | null;
  yeastar_ext?: string | null;
  bx_user?: string | null;
  mz_user?: string | null;
  prefs: Record<string, string>;
}

/** Eski #save: rol "pending" + bo'lim tanlangan → "employee". Rol faqat o'zgarganda yuboriladi (admin kartasini
 *  ega bo'lmagan admin saqlay olsin). Telefon maydonlari HAR BIRI alohida: o'z ro'yxati yuklangan (bo'sh emas) va
 *  qiymat o'zgargan bo'lsagina — aks holda (API xatosi, ro'yxat bo'sh) mavjud bog'lanish o'chib ketmaydi. */
export function buildSavePayload(a: {
  departments: string[];
  role: string;
  /** foydalanuvchining hozirgi roli; berilmasa rol har doim yuboriladi */
  origRole?: string;
  scopes: HeadScope[];
  scopeState: Record<string, ScopeState>;
  manager: string;
  phone: PhoneState;
  prefs: Record<string, string>;
}): SavePayload {
  const role = a.role === "pending" && a.departments.length ? "employee" : a.role;
  const heads = a.scopes
    .filter((sc) => a.scopeState[sc.key]?.on)
    .map((sc) => ({ dept: sc.key, perms: { ...a.scopeState[sc.key].perms } }));
  const p = a.phone;
  const orig = p.orig ?? { yext: "", mzu: "", bxu: "" };
  const phone: Partial<SavePayload> = {};
  if (p.loaded) {
    // orig berilmagan (eski chaqiruv) — oldingidek: yuklangan ro'yxatdagi maydon har doim yuboriladi
    const changed = (k: "yext" | "mzu" | "bxu") => !p.orig || p[k] !== orig[k];
    if (p.yeastarCount > 0 && changed("yext")) phone.yeastar_ext = p.yext || null;
    if ((p.bitrixCount ?? 1) > 0 && changed("bxu")) phone.bx_user = p.bxu || null;
    if (!p.mzDisabled && (p.mzCount ?? 1) > 0 && changed("mzu")) phone.mz_user = p.mzu || null;
  }
  const out: SavePayload = {
    role,
    departments: a.departments,
    heads,
    manager_id: a.manager ? Number(a.manager) : null,
    ...phone,
    prefs: Object.fromEntries(Object.entries(a.prefs).map(([k, v]) => [k, v.trim()])),
  };
  if (a.origRole !== undefined && role === a.origRole) delete (out as Partial<SavePayload>).role;
  return out;
}

/** Eski profileSection ko'rinadimi */
export const hasProfile = (u: AdminUser): boolean => {
  const p = u.profile || {};
  const st = p.stats || {};
  return !!(st.messages || p.summary);
};

/** "12 xabar · 3 ovozli · 9, 10 · latin" */
export function activityLine(u: AdminUser): string {
  const st = u.profile?.stats || {};
  return `${st.messages || 0} xabar · ${st.voice || 0} ovozli · ${(st.peak_hours || []).join(", ") || "—"} · ${st.script || ""}`;
}

export const topWords = (u: AdminUser): string =>
  (u.profile?.stats?.words || [])
    .slice(0, 8)
    .map(([w]) => w)
    .join(", ");

/** eski USERS_CTX */
export interface UsersCtx {
  users: AdminUser[];
  byId: Record<number, AdminUser>;
  PERMS: Record<string, string>;
  depts: UDept[];
  headScopes: HeadScope[];
  pendingHeads: PendingHead[];
  prefOpts: PrefOpts | null;
}
