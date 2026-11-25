import { useState, type DragEvent, type ReactNode } from "react";

import type { Chat, Msg, StaffRow } from "@/tgcrm/api";
import Avatar from "@/tgcrm/avatar";
import { Icon, Sheet } from "@/tgcrm/kit";
import { TYPING_TEXT, chatName, mediaLabel, statusLine } from "@/tgcrm/lib";

export type MenuItem = { label: string; icon: string; on: () => void; danger?: boolean };

function Menu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="relative">
      <button type="button" className="icon-btn" onClick={() => setOpen((v) => !v)} aria-label="Menyu" aria-expanded={open} aria-haspopup="menu">
        <Icon n="more-horizontal" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <ul role="menu" className="absolute top-full right-0 z-50 m-0 mt-1 min-w-[220px] list-none rounded-xl bg-sec p-1 shadow-[0_6px_24px_rgb(0_0_0/0.18)]">
            {items.map((it) => (
              <li key={it.label} role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    it.on();
                  }}
                  className={`opt ${it.danger ? "!text-danger" : ""}`}
                >
                  <Icon n={it.icon} cls="!size-[18px] text-hint" />
                  {it.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** Mas'ul: admin — istalgan operatorga; operator — o'ziga olish / o'zinikini bo'shatish */
export function AssignButton({
  assignee,
  staff,
  me,
  isAdmin,
  onAssign,
}: {
  assignee: Chat["assignee"];
  staff: StaffRow[];
  me: number;
  isAdmin: boolean;
  onAssign: (tg: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const mine = assignee?.tg_id === me;
  const label = assignee ? (mine ? "Siz" : assignee.name.split(" ")[0] || "Mas'ul") : "Biriktirilmagan";
  const opts: [string, number | null][] = [];
  if (isAdmin) {
    for (const s of staff) if (s.tg_id !== assignee?.tg_id) opts.push([s.tg_id === me ? `${s.name} (siz)` : s.name, s.tg_id]);
    if (assignee) opts.push(["Bo'shatish", null]);
  } else if (!assignee) opts.push(["O'zimga olish", me]);
  else if (mine) opts.push(["Bo'shatish", null]);
  return (
    <div className="relative flex-none">
      <button
        type="button"
        onClick={() => opts.length && setOpen((v) => !v)}
        aria-haspopup={opts.length ? "menu" : undefined}
        aria-expanded={open}
        title={assignee ? `Mas'ul: ${assignee.name}` : "Mas'ul tayinlanmagan"}
        className={`flex h-8 max-w-[130px] cursor-pointer items-center gap-1 rounded-full border-0 px-2.5 text-[13px] font-medium coarse:h-11 ${
          assignee ? (mine ? "bg-link/15 text-link" : "bg-fill text-fg") : "bg-warn/15 text-warn"
        } ${opts.length ? "" : "cursor-default"}`}
      >
        <Icon n="user" cls="!size-4 flex-none" />
        <span className="truncate">{label}</span>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <ul
            role="menu"
            className="absolute top-full right-0 z-50 m-0 mt-1 max-h-[60vh] min-w-[220px] list-none overflow-y-auto rounded-xl bg-sec p-1 shadow-[0_6px_24px_rgb(0_0_0/0.18)]"
          >
            {opts.map(([t, tg]) => (
              <li key={`${t}${tg}`} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={`opt ${tg === null ? "!text-danger" : ""}`}
                  onClick={() => {
                    setOpen(false);
                    onAssign(tg);
                  }}
                >
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** O'chirishni tasdiqlash: "suhbatdosh uchun ham" — shaxsiy chatda tanlanadi, guruhda o'z xabari — hamma uchun */
export function DeleteDialog({
  m,
  canRevoke,
  busy,
  onConfirm,
  onClose,
}: {
  m: Msg;
  canRevoke: boolean;
  busy: boolean;
  onConfirm: (revoke: boolean) => void;
  onClose: () => void;
}) {
  const [revoke, setRevoke] = useState(true);
  const text = m.text || (m.media ? mediaLabel(m.media).title : "");
  return (
    <Sheet title="Xabarni o'chirish" onClose={onClose}>
      <div className="px-4 py-3">
        <p className="m-0 line-clamp-3 rounded-lg bg-page px-3 py-2 text-[14.5px] text-sub">{text || " "}</p>
        {canRevoke ? (
          <label className="mt-3 flex cursor-pointer items-center gap-3 coarse:min-h-11">
            <input type="checkbox" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} className="size-5 accent-[var(--link)]" />
            <span>Suhbatdosh uchun ham o&apos;chirish</span>
          </label>
        ) : null}
        <p className="m-0 mt-2 text-[13px] text-hint">CRM tarixida «o&apos;chirilgan» belgisi bilan qoladi.</p>
      </div>
      <div className="btns mb-3">
        <button type="button" className="btn sec" onClick={onClose}>
          Bekor qilish
        </button>
        <button type="button" className="btn danger" onClick={() => onConfirm(canRevoke && revoke)} disabled={busy}>
          {busy ? "O'chirilmoqda…" : "O'chirish"}
        </button>
      </div>
    </Sheet>
  );
}

export function ChatView({
  acc,
  chat,
  typing,
  notice,
  pinned,
  menu,
  assign,
  lockedBy,
  onBack,
  onProfile,
  onSearch,
  onCrm,
  onPinnedClick,
  onDropFile,
  messages,
  composer,
  overlay,
  panel,
}: {
  acc: number;
  chat: Chat | null;
  typing: string | null;
  notice: string;
  pinned: Msg | null;
  menu: MenuItem[];
  assign: ReactNode;
  /** boshqa operator hozir javob yozmoqda */
  lockedBy: string;
  onBack: () => void;
  onProfile: () => void;
  onSearch: () => void;
  onCrm?: () => void;
  onPinnedClick: () => void;
  onDropFile?: (f: File) => void;
  messages: ReactNode;
  composer: ReactNode;
  /** qidiruv (xabarlar ustida) */
  overlay: ReactNode;
  /** profil: keng ekranda o'ng ustun, aks holda — ustida */
  panel: ReactNode;
}) {
  const status = typing ? `${TYPING_TEXT[typing] ?? "yozmoqda"}…` : chat ? statusLine(chat) : "";
  const [drag, setDrag] = useState(false);
  const hasFiles = (e: DragEvent) => !!onDropFile && Array.from(e.dataTransfer.types).includes("Files");
  const pinText = pinned ? pinned.text || (pinned.media ? mediaLabel(pinned.media).title : "") : "";
  return (
    <div className="flex h-full min-h-0">
      <div
        className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col"
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDrag(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) onDropFile?.(f);
        }}
      >
        {drag ? (
          <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-link bg-sec/90 text-[17px] font-semibold text-link">
            Faylni shu yerga tashlang
          </div>
        ) : null}
        <header className="flex min-h-14 flex-none items-center gap-1 border-b border-sep bg-sec px-2 py-1.5 md:px-3">
          <button type="button" className="icon-btn md:hidden" onClick={onBack} aria-label="Chatlar ro'yxatiga">
            <Icon n="back" />
          </button>
          <button
            type="button"
            onClick={onProfile}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent p-1 text-left text-fg hover:bg-fill"
            style={{ font: "inherit" }}
            aria-label="Profilni ochish"
          >
            {chat ? <Avatar acc={acc} c={chat} size={40} /> : <span className="size-10 flex-none animate-pulse rounded-full bg-fill" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] leading-tight font-semibold">{chat ? chatName(chat) : " "}</span>
              <span className={`block truncate text-[13px] leading-tight ${typing || chat?.online ? "text-link" : "text-hint"}`} aria-live="polite">
                {status || " "}
              </span>
            </span>
          </button>
          {assign}
          {onCrm ? (
            <button type="button" className="icon-btn" onClick={onCrm} aria-label="Mijoz kartasi" title="Mijoz kartasi (CRM)">
              <Icon n="briefcase" />
            </button>
          ) : null}
          <button type="button" className="icon-btn" onClick={onSearch} aria-label="Chatda qidirish" title="Qidirish">
            <Icon n="search" />
          </button>
          <Menu items={menu} />
        </header>
        {pinned ? (
          <button
            type="button"
            onClick={onPinnedClick}
            className="flex flex-none cursor-pointer items-center gap-2 border-0 border-b border-sep bg-sec px-4 py-1.5 text-left"
            style={{ font: "inherit" }}
          >
            <span className="h-8 w-[3px] flex-none rounded bg-link" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-link">Qadalgan xabar</span>
              <span className="block truncate text-[14px] text-fg">{pinText || " "}</span>
            </span>
            <Icon n="pin" cls="flex-none rotate-45 text-hint" />
          </button>
        ) : null}
        {notice ? (
          <div role="status" className="flex-none border-b border-sep bg-warn/12 px-4 py-2 text-[13.5px] text-fg">
            {notice}
          </div>
        ) : null}
        <div className="relative min-h-0 flex-1">
          {messages}
          {overlay}
        </div>
        {lockedBy ? (
          <div role="status" className="flex flex-none items-center gap-2 border-t border-sep bg-warn/12 px-4 py-1.5 text-[13.5px]">
            <span className="size-2 flex-none animate-pulse rounded-full bg-warn" aria-hidden />
            <span className="min-w-0 flex-1">
              <b>{lockedBy}</b> hozir shu chatga javob yozmoqda
            </span>
          </div>
        ) : null}
        <div className="flex-none pb-[var(--safe-b)]">{composer}</div>
      </div>
      {panel ? <div className="fixed inset-0 z-50 flex bg-sec xl:static xl:z-auto xl:w-[360px] xl:flex-none xl:border-l xl:border-sep">{panel}</div> : null}
    </div>
  );
}
