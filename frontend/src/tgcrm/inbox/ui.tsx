// Inbox karkasi: chap ustun (akkaunt, qidiruv, papkalar, chatlar), o'ng — suhbat yoki bo'sh holat.
// Telefon (<768): bitta ustun — suhbat ochiq bo'lsa faqat u. Kompyuter: chap 340–400px, o'ng — qolgani.
import type { ReactNode } from "react";

import type { Account, Folder, GwStatus, Who } from "@/tgcrm/api";
import { GatewayNotices, Icon } from "@/tgcrm/kit";
import { displayName } from "@/tgcrm/lib";

import type { FolderKey } from ".";

const TAB =
  "relative flex-none cursor-pointer whitespace-nowrap border-0 bg-transparent px-3 py-2.5 text-[14px] font-medium text-hint aria-pressed:text-link coarse:min-h-11";

export function InboxView(p: {
  accounts: Account[];
  acc: Account;
  gw: GwStatus;
  live: boolean;
  folders: Folder[];
  folder: FolderKey;
  who: Who;
  onWho: (w: Who) => void;
  q: string;
  hasOpen: boolean;
  onAcc: (id: number) => void;
  onFolder: (f: FolderKey) => void;
  onQ: (q: string) => void;
  onManage: () => void;
  onReport: () => void;
  list: ReactNode;
  chat: ReactNode;
}) {
  const tabs: [FolderKey, string, number][] = [
    [null, "Barchasi", 0],
    ...p.folders
      .filter((f) => f.id !== "archive")
      .map((f) => [f.id, `${f.emoticon ? `${f.emoticon} ` : ""}${f.title}`, f.unread_chats] as [FolderKey, string, number]),
  ];
  const arch = p.folders.find((f) => f.id === "archive");
  if (arch?.count) tabs.push(["archive", "Arxiv", arch.unread_chats]);
  return (
    <div className="flex h-dvh overflow-hidden bg-page">
      <aside
        className={`flex min-w-0 flex-col border-sep bg-sec md:w-[340px] md:flex-none md:border-r lg:w-[380px] xl:w-[400px] ${p.hasOpen ? "hidden md:flex" : "flex w-full"}`}
        aria-label="Chatlar"
      >
        <div className="flex items-center gap-1 px-2 pt-2">
          <a className="grid size-11 flex-none place-items-center rounded-[10px] text-link hover:bg-fill" href="/app" aria-label="Bo'limlar" title="Bo'limlar">
            <Icon n="layout-grid" />
          </a>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Akkaunt</span>
            {p.accounts.length > 1 ? (
              <select
                className="w-full cursor-pointer truncate rounded-lg border-0 bg-transparent py-2 pr-1 text-[17px] font-semibold text-fg outline-none hover:bg-fill focus-visible:bg-fill coarse:min-h-11"
                value={p.acc.id}
                onChange={(e) => p.onAcc(Number(e.target.value))}
              >
                {p.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {displayName(a)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="block truncate py-2 text-[17px] font-semibold">{displayName(p.acc)}</span>
            )}
          </label>
          {!p.live ? (
            <span className="flex-none text-[12.5px] text-hint" role="status">
              Ulanmoqda…
            </span>
          ) : null}
          <button type="button" className="icon-btn" onClick={p.onReport} aria-label="Hisobot" title="Hisobot">
            <Icon n="chart-column" />
          </button>
          <button type="button" className="icon-btn" onClick={p.onManage} aria-label="Akkauntlar" title="Akkauntlar">
            <Icon n="settings" />
          </button>
        </div>
        <label className="search mt-1">
          <Icon n="search" />
          <span className="sr-only">Qidirish</span>
          <input type="search" placeholder="Qidirish" value={p.q} onChange={(e) => p.onQ(e.target.value)} autoComplete="off" enterKeyHint="search" />
          {p.q ? (
            <button type="button" onClick={() => p.onQ("")} aria-label="Tozalash">
              <Icon n="x" cls="size-4" />
            </button>
          ) : null}
        </label>
        {!p.q ? (
          <div className="mx-4 mb-1 flex gap-1 overflow-x-auto [scrollbar-width:none]" role="radiogroup" aria-label="Mas'ul bo'yicha">
            {(
              [
                ["", "Barchasi"],
                ["mine", "Menga"],
                ["free", "Biriktirilmagan"],
                ["waiting", "Javobsiz"],
              ] as [Who, string][]
            ).map(([k, t]) => (
              <button
                key={k || "all"}
                type="button"
                role="radio"
                aria-checked={p.who === k}
                onClick={() => p.onWho(k)}
                className={`chip !py-1 text-[13px] ${p.who === k ? "on" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}
        {tabs.length > 1 && !p.q ? (
          <nav className="flex overflow-x-auto border-b border-sep px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Papkalar">
            {tabs.map(([k, t, n]) => (
              <button key={String(k)} type="button" className={TAB} aria-pressed={p.folder === k} onClick={() => p.onFolder(k)}>
                {t}
                {n ? <span className="ml-1.5 rounded-full bg-hint/25 px-1.5 text-[11.5px] tabular-nums text-sub">{n}</span> : null}
                {p.folder === k ? <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-link" aria-hidden /> : null}
              </button>
            ))}
          </nav>
        ) : null}
        <div className="[&>*]:!mx-2 [&>*]:!mt-2">
          <GatewayNotices gw={p.gw} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{p.list}</div>
      </aside>
      <section className={`min-w-0 flex-1 flex-col ${p.hasOpen ? "flex" : "hidden md:flex"}`} aria-label="Suhbat">
        {p.chat ?? (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div className="max-w-[300px] text-hint">
              <div className="mx-auto mb-3 grid size-16 place-items-center rounded-full bg-fill">
                <Icon n="message-circle" cls="!size-[30px]" />
              </div>
              Chatni tanlang — yozishma shu yerda ochiladi.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
