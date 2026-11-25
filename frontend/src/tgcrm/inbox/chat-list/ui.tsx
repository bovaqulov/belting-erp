import type { Chat, GlobalHit } from "@/tgcrm/api";
import type { Typing } from "@/tgcrm/inbox";
import Avatar from "@/tgcrm/avatar";
import { Empty, Icon, Ticks } from "@/tgcrm/kit";
import { TYPING_TEXT, chatName, fmtMinutes, isGroup, listTime, mediaLabel, stageOf, waitMinutes } from "@/tgcrm/lib";

function Row({
  acc,
  me,
  sla,
  c,
  on,
  typing,
  now,
  onOpen,
}: {
  acc: number;
  me: number;
  sla: number;
  c: Chat;
  on: boolean;
  typing?: string;
  now: number;
  onOpen: (p: number) => void;
}) {
  const wait = waitMinutes(c.waiting_since, now);
  const late = wait > sla;
  const stage = c.crm ? stageOf(c.crm.stage) : null;
  const name = chatName(c);
  const sub = on ? "text-btn-fg/80" : "text-sub";
  const preview = typing ? (
    <span className={on ? "" : "text-link"}>{TYPING_TEXT[typing] ?? "yozmoqda"}…</span>
  ) : c.draft ? (
    <>
      <span className={on ? "" : "text-danger"}>Qoralama: </span>
      {c.draft}
    </>
  ) : (
    <>
      {c.last_out ? <span className={on ? "" : "text-fg/80"}>Siz: </span> : null}
      {c.last_text || " "}
    </>
  );
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(c.peer_id)}
        aria-current={on ? "true" : undefined}
        className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border-0 px-2.5 py-2 text-left ${on ? "bg-btn text-btn-fg" : "bg-transparent text-fg hover:bg-fill active:bg-fill"}`}
        style={{ font: "inherit" }}
      >
        <Avatar acc={acc} c={c} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {isGroup(c.kind) ? <Icon n="users" cls={`!size-4 flex-none ${on ? "" : "text-hint"}`} /> : null}
            {c.kind === "channel" ? <Icon n="megaphone" cls={`!size-4 flex-none ${on ? "" : "text-hint"}`} /> : null}
            <span className="truncate text-[15.5px] font-semibold">{name}</span>
            {c.verified ? <Icon n="shield-check" cls={`!size-4 flex-none ${on ? "" : "text-link"}`} /> : null}
            {c.scam ? <span className="flex-none rounded border border-danger px-1 text-[10px] font-bold text-danger">SCAM</span> : null}
            <span className="ml-auto flex flex-none items-center gap-1 pl-1 text-[12.5px] tabular-nums">
              {c.last_out && !c.draft ? <Ticks read={c.last_read} cls={on ? "" : "text-ok"} /> : null}
              {late ? (
                <span className={`font-semibold ${on ? "" : "text-danger"}`} title={`Mijoz ${fmtMinutes(wait)} dan beri javob kutmoqda`}>
                  {fmtMinutes(wait)}
                </span>
              ) : (
                <span className={on ? "" : "text-hint"}>{listTime(c.last_date, new Date(now))}</span>
              )}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <span className={`min-w-0 flex-1 truncate text-[14.5px] ${sub}`}>{preview}</span>
            {stage && c.crm?.stage !== "new" ? (
              <span className={`st ${on ? "" : stage.tone} flex-none !py-0 !text-[11.5px]`} title={`Bosqich: ${stage.label}`}>
                {stage.label}
              </span>
            ) : null}
            {c.assignee ? (
              <span
                className={`max-w-[84px] flex-none truncate rounded-md px-1.5 text-[11.5px] leading-[18px] font-medium ${on ? "bg-btn-fg/20" : c.assignee.tg_id === me ? "bg-link/15 text-link" : "bg-fill text-sub"}`}
                title={`Mas'ul: ${c.assignee.name}`}
              >
                {c.assignee.tg_id === me ? "Siz" : c.assignee.name.split(" ")[0] || "—"}
              </span>
            ) : null}
            {c.unread_mentions ? (
              <span
                className={`grid size-[22px] flex-none place-items-center rounded-full text-[13px] font-bold ${on ? "bg-btn-fg text-btn" : "bg-btn text-btn-fg"}`}
              >
                @
              </span>
            ) : null}
            {c.unread ? (
              <span
                className={`min-w-[22px] flex-none rounded-full px-1.5 text-center text-[12.5px] leading-[22px] font-semibold tabular-nums ${
                  on ? "bg-btn-fg text-btn" : c.muted ? "bg-hint/60 text-white" : "bg-btn text-btn-fg"
                }`}
                aria-label={`${c.unread} ta o'qilmagan`}
              >
                {c.unread > 999 ? `${Math.floor(c.unread / 1000)}K` : c.unread}
              </span>
            ) : c.pinned ? (
              <Icon n="pin" cls={`!size-4 flex-none rotate-45 ${on ? "" : "text-hint"}`} />
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

export function ChatListView({
  sentinel,
  ...p
}: {
  acc: number;
  me: number;
  sla: number;
  dialogs: Chat[] | null;
  err: string;
  hasMore: boolean;
  loadingMore: boolean;
  open: number | null;
  typing: Typing;
  searching: boolean;
  hits: GlobalHit[] | null;
  onHit: (h: GlobalHit) => void;
  archive: boolean;
  now: number;
  sentinel: (el: HTMLDivElement | null) => (() => void) | undefined;
  onOpen: (peer: number) => void;
  onRetry: () => void;
}) {
  if (p.dialogs === null)
    return p.err ? (
      <Empty icon="alert" title="Chatlar yuklanmadi">
        {p.err}
        <div className="btns">
          <button type="button" className="btn sec" onClick={p.onRetry}>
            Qayta urinish
          </button>
        </div>
      </Empty>
    ) : (
      <div aria-busy="true" aria-label="Yuklanmoqda" className="px-2 pt-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-2.5 py-2">
            <span className="size-[54px] flex-none animate-pulse rounded-full bg-fill" />
            <span className="flex-1">
              <span className="block h-3.5 w-1/2 animate-pulse rounded bg-fill" />
              <span className="mt-2 block h-3 w-4/5 animate-pulse rounded bg-fill" />
            </span>
          </div>
        ))}
      </div>
    );
  const hits =
    p.searching && p.hits?.length ? (
      <section aria-label="Xabarlar">
        <h3 className="m-0 px-4 pt-3 pb-1 text-[13px] font-medium text-hint uppercase">Xabarlar</h3>
        <ul className="m-0 list-none px-1.5 pb-2">
          {p.hits.map((h) => (
            <li key={`${h.chat.peer_id}:${h.message.id}`}>
              <button
                type="button"
                onClick={() => p.onHit(h)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent px-2.5 py-2 text-left text-fg hover:bg-fill"
                style={{ font: "inherit" }}
              >
                <Avatar acc={p.acc} c={h.chat} size={46} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{chatName(h.chat)}</span>
                    <span className="flex-none text-[12.5px] text-hint tabular-nums">{listTime(h.message.date, new Date(p.now))}</span>
                  </span>
                  <span className="block truncate text-[14px] text-sub">
                    {h.message.out ? "Siz: " : ""}
                    {h.message.text || (h.message.media ? mediaLabel(h.message.media).title : "")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    ) : null;
  if (!p.dialogs.length)
    return (
      hits ?? (
        <Empty icon={p.searching ? "search" : "message-circle"} title={p.searching ? "Hech narsa topilmadi" : p.archive ? "Arxiv bo'sh" : "Chatlar yo'q"}>
          {p.searching ? "Ism, @username yoki telefon bo'yicha qidiriladi." : "Ro'yxat sinxronlanayotgan bo'lishi mumkin — birozdan keyin yangilanadi."}
        </Empty>
      )
    );
  return (
    <>
      <ul className="m-0 list-none px-1.5 py-1.5">
        {p.dialogs.map((c) => (
          <Row
            key={c.peer_id}
            acc={p.acc}
            me={p.me}
            sla={p.sla}
            c={c}
            on={c.peer_id === p.open}
            typing={p.typing[c.peer_id]?.action}
            now={p.now}
            onOpen={p.onOpen}
          />
        ))}
      </ul>
      {hits}
      {p.hasMore ? (
        <div ref={sentinel} className="py-4 text-center text-[13px] text-hint" aria-busy={p.loadingMore}>
          {p.loadingMore ? "Yuklanmoqda…" : " "}
        </div>
      ) : null}
    </>
  );
}
