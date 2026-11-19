// «Mijoz bilan aloqa» (faqat ko'rinish): sarlavha (yopish — ustidan ochilganda), tablar Chatlar / Qo'ng'iroqlar;
// chatlar — tanlov, yozishma, «Chatni ulash» ro'yxati; qo'ng'iroqlar — qo'ng'iroq qilish, tarix (yozuv pleyeri), qo'lda yozish.
import type { ReactNode } from "react";

import { dt } from "@/erp/kit/fmt";
import { Icon, Skeleton } from "@/erp/kit/ui";
import type { Call } from "@/erp/crm/lib";
import { chOf, type TgChat } from "@/erp/crm/telegram/tg.lib";

export type Tab = "chats" | "calls";
export type CallForm = { direction: "in" | "out"; status: "answered" | "missed" | "busy"; minutes: string; note: string };

const IB =
  "grid size-8 flex-none cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-hint hover:bg-fill hover:text-fg coarse:size-11 [&_svg.i]:size-[18px]";
const SEG = (on: boolean) =>
  `h-8 flex-1 cursor-pointer rounded-md border-0 px-2 text-[12.5px] coarse:h-11 ${on ? "bg-sec font-semibold text-fg shadow-1" : "bg-transparent text-hint hover:text-fg"}`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const CALL_RES: Record<Call["status"], string> = { answered: "gaplashildi", missed: "javob berilmadi", busy: "band" };

export function DealChatsView(p: {
  tab: Tab;
  onTab: (t: Tab) => void;
  docked: boolean;
  loading: boolean;
  err: string;
  hasCustomer: boolean;
  chats: TgChat[];
  cur: TgChat | null;
  onPick: (id: number) => void;
  onClose?: () => void;
  thread: ReactNode;
  linking: boolean;
  onLinking: (v: boolean) => void;
  lq: string;
  onLq: (v: string) => void;
  candidates: TgChat[];
  onLink: (c: TgChat) => void;
  calls: Call[] | null;
  callsLoading: boolean;
  phones: string[];
  form: CallForm | null;
  busy: boolean;
  /** undefined — yangi forma; null — yopish */
  onForm: (f?: CallForm | null) => void;
  onSaveCall: () => void;
}) {
  const { tab, cur } = p;
  return (
    <div className="flex h-full min-h-0 flex-col bg-sec">
      <div className="flex min-h-[52px] flex-none items-center gap-2 border-b border-sep px-3">
        <span className="grid size-8 flex-none place-items-center rounded-[10px] bg-link/12 text-link [&_svg.i]:size-[17px]" aria-hidden="true">
          <Icon n={tab === "calls" ? "phone" : "message-circle"} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <b className="block text-[14px]">Mijoz bilan aloqa</b>
          <span className="block truncate text-xs text-hint">
            {tab === "chats" && cur ? [chOf(cur.channel).name, cur.title].join(" · ") : tab === "calls" ? "Telefon suhbatlari" : "Telegram · WhatsApp · Instagram"}
          </span>
        </div>
        {p.onClose ? (
          <button type="button" className={`${IB} ${p.docked ? "min-[1280px]:hidden" : ""}`} aria-label="Yopish" title="Yopish" onClick={p.onClose}>
            <Icon n="x" />
          </button>
        ) : null}
      </div>
      <div className="flex flex-none gap-1 border-b border-sep bg-fill/50 p-1.5" role="tablist" aria-label="Aloqa turi">
        <button type="button" role="tab" aria-selected={tab === "chats"} className={SEG(tab === "chats")} onClick={() => p.onTab("chats")}>
          Chatlar{p.chats.length ? ` · ${p.chats.length}` : ""}
        </button>
        <button type="button" role="tab" aria-selected={tab === "calls"} className={SEG(tab === "calls")} onClick={() => p.onTab("calls")}>
          Qo&apos;ng&apos;iroqlar{p.calls?.length ? ` · ${p.calls.length}` : ""}
        </button>
      </div>
      {!p.hasCustomer ? (
        <Blank icon="user" title="Bitimda mijoz yo'q">
          Mijoz tanlangach, uning chatlari va qo&apos;ng&apos;iroqlari shu yerda ko&apos;rinadi.
        </Blank>
      ) : tab === "chats" ? (
        <Chats {...p} />
      ) : (
        <Calls {...p} />
      )}
    </div>
  );
}

function Blank({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-fill text-hint [&_svg.i]:size-6" aria-hidden="true">
        <Icon n={icon} />
      </span>
      <b className="text-[14px]">{title}</b>
      <p className="m-0 max-w-[280px] text-[13px] leading-[1.45] text-hint">{children}</p>
    </div>
  );
}

