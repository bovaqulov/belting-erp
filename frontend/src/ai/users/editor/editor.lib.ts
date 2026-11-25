// Xodim tahriri — sof yordamchilar: afzalliklar boshlang'ich qiymati, telefoniya tanlovi.
import { pickValue, type AdminUser, type PhoneOpts, type PrefOpts } from "@/ai/users/users.lib";

export function initPrefs(u: AdminUser, opts: PrefOpts | null): Record<string, string> {
  if (!opts) return {};
  const p = u.prefs || {};
  const out: Record<string, string> = {};
  for (const k of Object.keys(opts.known)) out[k] = pickValue(p[k]?.value, Object.keys(opts.known[k]));
  out.note = p.note?.value || "";
  return out;
}

export type PhoneLoad = { st: "loading" } | { st: "ok"; o: PhoneOpts } | { st: "err"; msg: string };
export type PhoneSel = { yext: string; mzu: string };

export function phoneSel(u: AdminUser, o: PhoneOpts): PhoneSel {
  const cur = u.phone || {};
  return {
    yext: pickValue(cur.yeastar_ext, o.yeastar.map((x) => x.ext)),
    mzu: o.moizvonki_enabled === false ? "" : pickValue(cur.mz_user, o.moizvonki.map((x) => x.id)),
  };
}
