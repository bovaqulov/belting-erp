import { useState } from "react";

import type { Chat, ChatInfo, Member, Msg, SearchFilter } from "@/tgcrm/api";
import Avatar from "@/tgcrm/avatar";
import MessageMedia from "@/tgcrm/inbox/chat/messages/media";
import { Icon } from "@/tgcrm/kit";
import { chatName, fmtPhone, listTime, mediaLabel, safeHref, statusLine } from "@/tgcrm/lib";

export type Tab = Exclude<SearchFilter, "" | "music"> | "members";

const TABS: [Tab, string][] = [
  ["photo", "Media"],
  ["file", "Fayllar"],
  ["link", "Havolalar"],
  ["voice", "Ovoz"],
];

const MUTE: [string, number | null][] = [
  ["1 soatga", 3600],
  ["8 soatga", 8 * 3600],
  ["1 kunga", 86400],
  ["Doimiy", 0],
];

function Row({ icon, label, children, href }: { icon: string; label: string; children: React.ReactNode; href?: string }) {
  const body = (
    <>
      <Icon n={icon} cls="mt-0.5 flex-none text-hint" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] break-words whitespace-pre-wrap">{children}</span>
        <span className="block text-[12.5px] text-hint">{label}</span>
      </span>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 px-4 py-2 text-fg no-underline hover:bg-fill">
      {body}
    </a>
  ) : (
    <div className="flex items-start gap-3 px-4 py-2">{body}</div>
  );
}

function firstUrl(m: Msg): string | undefined {
  if (m.media?.kind === "webpage" && typeof m.media.url === "string") return safeHref(m.media.url);
  const e = m.entities.find((x) => x.type === "url" || x.type === "texturl");
  if (!e) return undefined;
  return safeHref(e.type === "texturl" ? (e.url ?? "") : m.text.slice(e.offset, e.offset + e.length));
}

