// TelegramCRM ko'rinish primitivlari (faqat props → JSX). Uslub — ui-kit @utility (list, item, st, empty, btn …) va tokenlar.
import type { ReactNode } from "react";

import { ICONS } from "@/shared/icons/lucide";
import { SvgIcon } from "@/shared/ui/svg-icon";
import type { Chat, GwStatus } from "@/tgcrm/api";
import { avColor, chatName, initials, type Tone } from "@/tgcrm/lib";

export function Icon({ n, cls = "" }: { n: string; cls?: string }) {
  return <SvgIcon set={ICONS} name={n} fallback="info" className={`i size-5 ${cls}`} hidden />;
}

const UP = "grid size-11 flex-none cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent p-0 text-link hover:bg-fill [&_svg.i]:size-[22px]";

/** Sarlavha: chapda qaytish (onBack yoki bosh sahifa havolasi), katta sarlavha, o'ngda amal */
export function Top({ title, sub, onBack, home, right }: { title: string; sub?: ReactNode; onBack?: () => void; home?: string; right?: ReactNode }) {
  return (
    <header className="flex items-start gap-1 px-2 pt-2.5">
      {onBack ? (
        <button type="button" className={UP} onClick={onBack} aria-label="Orqaga" title="Orqaga">
          <Icon n="back" />
        </button>
      ) : home ? (
        <a className={UP} href={home} aria-label="Bo'limlar" title="Bo'limlar">
          <Icon n="layout-grid" />
        </a>
      ) : null}
      <h1 className="large m-0 min-w-0 flex-1 pt-0.5 pl-1">
        <span className="block truncate">{title}</span>
        {sub ? <small>{sub}</small> : null}
      </h1>
      {right ? <div className="flex flex-none items-center gap-1 self-center pr-2">{right}</div> : null}
    </header>
  );
}

export const St = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`st ${tone}`}>{children}</span>;

export const Empty = ({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) => (
  <div className="empty">
    <div className="ei">
      <Icon n={icon} />
    </div>
    <b>{title}</b>
    {children}
  </div>
);

export const Skel = ({ rows = 3 }: { rows?: number }) => (
  <div className="pt-3" aria-busy="true" aria-label="Yuklanmoqda">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="skel" />
    ))}
  </div>
);

/** Ogohlantirish qatori (sarlavha ostida): warn — sariq, bad — qizil, info — ko'k */
export function Notice({ kind, icon, children }: { kind: "warn" | "bad" | "info"; icon: string; children: ReactNode }) {
  const c = kind === "bad" ? "bg-danger/12 text-danger" : kind === "warn" ? "bg-warn/14 text-warn" : "bg-link/12 text-link";
  return (
    <div role={kind === "info" ? "status" : "alert"} className={`mx-4 mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[14px] text-pretty ${c}`}>
      <Icon n={icon} cls="mt-px flex-none" />
      <div className="min-w-0 flex-1 text-fg">{children}</div>
    </div>
  );
}

/** Avatar — bosh harflar (rasm 2-bosqichda) */
export function Av({ name, seed, big }: { name: string; seed: number; big?: boolean }) {
  const COLORS = ["#e17076", "#7bc862", "#65aadd", "#a695e7", "#ee7aae", "#6ec9cb", "#faa774", "#5288c1"];
  const ini =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <div className={`av ${big ? "!size-[76px] !text-[28px]" : ""}`} style={{ background: COLORS[Math.abs(seed) % COLORS.length] }} aria-hidden>
      {ini}
    </div>
  );
}

/** Shlyuz/sozlama ogohlantirishi — ulash va xabarlar ishlamasligi sababi */
export function GatewayNotices({ gw }: { gw: GwStatus }) {
  if (!gw.configured)
    return (
      <Notice kind="warn" icon="settings">
        Telegram API kaliti sozlanmagan. Administrator: <span className="code">TGCRM_API_ID</span> va <span className="code">TGCRM_API_HASH</span> ni backend{" "}
        <span className="code">.env.local</span> ga yozsin (my.telegram.org → API development tools).
      </Notice>
    );
  if (!gw.gateway)
    return (
      <Notice kind="bad" icon="circle-alert">
        Telegram shlyuzi ishlamayapti — ulash va xabarlar vaqtincha ishlamaydi. Administrator: <span className="code">manage.py tg_gateway</span>.
      </Notice>
    );
  return null;
}

export function ChatAvatar({
  c,
  size = 54,
}: {
  c: Pick<Chat, "peer_id" | "title" | "username" | "phone" | "is_self" | "deleted" | "online" | "kind">;
  size?: number;
}) {
  return (
    <span className="relative flex-none" style={{ width: size, height: size }} aria-hidden>
      <span
        className="grid size-full place-items-center rounded-full font-semibold text-white"
        style={{
          background: c.is_self ? "#3e88f7" : avColor(c.peer_id),
          fontSize: Math.round(size * 0.38),
        }}
      >
        {c.is_self ? <Icon n="pin" cls="!size-[45%]" /> : initials(chatName(c))}
      </span>
      {c.online && c.kind === "user" ? <span className="absolute right-0 bottom-0 size-3.5 rounded-full border-2 border-sec bg-ok" /> : null}
    </span>
  );
}

/** ✓ — yuborildi, ✓✓ — o'qildi */
export function Ticks({ read, cls = "" }: { read: boolean; cls?: string }) {
  return (
    <span className={`relative inline-block h-3 flex-none ${read ? "w-[18px]" : "w-3"} ${cls}`} aria-label={read ? "O'qildi" : "Yuborildi"} role="img">
      <Icon n="check" cls="absolute top-0 left-0 !size-3 [stroke-width:3]" />
      {read ? <Icon n="check" cls="absolute top-0 left-[5px] !size-3 [stroke-width:3]" /> : null}
    </span>
  );
}

/** Modal oyna: telefonda — pastdan to'liq, kompyuterda — markazda */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-70 flex items-end justify-center bg-black/45 md:items-center" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-sec pb-[var(--safe-b)] shadow-xl md:max-w-[440px] md:rounded-2xl"
      >
        <div className="flex items-center gap-2 border-b border-sep px-4 py-2.5">
          <h2 className="m-0 flex-1 text-[17px] font-semibold">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Yopish">
            <Icon n="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