function Chats(p: Parameters<typeof DealChatsView>[0]) {
  if (p.loading)
    return (
      <div className="p-3">
        <Skeleton />
      </div>
    );
  if (p.err) return <Blank icon="alert" title="Chatlarni olib bo'lmadi">{p.err}</Blank>;
  return (
    <>
      {p.chats.length ? (
        <div className="flex flex-none items-center gap-1.5 overflow-x-auto border-b border-sep px-3 py-2 [scrollbar-width:none]" role="tablist" aria-label="Chatlar">
          {p.chats.map((c) => {
            const ch = chOf(c.channel);
            const on = c.id === p.cur?.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  p.onPick(c.id);
                  p.onLinking(false);
                }}
                className={`flex h-8 max-w-[190px] flex-none cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] coarse:h-11 [&_svg.i]:size-[15px] ${on && !p.linking ? "border-link bg-link/12 text-fg" : "border-sep bg-page text-sub hover:text-fg"}`}
              >
                <span className="contents" style={{ color: ch.color }}>
                  <Icon n={ch.icon} />
                </span>
                <span className="truncate">{c.title}</span>
                {c.unread ? (
                  <b className="min-w-[18px] rounded-full px-1 text-center text-[10.5px] leading-[18px] text-white" style={{ background: ch.color }}>
                    {c.unread}
                  </b>
                ) : null}
              </button>
            );
          })}
          <button
            type="button"
            className={`flex h-8 flex-none cursor-pointer items-center gap-1 rounded-full border border-dashed px-2.5 text-[12.5px] coarse:h-11 [&_svg.i]:size-[14px] ${p.linking ? "border-link text-link" : "border-sep text-hint hover:text-fg"}`}
            onClick={() => p.onLinking(!p.linking)}
            title="Boshqa chatni shu mijozga ulash"
          >
            <Icon n="plus" /> Ulash
          </button>
        </div>
      ) : null}
      {p.linking ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {!p.chats.length ? (
            <div className="flex-none px-4 pt-4 pb-1 text-center">
              <b className="text-[14px]">Bu mijoz bilan chat yo&apos;q</b>
              <p className="m-0 mt-1 text-[12.5px] leading-[1.45] text-hint">Chatlaringizdan birini tanlab shu mijozga ulang — yozishma shu yerda ko&apos;rinadi.</p>
            </div>
          ) : null}
          <div className="relative flex-none px-3 py-2 [&_svg.i]:pointer-events-none [&_svg.i]:absolute [&_svg.i]:top-1/2 [&_svg.i]:left-[22px] [&_svg.i]:size-4 [&_svg.i]:-translate-y-1/2 [&_svg.i]:text-hint">
            <Icon n="search" />
            <input className="inp w-full !pl-8" type="search" value={p.lq} placeholder="Chatni qidiring: ism yoki @username" aria-label="Ulanadigan chatni qidirish" onChange={(e) => p.onLq(e.target.value)} />
          </div>
          <ul className="m-0 min-h-0 flex-1 list-none overflow-auto p-0 pb-2">
            {p.candidates.map((c) => {
              const ch = chOf(c.channel);
              return (
                <li key={c.id} className="flex items-center gap-2.5 px-3 py-1.5">
                  <span className="grid size-8 flex-none place-items-center rounded-full bg-fill [&_svg.i]:size-4" style={{ color: ch.color }} aria-hidden="true">
                    <Icon n={ch.icon} />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[13.5px]">{c.title}</span>
                    <span className="block truncate text-xs text-hint">
                      {[ch.name, c.username && "@" + c.username, c.customer ? `hozir: ${c.customer.name}` : "mijozga ulanmagan"].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <button type="button" className="b h-8 flex-none px-2.5 text-[12.5px] coarse:h-11" onClick={() => p.onLink(c)}>
                    Ulash
                  </button>
                </li>
              );
            })}
            {!p.candidates.length ? <li className="px-4 py-4 text-center text-[13px] text-hint">{p.lq ? "Topilmadi" : "Ulanadigan chat yo'q"}</li> : null}
          </ul>
        </div>
      ) : p.thread ? (
        <div className="flex min-h-0 flex-1 flex-col">{p.thread}</div>
      ) : null}
    </>
  );
}

