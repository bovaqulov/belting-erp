// admin.html umumiy yordamchilari (sof funksiyalar, JSX'siz — Vitest uchun). Natija eski kod bilan bir xil.

/** "🤝 Sotuv" → "Sotuv" (boshidagi harf/raqam bo'lmagan belgilar va bo'shliq olib tashlanadi). */
export const noEmoji = (s: unknown): string => String(s ?? "").replace(/^[^\p{L}\p{N}]+\s*/u, "");

/** Satrdan barqaror musbat butun son (avatar rangi uchun). Eski: h = (h*31 + charCode) | 0, kod nuqtalari bo'yicha. */
export function hue(str: unknown): number {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Telegram avatar ranglari */
export const AV_COLORS = ["#e17076", "#7bc862", "#65aadd", "#a695e7", "#ee7aae", "#6ec9cb", "#faa774", "#5288c1"] as const;

export const avColor = (u: { tg_id: unknown }): string => AV_COLORS[hue(u.tg_id) % AV_COLORS.length];

/** "Ali Valiyev Karim" → "AV"; bo'sh → "?" */
export const initials = (n: unknown): string =>
  String(n || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/** "2026-11-07T14:05:33" → "2026-11-07 14:05" (eski fmtTime; HTML-escape'ni React bajaradi). */
export const fmtTime = (s: string | null | undefined): string => (s || "").replace("T", " ").slice(0, 16);

export const ROLE_NAMES: Record<string, string> = { owner: "ega", admin: "admin", employee: "xodim", pending: "kutmoqda", blocked: "bloklangan" };
export const PERM_ICONS: Record<string, string> = {
  invite: "link",
  tasks: "clipboard-check",
  reports: "chart-column",
  kick: "user-x",
  templates: "file-cog",
};
