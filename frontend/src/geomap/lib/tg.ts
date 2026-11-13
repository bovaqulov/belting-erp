// GeoMap uchun Telegram yordamchilari — umumiy @/shared/telegram/telegram ustida (initData, mavzu, haptic).
import { backOff, backShow, confirmDo, haptic as hapticNotify, hapticSelect, initData, initTelegram, tg } from "@/shared/telegram/telegram";

export { backOff, backShow, confirmDo, initData, initTelegram, tg };

/** Telegram Mini App ichidamizmi (brauzer emas) — print/prompt kabi brauzer oynalari u yerda ishlamaydi. */
export const inTelegram = (): boolean => !!initData();

export function haptic(kind: "success" | "error" | "warning" | "select"): void {
  if (kind === "select") hapticSelect();
  else hapticNotify(kind);
}

/** Tashqi havola: Telegram ichida — openLink (Mini App yopilmaydi), brauzerda — yangi oyna. */
export function openExternal(url: string): void {
  const t = tg() as (ReturnType<typeof tg> & { openLink?: (u: string) => void }) | null;
  if (t?.openLink) t.openLink(url);
  else window.open(url, "_blank", "noopener");
}
