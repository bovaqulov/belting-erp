// Rollar (backend staff.AccessRole, /app/api/roles) — sof mantiq, JSX'siz (Vitest).

export interface PermDef {
  key: string;
  name: string;
  group: string;
}

export interface AccessRole {
  id: number;
  key: string;
  name: string;
  note: string;
  perms: string[];
  system: boolean;
  members: number[];
}

export interface RolesResp {
  roles: AccessRole[];
  perms: PermDef[];
}

/** Ruxsatlar guruhlari (katalog tartibida): [["Sotuv", [...]], ...] */
export function groupPerms(defs: PermDef[]): [string, PermDef[]][] {
  const out = new Map<string, PermDef[]>();
  for (const d of defs) out.set(d.group, [...(out.get(d.group) ?? []), d]);
  return [...out.entries()];
}

/** Ruxsatni yoqish/o'chirish: «crm.head» CRM'ga kirishsiz bo'lmaydi (yoqilsa — crm ham; crm o'chsa — rahbarlik ham).
 *  Natija katalog tartibida. */
export function togglePerm(perms: string[], key: string, on: boolean, defs: PermDef[]): string[] {
  const set = new Set(perms);
  if (on) {
    set.add(key);
    const parent = key.includes(".") ? key.split(".")[0] : null;
    if (parent && defs.some((d) => d.key === parent)) set.add(parent);
  } else {
    set.delete(key);
    for (const p of [...set]) if (p.startsWith(`${key}.`)) set.delete(p);
  }
  return defs.map((d) => d.key).filter((k) => set.has(k));
}

/** Rol nimaga ruxsat beradi — qisqa matn: «CRM, Savdo hujjatlari, …» (nomning «:» gacha qismi). */
export function permSummary(perms: string[], defs: PermDef[], max = 4): string {
  const names = defs.filter((d) => perms.includes(d.key)).map((d) => d.name.split(":")[0].trim());
  if (!names.length) return "ruxsat yo'q";
  return names.length > max ? `${names.slice(0, max).join(", ")} va yana ${names.length - max}` : names.join(", ");
}

/** Xodim rollari bo'yicha ruxsatlar birlashmasi (muharrirda «nimaga kira oladi» ko'rsatish uchun). */
export function rolesPerms(keys: string[], roles: AccessRole[]): string[] {
  return [...new Set(roles.filter((r) => keys.includes(r.key)).flatMap((r) => r.perms))];
}

/** Rol nomi tekshiruvi: bo'sh emas, boshqa rol bilan bir xil emas (katta-kichik harf farqsiz). */
export function roleNameError(name: string, roles: AccessRole[], selfId?: number): string | null {
  const n = name.trim();
  if (!n) return "Rol nomini yozing";
  if (roles.some((r) => r.id !== selfId && r.name.trim().toLowerCase() === n.toLowerCase())) return `«${n}» nomli rol bor`;
  return null;
}