export function ProfileView(p: {
  acc: number;
  chat: Chat;
  info: ChatInfo | null;
  group: boolean;
  canAct: boolean;
  tab: Tab;
  page: { msgs: Msg[]; more: boolean; loading: boolean; err: string } | null;
  members: { rows: Member[]; limited: boolean; err: string } | null;
  onTab: (t: Tab) => void;
  onMore: () => void;
  onClose: () => void;
  onPin: () => void;
  onArchive: () => void;
  onMute: (s: number | null) => void;
}) {
  const [muteOpen, setMuteOpen] = useState(false);
  const c = p.chat;
  const tabs: [Tab, string][] = p.group ? [...TABS, ["members", "A'zolar"]] : TABS;
  const counts = [p.info?.members ? `${p.info.members} a'zo` : "", p.info?.admins ? `${p.info.admins} admin` : ""].filter(Boolean).join(" · ");
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sec" aria-label="Profil">
      <div className="flex items-center gap-2 border-b border-sep px-2 py-1.5">
        <button type="button" className="icon-btn" onClick={p.onClose} aria-label="Profilni yopish">
          <Icon n="x" />
        </button>
        <h2 className="m-0 text-[17px] font-semibold">Ma&apos;lumot</h2>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) p.onMore();
        }}
      >
        <div className="flex flex-col items-center px-4 pt-5 pb-3 text-center">
          <Avatar acc={p.acc} c={c} size={96} />
          <h3 className="m-0 mt-3 text-[20px] font-bold break-words">{chatName(c)}</h3>
          <p className="m-0 mt-0.5 text-[14px] text-hint">{statusLine(c) || " "}</p>
        </div>
        <div className="pb-2">
          {c.username ? (
            <Row icon="link" label="Username" href={`https://t.me/${c.username}`}>
              @{c.username}
            </Row>
          ) : null}
          {c.phone ? (
            <Row icon="phone" label="Telefon" href={`tel:${c.phone}`}>
              {fmtPhone(c.phone)}
            </Row>
          ) : null}
          {p.info?.about ? (
            <Row icon="info" label={c.kind === "user" ? "Bio" : "Tavsif"}>
              {p.info.about}
            </Row>
          ) : null}
          {counts ? (
            <Row icon="users" label="A'zolar">
              {counts}
            </Row>
          ) : null}
          {p.info?.common_chats ? (
            <Row icon="message-circle" label="Umumiy guruhlar">
              {p.info.common_chats}
            </Row>
          ) : null}
          {p.info === null ? <p className="m-0 px-4 py-2 text-[13px] text-hint">Ma&apos;lumot yuklanmoqda…</p> : null}
        </div>
        {p.canAct ? (
          <div className="flex flex-wrap gap-1.5 border-t border-sep px-4 py-3">
            <button type="button" className="mini inline-flex items-center gap-1" onClick={p.onPin}>
              <Icon n="pin" cls="!size-4" />
              {c.pinned ? "Qadashni olish" : "Qadash"}
            </button>
            {c.muted ? (
              <button type="button" className="mini inline-flex items-center gap-1" onClick={() => p.onMute(null)}>
                <Icon n="bell" cls="!size-4" />
                Ovozni yoqish
              </button>
            ) : (
              <button type="button" className="mini inline-flex items-center gap-1" onClick={() => setMuteOpen((v) => !v)} aria-expanded={muteOpen}>
                <Icon n="bell" cls="!size-4" />
                Ovozsiz…
              </button>
            )}
            <button type="button" className="mini inline-flex items-center gap-1" onClick={p.onArchive}>
              <Icon n="archive" cls="!size-4" />
              {c.archived ? "Arxivdan chiqarish" : "Arxivlash"}
            </button>
            {muteOpen && !c.muted ? (
              <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label="Ovozsiz qilish muddati">
                {MUTE.map(([t, s]) => (
                  <button
                    key={t}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setMuteOpen(false);
                      p.onMute(s);
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <nav className="sticky top-0 z-10 flex overflow-x-auto border-y border-sep bg-sec px-1 [scrollbar-width:none]" aria-label="Bo'limlar">
          {tabs.map(([k, t]) => (
            <button
              key={k}
              type="button"
              aria-pressed={p.tab === k}
              onClick={() => p.onTab(k)}
              className="relative flex-none cursor-pointer border-0 bg-transparent px-3 py-2.5 text-[14px] font-medium text-hint aria-pressed:text-link coarse:min-h-11"
            >
              {t}
              {p.tab === k ? <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-link" aria-hidden /> : null}
            </button>
          ))}
        </nav>
        {p.tab === "members" ? (
          <ul className="m-0 list-none p-1.5">
            {p.members === null ? <li className="p-6 text-center text-hint">Yuklanmoqda…</li> : null}
            {p.members?.err ? <li className="p-4 text-center text-hint">{p.members.err}</li> : null}
            {p.members?.rows.map((m) => (
              <li key={m.peer_id} className="flex items-center gap-3 rounded-xl px-2.5 py-1.5">
                <Avatar acc={p.acc} c={{ ...m, phone: "", deleted: false }} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{m.title || (m.username ? `@${m.username}` : `#${m.peer_id}`)}</span>
                  <span className={`block truncate text-[13px] ${m.online ? "text-link" : "text-hint"}`}>
                    {statusLine({ kind: m.kind, online: m.online, last_seen: m.last_seen, members: null, is_self: m.is_self, deleted: false }) ||
                      (m.is_self ? "siz" : "")}
                  </span>
                </span>
                {m.role ? <span className="badge info flex-none">{m.role === "owner" ? "ega" : "admin"}</span> : null}
              </li>
            ))}
            {p.members?.limited ? <li className="p-3 text-center text-[13px] text-hint">Birinchi 200 ta a&apos;zo ko&apos;rsatildi.</li> : null}
          </ul>
        ) : p.page ? (
          <>
            {p.tab === "photo" ? (
              <div className="grid grid-cols-3 gap-0.5 p-0.5">
                {p.page.msgs
                  .filter((m) => m.media)
                  .map((m) => (
                    <div key={m.id} className="aspect-square overflow-hidden [&>div]:!mb-0 [&>div]:!size-full [&>div]:!max-w-none [&>div]:!rounded-none">
                      <MessageMedia acc={p.acc} peer={c.peer_id} m={m} media={m.media ?? { kind: "photo" }} />
                    </div>
                  ))}
              </div>
            ) : (
              <ul className="m-0 list-none p-1.5">
                {p.page.msgs.map((m) => {
                  const url = p.tab === "link" ? firstUrl(m) : undefined;
                  return (
                    <li key={m.id} className="rounded-xl px-2.5 py-1.5 hover:bg-fill">
                      {p.tab === "link" ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="block text-fg no-underline">
                          <span className="block truncate text-[15px] font-medium text-link">{(m.media?.title as string) || url || "Havola"}</span>
                          <span className="line-clamp-2 block text-[13.5px] text-sub">{m.text}</span>
                        </a>
                      ) : m.media ? (
                        <MessageMedia acc={p.acc} peer={c.peer_id} m={m} media={m.media} />
                      ) : null}
                      <span className="block text-[12px] text-hint tabular-nums">{listTime(m.date)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {p.page.err ? <p className="p-4 text-center text-hint">{p.page.err}</p> : null}
            {!p.page.loading && !p.page.err && !p.page.msgs.length ? (
              <p className="p-6 text-center text-hint">
                Hech narsa yo&apos;q{p.tab === "photo" ? "" : ` (${mediaLabel({ kind: p.tab === "voice" ? "voice" : "file" }).title.toLowerCase()})`}
              </p>
            ) : null}
            {p.page.loading ? <p className="p-4 text-center text-hint">Yuklanmoqda…</p> : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}