function Calls(p: Parameters<typeof DealChatsView>[0]) {
  const f = p.form;
  const set = (k: keyof CallForm, v: string) => f && p.onForm({ ...f, [k]: v } as CallForm);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex flex-none flex-wrap gap-1.5 border-b border-sep px-3 py-2.5">
        {p.phones.slice(0, 2).map((ph) => (
          <a key={ph} className="b pri h-9 flex-1 gap-1.5 text-[13px] no-underline coarse:h-11" href={`tel:+${ph}`}>
            <Icon n="phone" /> +{ph}
          </a>
        ))}
        {!p.phones.length ? <span className="py-1.5 text-[12.5px] text-hint">Mijozda telefon raqami yo&apos;q</span> : null}
        <button type="button" className="b h-9 gap-1.5 text-[13px] coarse:h-11" onClick={() => p.onForm(f ? null : undefined)}>
          <Icon n={f ? "x" : "plus"} /> {f ? "Bekor" : "Yozib qo'yish"}
        </button>
      </div>
      {f ? (
        <div className="flex flex-none flex-col gap-2 border-b border-sep bg-page/40 px-3 py-3">
          <div className="flex gap-1 rounded-lg bg-fill p-1" role="group" aria-label="Yo'nalish">
            <button type="button" className={SEG(f.direction === "out")} aria-pressed={f.direction === "out"} onClick={() => set("direction", "out")}>
              ↗ Chiquvchi
            </button>
            <button type="button" className={SEG(f.direction === "in")} aria-pressed={f.direction === "in"} onClick={() => set("direction", "in")}>
              ↙ Kiruvchi
            </button>
          </div>
          <div className="flex gap-1 rounded-lg bg-fill p-1" role="group" aria-label="Natija">
            {(["answered", "missed", "busy"] as const).map((s) => (
              <button key={s} type="button" className={SEG(f.status === s)} aria-pressed={f.status === s} onClick={() => set("status", s)}>
                {s === "answered" ? "Gaplashildi" : s === "missed" ? "Javob yo'q" : "Band"}
              </button>
            ))}
          </div>
          {f.status === "answered" ? (
            <label className="flex items-center gap-2 text-[12.5px] text-hint">
              Davomiyligi, daqiqa
              <input className="inp h-9 w-20 text-right tabular-nums" inputMode="decimal" value={f.minutes} placeholder="0" onChange={(e) => set("minutes", e.target.value)} />
            </label>
          ) : null}
          <textarea className="inp min-h-16 w-full !py-2" value={f.note} placeholder="Nima kelishildi? (natija bitim tarixiga ham yoziladi)" aria-label="Izoh" onChange={(e) => set("note", e.target.value)} />
          <button type="button" className="b pri h-9 coarse:h-11" disabled={p.busy} onClick={p.onSaveCall}>
            Saqlash
          </button>
        </div>
      ) : null}
      {p.callsLoading ? (
        <div className="p-3">
          <Skeleton />
        </div>
      ) : p.calls?.length ? (
        <ul className="m-0 list-none p-0">
          {p.calls.map((c) => {
            const bad = c.status !== "answered";
            return (
              <li key={c.id} className="border-b border-sep px-3 py-2.5">
                <div className="flex items-start gap-2.5">
                  <span className={`grid size-8 flex-none place-items-center rounded-full text-[15px] ${bad ? "bg-danger/12 text-danger" : "bg-ok/12 text-ok"}`} aria-hidden="true">
                    {c.direction === "in" ? "↙" : "↗"}
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13.5px]">
                        {c.direction === "in" ? "Kiruvchi" : "Chiquvchi"} · <span className={bad ? "text-danger" : ""}>{CALL_RES[c.status]}</span>
                      </span>
                      {c.status === "answered" ? <b className="flex-none text-[12.5px] tabular-nums">{mmss(c.duration)}</b> : null}
                    </div>
                    <span className="mt-0.5 block text-xs text-hint tabular-nums">
                      {dt(c.started)} · +{c.phone}
                      {c.source !== "manual" ? ` · ${c.source}` : ""}
                    </span>
                    {c.note ? <p className="m-0 mt-1 text-[12.5px] leading-snug text-sub">{c.note}</p> : null}
                    {c.recording_url ? <audio className="mt-1.5 h-9 w-full" controls preload="none" src={c.recording_url} aria-label="Qo'ng'iroq yozuvi" /> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Blank icon="phone" title="Qo'ng'iroqlar yo'q">
          Qo&apos;ng&apos;iroqdan keyin «Yozib qo&apos;ying» — natija bitim tarixiga ham tushadi.
        </Blank>
      )}
      <p className="m-0 mt-auto flex-none border-t border-sep px-3 py-2.5 text-[11.5px] leading-[1.45] text-hint">
        IP-telefoniya (OnlinePBX, Sipuni, Zadarma …) ulanganda qo&apos;ng&apos;iroqlar va yozuvlar shu yerga avtomatik tushadi — administrator sozlaydi.
      </p>
    </div>
  );
}
