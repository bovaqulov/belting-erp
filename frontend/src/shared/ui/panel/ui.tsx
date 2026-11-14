// admin.html yordamchilari JSX ko'rinishida: ic() → <Icon>, avatar() → <Avatar>, sq() → <Sq>, sectionHeader() → <SectionHeader>.
// Sof funksiyalar (hue, avColor, initials, noEmoji, fmtTime …) — ./format (shu yerdan qayta eksport).
import { useCallback, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";

import s from "./styles";
import { SvgIcon } from "@/shared/ui/svg-icon";

import { ICONS } from "@/shared/icons/lucide";
import { avColor, initials } from "./format";

export { AV_COLORS, PERM_ICONS, ROLE_NAMES, avColor, fmtTime, hue, initials, noEmoji } from "./format";
export { ICONS } from "@/shared/icons/lucide";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** ic(n, cls): noma'lum nom → "folder" (eskidagidek). className — qo'shimcha klass (masalan s.off). */
export function Icon({ name, className }: { name: string; className?: string }) {
  return <SvgIcon set={ICONS} name={name} fallback="folder" className={cx(s.i, className)} />;
}

export interface AvatarUser {
  tg_id: unknown;
  name?: string | null;
}

/** avatar(u, cls, crown): sm — kichik (eski cls="sm"); className — boshqa qo'shimcha klass. */
export function Avatar({
  u,
  sm,
  crown,
  className,
  onClick,
}: {
  u: AvatarUser;
  sm?: boolean;
  crown?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div className={cx(s.av, sm && s.sm, className)} style={{ background: avColor(u) }} onClick={onClick}>
      {initials(u.name)}
      {crown && (
        <span className={s.crown}>
          <Icon name="crown" />
        </span>
      )}
    </div>
  );
}

/** sq(icon, color). style — eski `.replace('class="sq"', 'class="sq" style="…"')` hollari uchun (katta kvadrat). */
export function Sq({ icon, color, style }: { icon: string; color?: string | null; style?: CSSProperties }) {
  return (
    <div className={s.sq} style={{ background: color || "#8e8e93", ...style }}>
      <Icon name={icon} />
    </div>
  );
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className={s.sh}>{children}</div>;
}

/** So'rov davomida qayta bosishdan himoya: `run(fn)` ishlayotgan paytda ikkinchi chaqiruv e'tiborsiz qoladi (tasdiq oynasi
 *  ochiq turganda ham); `busy` — tugmani o'chirib qo'yish uchun. */
export function useBusy(): [boolean, (fn: () => Promise<void>) => Promise<void>] {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, run];
}

/** Bosiladigan qator (<div class="item tap">) klaviaturadan ham ishlasin: Tab bilan fokus, Enter/Space — bosish. */
export function tapProps(fn: (e: MouseEvent | KeyboardEvent) => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: fn as (e: MouseEvent) => void,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      fn(e);
    },
  };
}
