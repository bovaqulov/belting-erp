import { useState, type ReactNode, type RefObject } from "react";

import type { Chat, Media, Msg, MsgPeer } from "@/tgcrm/api";
import { Empty, Icon, Ticks } from "@/tgcrm/kit";

import MessageMedia from "./media";
import { actionText, avColor, clock, dayLabel, initials, isGroup, mediaLabel, safeHref, segments, senderName, type Row, type Seg } from "@/tgcrm/lib";

const OUT_BG = "bg-[color-mix(in_srgb,var(--link)_15%,var(--sec))]";

function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={shown ? undefined : "Yashirin matn — ko'rish uchun bosing"}
      onClick={(e) => {
        e.stopPropagation();
        setShown(true);
      }}
      onKeyDown={(e) => e.key === "Enter" && setShown(true)}
      className={shown ? "" : "cursor-pointer rounded bg-hint/45 text-transparent select-none"}
    >
      {children}
    </span>
  );
}

function Piece({ s }: { s: Seg }) {
  let el: ReactNode = s.text;
  const m = new Set(s.marks);
  if (m.has("code")) el = <code className="rounded bg-fill px-1 font-mono text-[0.92em]">{el}</code>;
  if (m.has("pre")) el = <code className="my-1 block overflow-x-auto rounded-lg bg-fill p-2 font-mono text-[0.9em] whitespace-pre">{el}</code>;
  if (m.has("b")) el = <strong>{el}</strong>;
  if (m.has("i")) el = <em>{el}</em>;
  if (m.has("u")) el = <u>{el}</u>;
  if (m.has("s")) el = <s>{el}</s>;
  if (m.has("quote")) el = <span className="my-0.5 block border-l-[3px] border-link pl-2">{el}</span>;
  if (s.href)
    el = (
      <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-link underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>
        {el}
      </a>
    );
  else if (m.has("mention") || m.has("tag")) el = <span className="text-link">{el}</span>;
  if (m.has("spoiler")) el = <Spoiler>{el}</Spoiler>;
  return <>{el}</>;
}

function Text({ m }: { m: Msg }) {
  const segs = segments(m.text, m.entities);
  if (!segs.length) return null;
  return (
    <>
      {segs.map((s, i) => (
        <Piece key={i} s={s} />
      ))}
    </>
  );
}

/** Havola ko'rinishi (sayt, sarlavha, tavsif) — matndan keyin */
function WebPage({ media }: { media: Media }) {
  return (
    <a
      href={typeof media.url === "string" ? safeHref(media.url) : undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-1 block border-l-[3px] border-link pl-2 text-[14px] text-fg no-underline"
    >
      {media.site ? <span className="block font-semibold text-link">{String(media.site)}</span> : null}
      {media.title ? <span className="block font-semibold">{String(media.title)}</span> : null}
      {media.description ? <span className="line-clamp-3 block text-sub">{String(media.description)}</span> : null}
    </a>
  );
}

function Meta({ m, staff }: { m: Msg; staff: Record<string, string> }) {
  const who = m.by_ai ? "AI" : m.out && m.sent_by ? staff[String(m.sent_by)] : "";
  return (
    <span className="relative top-[5px] float-right ml-2.5 inline-flex items-center gap-1 text-[11.5px] leading-none whitespace-nowrap text-hint tabular-nums">
      {who ? <span className="max-w-[110px] truncate">{who} ·</span> : null}
      {m.views ? <span aria-label={`${m.views} marta ko'rilgan`}>{m.views.toLocaleString("ru-RU").replace(/\u00a0/g, " ")} ·</span> : null}
      {m.edit_date && !m.deleted ? <span>tahrirlangan</span> : null}
      <time dateTime={m.date}>{clock(m.date)}</time>
      {m.pending === "sending" ? <Icon n="clock" cls="!size-3" /> : null}
      {m.pending === "failed" ? <Icon n="circle-alert" cls="!size-3.5 text-danger" /> : null}
      {m.out && !m.pending ? <Ticks read={m.read} cls="text-link" /> : null}
    </span>
  );
}

function Quote({ m, all, peers, chat, onJump }: { m: Msg; all: Msg[]; peers: Record<string, MsgPeer>; chat: Chat | null; onJump: (id: number) => void }) {
  const r = all.find((x) => x.id === m.reply_to);
  const name = r ? (r.out ? "Siz" : senderName(r.sender_id, peers) || chat?.title || "") : "";
  const text = r ? r.text || (r.media ? mediaLabel(r.media).title : "") : "Xabar";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (r) onJump(r.id);
      }}
      className="mb-1 block w-full cursor-pointer rounded-md border-0 border-l-[3px] border-link bg-link/10 px-2 py-1 text-left text-[13.5px] text-fg"
      style={{ font: "inherit" }}
      disabled={!r}
    >
      {name ? <span className="block truncate font-semibold text-link">{name}</span> : null}
      <span className="block truncate text-sub">{text || " "}</span>
    </button>
  );
}

