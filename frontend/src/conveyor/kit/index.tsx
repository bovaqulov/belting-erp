// Lenta umumiy UI bo'laklari: c() — Tailwind uslublari (eski HTML klass nomlari bilan, kit/styles), Icon, observeResize. Telegram — @/shared/telegram.
import { ICONS } from "@/shared/icons/lucide";
import { SvgIcon } from "@/shared/ui/svg-icon";

import S from "./styles";

/** c("field col", cond && "bad") — har nom → kit/styles dagi utility'lar; noma'lum nom — uslubsiz belgi (cv-<nom>) */
export const c = (...names: (string | false | null | undefined)[]): string =>
  names
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => S[n] ?? `cv-${n}`)
    .join(" ");

/** ic(n, cls): noma'lum nom → "info" (eskidagidek) */
export function Icon({ name, className }: { name: string; className?: string }) {
  return <SvgIcon set={ICONS} name={name} fallback="info" className={c("i", className)} />;
}

/** element o'lchami (ResizeObserver, bo'lsa) va oyna o'lchami o'zgarganda; qaytaradi — uzish */
export function observeResize(el: Element, onEl: () => void, onWin: () => void = onEl): () => void {
  const ro = window.ResizeObserver ? new ResizeObserver(onEl) : undefined;
  ro?.observe(el);
  window.addEventListener("resize", onWin);
  return () => {
    ro?.disconnect();
    window.removeEventListener("resize", onWin);
  };
}

/** Bo'sh ro'yxat qatori (oynalarda: "Topilmadi", "Yuklanmoqda…") */
export function EmptyRow({ text }: { text: string }) {
  return (
    <div className={c("item")}>
      <div className={c("main s")}>{text}</div>
    </div>
  );
}
