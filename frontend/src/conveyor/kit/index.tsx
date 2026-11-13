// Lenta umumiy UI bo'laklari: c() — CSS Modules klasslari (eski HTML nomlari bilan), Icon, observeResize. Telegram — @/shared/telegram.
import { ICONS } from "@/shared/icons/lucide";
import { SvgIcon } from "@/shared/ui/svg-icon";

import s from "@/conveyor/conveyor.module.css";

/** c("field col", cond && "bad") — lenta.module.css klasslari (eski HTML'dagi klass nomlari bilan) */
export const c = (...names: (string | false | null | undefined)[]): string =>
  names
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => s[n] ?? n)
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