/** Xabar amallari (ota komponent beradi; yozish huquqi yo'q bo'lsa — faqat nusxa) */
export type Acts = {
  reply?: (m: Msg) => void;
  edit?: (m: Msg) => void;
  remove?: (m: Msg) => void;
  forward?: (m: Msg) => void;
  pin?: (m: Msg) => void;
  react?: (m: Msg, emoji: string) => void;
  copy: (m: Msg) => void;
  retry: (m: Msg) => void;
  discard: (m: Msg) => void;
  pinnedId: number | null;
};

const QUICK = ["👍", "❤", "🔥", "😁", "🙏", "👌", "😢"];
const EDIT_WINDOW = 48 * 3600 * 1000;

function Bubble(p: {
  acc: number;
  peer: number;
  row: Extract<Row, { k: "msg" }>;
  all: Msg[];
  chat: Chat | null;
  peers: Record<string, MsgPeer>;
  staff: Record<string, string>;
  selected: boolean;
  onSelect: () => void;
  onJump: (id: number) => void;
  acts: Acts;
  close: () => void;
  now: number;
}) {
  const { m, first, last } = p.row;
  const A = p.acts;
  const run = (fn?: (m: Msg) => void) => () => {
    p.close();
    fn?.(m);
  };
  const group = !!p.chat && isGroup(p.chat.kind);
  const name = !m.out && group && first ? senderName(m.sender_id, p.peers) || "…" : m.post_author && first ? m.post_author : "";
  const fwdName = m.fwd ? m.fwd.from_name || senderName(m.fwd.from_id ?? null, p.peers) || "Yashirin foydalanuvchi" : "";
  const corner = last ? (m.out ? "rounded-br-md" : "rounded-bl-md") : "";
  const onlyMedia = !m.text && m.media && ["photo", "video", "gif", "round", "sticker"].includes(m.media.kind);
  const actions: [string, string, () => void, boolean?][] = [];
  if (m.pending === "failed") {
    actions.push(["Qayta yuborish", "refresh-cw", () => A.retry(m)]);
    actions.push(["Bekor qilish", "trash-2", () => A.discard(m)]);
  } else if (!m.pending && !m.deleted) {
    const editable = m.out && !m.fwd && (m.text || m.media) && p.now - Date.parse(m.date) < EDIT_WINDOW;
    if (A.reply) actions.push(["Javob", "undo-2", run(A.reply)]);
    if (A.edit && editable && m.text) actions.push(["Tahrirlash", "pencil", run(A.edit)]);
    if (m.text) actions.push(["Nusxa", "clipboard", run(A.copy)]);
    if (A.forward) actions.push(["Uzatish", "redo-2", run(A.forward)]);
    if (A.pin) actions.push([A.pinnedId === m.id ? "Qadashni olish" : "Qadash", "pin", run(A.pin)]);
    if (A.remove) actions.push(["O'chirish", "trash-2", run(A.remove), true]);
  }
  const showActions = (p.selected || m.pending === "failed") && actions.length > 0;
  return (
    <div data-mid={m.id} className={`flex items-end gap-2 ${m.out ? "justify-end" : "justify-start"} ${first ? "mt-1.5" : ""}`}>
      {group && !m.out ? (
        last ? (
          <span
            className="grid size-[34px] flex-none place-items-center rounded-full text-[13px] font-semibold text-white"
            style={{ background: avColor(m.sender_id ?? 0) }}
            aria-hidden
          >
            {initials(senderName(m.sender_id, p.peers) || "?")}
          </span>
        ) : (
          <span className="w-[34px] flex-none" />
        )
      ) : null}
      <div className={`flex max-w-[min(520px,86%)] min-w-0 flex-col ${m.out ? "items-end" : "items-start"}`}>
        <div
          onClick={p.onSelect}
          className={`relative min-w-[72px] max-w-full cursor-default rounded-2xl px-2.5 pt-1.5 pb-2 text-[15px] leading-[1.35] shadow-[0_1px_1px_rgb(0_0_0/0.08)] ${corner} ${
            m.out ? OUT_BG : "bg-sec"
          } ${p.selected ? "ring-2 ring-link/50" : ""} ${m.deleted ? "opacity-60" : ""}`}
        >
          {name ? (
            <span className="block truncate text-[13.5px] font-semibold" style={{ color: avColor(m.sender_id ?? 0) }}>
              {name}
            </span>
          ) : null}
          {m.fwd ? <span className="block text-[13px] text-link">Uzatildi: {fwdName}</span> : null}
          {m.reply_to ? <Quote m={m} all={p.all} peers={p.peers} chat={p.chat} onJump={p.onJump} /> : null}
          {m.media && m.media.kind !== "webpage" ? <MessageMedia acc={p.acc} peer={p.peer} m={m} media={m.media} /> : null}
          <div className="break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
            {m.deleted ? <span className="mr-1 text-[13px] text-danger italic">o&apos;chirilgan ·</span> : null}
            <Text m={m} />
            <Meta m={m} staff={p.staff} />
            {onlyMedia ? null : <span className="clear-both block" />}
          </div>
          {m.media?.kind === "webpage" ? <WebPage media={m.media} /> : null}
          {m.reactions?.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {m.reactions.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={!A.react || !r.emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    A.react?.(m, r.mine ? "" : r.emoji);
                  }}
                  aria-pressed={r.mine}
                  className={`cursor-pointer rounded-full border-0 px-2 py-0.5 text-[13px] tabular-nums disabled:cursor-default ${r.mine ? "bg-btn text-btn-fg" : "bg-link/12 text-link"}`}
                >
                  {r.emoji || "★"} {r.count}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {m.pending === "failed" ? <span className="mt-0.5 text-[12.5px] text-danger">Yuborilmadi</span> : null}
        {p.selected && A.react && !m.pending && !m.deleted ? (
          <div className="mt-1 flex flex-wrap gap-0.5 rounded-full bg-sec px-1 py-0.5 shadow-[0_1px_4px_rgb(0_0_0/0.15)]" role="group" aria-label="Reaksiya">
            {QUICK.map((e) => {
              const mine = m.reactions?.some((r) => r.mine && r.emoji === e);
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    p.close();
                    A.react?.(m, mine ? "" : e);
                  }}
                  aria-pressed={mine}
                  aria-label={`Reaksiya ${e}`}
                  className={`grid size-9 cursor-pointer place-items-center rounded-full border-0 text-[20px] hover:bg-fill coarse:size-11 ${mine ? "bg-link/15" : "bg-transparent"}`}
                >
                  {e}
                </button>
              );
            })}
          </div>
        ) : null}
        {showActions ? (
          <div className="mt-1 flex max-w-[min(520px,92vw)] flex-wrap gap-1">
            {actions.map(([t, ic, fn, danger]) => (
              <button key={t} type="button" className={`mini inline-flex items-center gap-1 ${danger ? "danger" : ""}`} onClick={fn}>
                <Icon n={ic} cls="!size-4" />
                {t}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MessagesView({
  box,
  ...p
}: {
  now: number;
  box: RefObject<HTMLDivElement | null>;
  acc: number;
  peer: number;
  rows: Row[];
  msgs: Msg[] | null;
  err: string;
  chat: Chat | null;
  peers: Record<string, MsgPeer>;
  staff: Record<string, string>;
  hasMore: boolean;
  loadingOlder: boolean;
  showDown: boolean;
  below: number;
  onScroll: () => void;
  onDown: () => void;
  onJump: (id: number) => void;
  acts: Acts;
}) {
  const [sel, setSel] = useState<number | null>(null);
  if (p.msgs === null)
    return p.err ? (
      <Empty icon="alert" title="Xabarlar yuklanmadi">
        {p.err}
      </Empty>
    ) : (
      <div className="grid h-full place-items-center text-[14px] text-hint" aria-busy="true">
        Yuklanmoqda…
      </div>
    );
  const all = p.msgs;
  const who = (m: Msg) => (m.out ? "Siz" : senderName(m.sender_id, p.peers));
  return (
    <>
      <div ref={box} onScroll={p.onScroll} className="h-full overflow-y-auto overscroll-contain px-2 py-2 md:px-5" role="log" aria-label="Xabarlar">
        <div className="mx-auto flex max-w-[780px] flex-col gap-[3px]">
          <div className="py-2 text-center text-[12.5px] text-hint">
            {p.loadingOlder ? "Yuklanmoqda…" : !p.hasMore ? (all.length ? "Suhbat boshi" : "Hali xabar yo'q") : " "}
          </div>
          {p.rows.map((r) =>
            r.k === "day" ? (
              <div
                key={r.key}
                className="sticky top-1 z-10 my-1.5 self-center rounded-full bg-sec/85 px-3 py-1 text-[13px] font-medium text-sub shadow-sm backdrop-blur"
              >
                {dayLabel(r.date)}
              </div>
            ) : r.k === "service" ? (
              <div key={r.key} data-mid={r.m.id} className="my-1 self-center rounded-full bg-fill px-3 py-1 text-center text-[13px] text-sub">
                {r.m.action ? actionText(r.m.action, who(r.m)) : ""}
              </div>
            ) : (
              <Bubble
                key={r.key}
                acc={p.acc}
                peer={p.peer}
                row={r}
                all={all}
                chat={p.chat}
                peers={p.peers}
                staff={p.staff}
                selected={sel === r.m.id}
                onSelect={() => setSel((s) => (s === r.m.id ? null : r.m.id))}
                onJump={p.onJump}
                acts={p.acts}
                now={p.now}
                close={() => setSel(null)}
              />
            ),
          )}
        </div>
      </div>
      {p.showDown ? (
        <button
          type="button"
          onClick={p.onDown}
          className="absolute right-3 bottom-3 grid size-12 cursor-pointer place-items-center rounded-full border-0 bg-sec text-hint shadow-[0_2px_8px_rgb(0_0_0/0.18)]"
          aria-label={p.below ? `Pastga — ${p.below} ta yangi xabar` : "Pastga"}
        >
          <Icon n="chevron-down" cls="!size-6" />
          {p.below ? (
            <span className="absolute -top-1.5 min-w-[22px] rounded-full bg-btn px-1.5 text-center text-[12px] leading-[22px] font-semibold text-btn-fg tabular-nums">
              {p.below}
            </span>
          ) : null}
        </button>
      ) : null}
    </>
  );
}
