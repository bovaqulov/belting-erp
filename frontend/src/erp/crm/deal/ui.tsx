// Bitim paneli (faqat ko'rinish): ramka (o'ngdan; telefonda to'liq ekran), yuklanish/xato holati, sarlavha (nom,
// voronka, bosqich strelkalari, yakunlash, bosqich ko'rsatmasi), chapda — maydonlar va hujjatlar, o'ngda — tovarlar va tarix.
import type { ReactNode, RefObject } from "react";

import { d8, dnum, dt, dtitle, num, short } from "@/erp/kit/fmt";
import { Empty, Icon, Skeleton } from "@/erp/kit/ui";
import { DST, KIND, SRC, type DealDetail, type Meta, type Stage } from "@/erp/crm/lib";
import { BOX, BOX_H, DLR, DLR_TAP, FR, FR_TOP, PILL, SMALL, SP, X } from "@/erp/crm/tw";

export function DrawerFrame({
  on,
  title,
  panelRef,
  wide,
  onClose,
  children,
}: {
  on: boolean;
  title: string;
  /** keng (bitim + chat ustuni) */
  wide?: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className={`fixed inset-0 z-50 bg-black/35 transition-opacity duration-150 ${on ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <div className={`fixed top-0 right-0 bottom-0 z-51 flex ${wide ? "w-[min(1500px,97vw)]" : "w-[min(1080px,94vw)]"} flex-col bg-page text-sm shadow-[-8px_0_30px_rgba(0,0,0,.25)] transition-[transform,width] duration-200 max-md:w-screen ${on ? "translate-x-0" : "translate-x-full"}`} role="dialog" aria-modal="true" aria-label={title} ref={panelRef}>
        {children}
      </div>
    </>
  );
}

export const DrawerLoading = ({ err, onRetry, onClose }: { err: string; onRetry: () => void; onClose: () => void }) => (
  <>
    <div className="flex-none border-b border-sep bg-sec px-[22px] pt-3 pb-2.5 max-md:px-3 max-md:pt-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className={SP} />
        <button type="button" className={X} onClick={onClose} aria-label="Yopish">
          <Icon n="x" />
        </button>
      </div>
    </div>
    {err ? (
      <Empty icon="alert" title="Bitimni ochib bo'lmadi">
        {err}
        <div className="btns">
          <button className="btn sec" onClick={onRetry}>
            Qayta urinish
          </button>
          <button className="btn sec" onClick={onClose}>
            Yopish
          </button>
        </div>
      </Empty>
    ) : (
      <div style={{ paddingTop: 16 }}>
        <Skeleton />
      </div>
    )}
  </>
);

export function DealBodyView({
  d,
  st,
  pipe,
  pipelines,
  users,
  divisions,
  stg,
  isHead,
  opn,
  cur,
  isOpen,
  amount,
  touched,
  inStage,
  items,
  activity,
  chatN,
  chatOpen,
  onChat,
  onClose,
  onSave,
  onPipe,
  onMove,
  onFinish,
  onAmount,
  onAmountBlur,
  onOpenDoc,
  onCopyLink,
  onOpenDeal,
  onOpenCustomer,
  onPayment,
}: {
  d: DealDetail;
  st: Stage | undefined;
  pipe: string;
  pipelines: Meta["pipelines"];
  users: Meta["users"];
  divisions: { code: string; name: string }[];
  /** bosqich nomlari (bog'langan bitimlar uchun) */
  stg: Record<string, Stage>;
  /** sotuv bo'limi rahbari — mas'ulni o'zgartira oladi */
  isHead: boolean;
  /** joriy voronkaning ochiq bosqichlari */
  opn: Stage[];
  cur: number;
  isOpen: boolean;
  amount: string;
  touched: number | null;
  inStage: number | null;
  /** o'ng ustun: tovarlar va tarix (konteynerlar) */
  items: ReactNode;
  activity: ReactNode;
  /** mijoz chatlari soni va kichik ekranda chat oynasi (katta ekranda — doim o'ngda) */
  chatN: number;
  chatOpen: boolean;
  onChat: (open: boolean) => void;
  onClose: () => void;
  onSave: (field: string, value: unknown) => void;
  onPipe: (code: string) => void;
  onMove: (code: string) => void;
  onFinish: () => void;
  onAmount: (v: string) => void;
  onAmountBlur: () => void;
  /** hujjatni ko'rish (CRM ichida: chop etish / tasdiqlash) */
  onOpenDoc: (docId: number) => void;
  onCopyLink: () => void;
  onOpenDeal: (id: number) => void;
  onOpenCustomer: (id: number) => void;
  /** to'lov qo'shish (summa so'raladi) */
  onPayment: () => void;
}) {
  return (
    <>
      <div className="flex-none border-b border-sep bg-sec px-[22px] pt-3 pb-2.5 max-md:px-3 max-md:pt-2">
        <div className="flex min-w-0 items-center gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 !text-lg font-bold text-fg outline-none [font-family:inherit] hover:border-sep focus:border-link focus:bg-page"
            defaultValue={dtitle(d.title)}
            aria-label="Bitim nomi"
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== dtitle(d.title)) onSave("title", v);
            }}
          />
          <button
            type="button"
            className={`b flex-none gap-1.5 ${chatN ? "min-[1280px]:hidden" : ""} ${chatOpen ? "pri" : ""}`}
            aria-pressed={chatOpen}
            onClick={() => onChat(!chatOpen)}
            title="Mijoz bilan chat"
          >
            <Icon n="message-circle" />
            <span className="max-md:hidden">Chat</span>
            {chatN ? <b className="min-w-[18px] rounded-full bg-link px-1 text-center text-[11px] leading-[18px] text-white">{chatN}</b> : null}
          </button>
          <button type="button" className="b ic" onClick={onCopyLink} title="Bitim havolasini nusxalash" aria-label="Bitim havolasini nusxalash">
            <Icon n="link" />
          </button>
          <button type="button" className={X} onClick={onClose} aria-label="Yopish">
            <Icon n="x" />
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1.5 text-[13px]">
          {d.counterparty_id ? (
            <button type="button" className="inline-flex max-w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 font-medium text-link hover:underline [&_svg.i]:size-[15px]" onClick={() => onOpenCustomer(d.counterparty_id!)}>
              <Icon n="building" />
              <span className="truncate">{d.customer || "Mijoz"}</span>
            </button>
          ) : null}
          <span className="inline-flex items-center gap-1.5 text-fg tabular-nums [&_svg.i]:size-[15px] [&_svg.i]:text-hint">
            <Icon n="coins" />
            <b>{num(d.amount ?? 0, 0)} so&apos;m</b>
            {Number(d.amount) ? <span className="text-hint">· to&apos;langan {Math.round((Number(d.paid_sum ?? 0) / Number(d.amount)) * 100)}%</span> : null}
          </span>
          {d.location ? (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-sub [&_svg.i]:size-[15px] [&_svg.i]:text-hint">
              <Icon n="truck" />
              <span className="truncate">{d.location}</span>
            </span>
          ) : null}
          {pipelines.length > 1 ? (
            <select className="sel !h-7 !text-[13px] coarse:!h-11" aria-label="Voronka" value={pipe} onChange={(e) => onPipe(e.target.value)}>
              {pipelines.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}
          {!isOpen && st ? (
            <span className={PILL}>
              <i style={{ background: st.color || "#888" }} />
              {st.name}
              {d.lost_reason ? " · " + d.lost_reason : ""}
            </span>
          ) : null}
        </div>
        <div className="mt-2.5 flex min-w-0 items-center gap-3.5 max-md:flex-wrap max-md:gap-2">
          <div className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] max-md:basis-full [&::-webkit-scrollbar]:hidden" role="group" aria-label="Bosqichlar">
            {opn.map((s, i) => {
              const done = isOpen && i <= cur;
              return (
                <button
                  key={s.code}
                  type="button"
                  className={`-mr-2 min-w-[70px] flex-[1_0_auto] cursor-pointer border-0 py-2 pr-[18px] pl-[22px] text-[12.5px] whitespace-nowrap [clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%,10px_50%)] first:rounded-l-md first:pl-3.5 first:[clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%)] hover:brightness-108 coarse:min-h-11 ${done ? "text-white" : "bg-fill text-hint"} ${s.code === d.stage ? "font-semibold text-white" : ""}`}
                  style={done ? { background: s.color || "var(--link)" } : undefined}
                  aria-current={s.code === d.stage ? "step" : undefined}
                  title={s.code === d.stage && st?.guide ? `${s.name}: ${st.guide}` : s.name}
                  onClick={() => onMove(s.code)}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
          <button type="button" className="b flex-none max-md:w-full" onClick={onFinish}>
            <Icon n="check" /> Yakunlash
          </button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)] overflow-hidden max-[900px]:grid-cols-1 max-[900px]:overflow-y-auto">
        <div className="min-w-0 overflow-x-hidden overflow-y-auto border-r border-sep px-3.5 pt-3.5 pb-[30px] max-[900px]:overflow-visible max-[900px]:border-r-0 max-[900px]:pb-0 max-md:px-3 max-md:pt-3 md:[&_label>span]:text-[12.5px] md:[&_:is(input,select,textarea)]:!text-[13.5px] [&_label]:min-h-[30px] [&_label]:py-1">
          <div className={BOX}>
            <div className={FR}>
              <span>Mijoz</span>
              <div>
                {d.counterparty_id ? (
                  <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left text-link hover:underline" onClick={() => onOpenCustomer(d.counterparty_id!)}>
                    {d.customer || "—"}
                  </button>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <label className={FR}>
              <span>Summa</span>
              <input
                inputMode="decimal"
                value={amount}
                placeholder="0"
                onChange={(e) => onAmount(e.target.value)}
                onBlur={onAmountBlur}
              />
            </label>
            <label className={FR}>
              <span>Mas&apos;ul</span>
              <select disabled={!isHead} title={isHead ? undefined : "Mas'ulni sotuv bo'limi rahbari o'zgartiradi"} defaultValue={d.owner_tg != null ? String(d.owner_tg) : ""} onChange={(e) => onSave("owner_tg", e.target.value || null)}>
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.tg_id} value={u.tg_id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${FR} ${FR_TOP}`}>
              <span>Ehtiyoj</span>
              <textarea defaultValue={d.need || ""} placeholder="Mijozga nima kerak?" onBlur={(e) => e.target.value !== (d.need || "") && onSave("need", e.target.value)} />
            </label>
            <details className="group border-t border-sep [&[open]>summary_svg.i]:rotate-180">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-3.5 text-[13px] text-hint select-none hover:text-fg [&::-webkit-details-marker]:hidden [&_svg.i]:size-4 [&_svg.i]:transition-transform">
                <span className="flex-1">Batafsil</span>
                <Icon n="chevron-down" />
              </summary>
              <label className={FR}>
                <span>Kontakt</span>
                <input defaultValue={d.contact || ""} placeholder="Ism, lavozim" onBlur={(e) => e.target.value !== (d.contact || "") && onSave("contact", e.target.value)} />
              </label>
              <label className={FR}>
                <span>Joylashuv</span>
                <input defaultValue={d.location || ""} placeholder="Yetkazish manzili" onBlur={(e) => e.target.value.trim() !== (d.location || "") && onSave("location", e.target.value.trim())} />
              </label>
              <label className={FR}>
                <span>Manba</span>
                <select defaultValue={d.source || ""} onChange={(e) => onSave("source", e.target.value || null)}>
                  {Object.entries(SRC).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                  {d.source && !(d.source in SRC) ? <option value={d.source}>{d.source}</option> : null}
                </select>
              </label>
              <label className={FR}>
                <span>Yopilish sanasi</span>
                <input type="date" defaultValue={d.close_date || ""} onChange={(e) => onSave("close_date", e.target.value || null)} />
              </label>
              <label className={FR}>
                <span>Ehtimollik</span>
                <input
                  inputMode="decimal"
                  defaultValue={d.probability != null ? String(d.probability) : ""}
                  placeholder={st?.probability != null ? `${num(st.probability, 0)}% (bosqich)` : "%"}
                  onBlur={(e) => e.target.value !== (d.probability != null ? String(d.probability) : "") && onSave("probability", dnum(e.target.value) || null)}
                />
              </label>
              <label className={FR}>
                <span>Bo&apos;linma</span>
                <select defaultValue={d.division || ""} onChange={(e) => onSave("division", e.target.value)}>
                  <option value="">—</option>
                  {divisions.map((x) => (
                    <option key={x.code} value={x.code}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ["buyer_order", "Mijoz buyurtmasi №"],
                  ["prod_order", "Ishlab chiq. buyurtmasi №"],
                  ["prod_no", "Ishlab chiqarish №"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className={FR}>
                  <span>{label}</span>
                  <input className="code" defaultValue={d[k] || ""} placeholder="H-0H-000000" onBlur={(e) => e.target.value.trim() !== (d[k] || "") && onSave(k, e.target.value.trim())} />
                </label>
              ))}
              <label className={FR}>
                <span>Takroriy bitim</span>
                <input type="checkbox" className="ck" defaultChecked={!!d.repeat} onChange={(e) => onSave("repeat", e.target.checked)} />
              </label>
              <div className={FR}>
                <span>Ochilgan</span>
                <div>{dt(d.created)}</div>
              </div>
              <div className={FR}>
                <span>Oxirgi faollik</span>
                <div>
                  {dt(d.touched || d.updated)}
                  {touched ? ` · ${touched} kun oldin` : ""}
                </div>
              </div>
              <div className={FR}>
                <span>Bosqichda</span>
                <div>
                  {dt(d.stage_since)}
                  {inStage ? ` · ${inStage} kun` : ""}
                </div>
              </div>
              {d.closed ? (
                <div className={FR}>
                  <span>Yopilgan</span>
                  <div>{dt(d.closed)}</div>
                </div>
              ) : null}
            </details>
          </div>
          <details className={`${BOX} [&[open]>summary_svg.i]:rotate-180`} open={Number(d.paid_sum ?? 0) > 0 || !!d.sign_status || !!d.docs_done}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-3.5 text-[13px] font-semibold text-sub select-none hover:text-fg [&::-webkit-details-marker]:hidden [&_svg.i]:size-4 [&_svg.i]:transition-transform">
              <span className="flex-1">To&apos;lov va shartnoma</span>
              <span className="font-normal text-hint tabular-nums">
                {short(d.paid_sum ?? 0)} / {short(d.amount ?? 0)}
              </span>
              <Icon n="chevron-down" />
            </summary>
            <label className={FR}>
              <span>To&apos;lov sharti</span>
              <select defaultValue={d.pay_terms ?? "full"} onChange={(e) => onSave("pay_terms", e.target.value)}>
                <option value="full">100% oldindan</option>
                <option value="half">50/50</option>
              </select>
            </label>
            <div className="px-3.5 pt-1 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-[13px] whitespace-nowrap tabular-nums">
                  <b className="text-[15px]">{short(d.paid_sum ?? 0)}</b>
                  <span className="text-hint"> / {short(d.amount ?? 0)} to&apos;langan</span>
                </span>
                <button type="button" className="b h-7 flex-none gap-1 px-2 text-[12.5px] coarse:h-11" onClick={onPayment}>
                  <Icon n="plus" /> To&apos;lov
                </button>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden="true">
                <div className="h-full rounded-full bg-ok" style={{ width: `${Number(d.amount) ? Math.min(100, (Number(d.paid_sum ?? 0) / Number(d.amount)) * 100) : 0}%` }} />
              </div>
            </div>
            <label className={FR}>
              <span>Shartnoma imzosi</span>
              <select defaultValue={d.sign_status ?? ""} onChange={(e) => onSave("sign_status", e.target.value)}>
                <option value="">— yuborilmagan</option>
                <option value="sent">Yuborildi (Didox)</option>
                <option value="signed">Imzolandi</option>
              </select>
            </label>
            {d.sign_status === "sent" && d.sign_sent_at ? <div className={`${SMALL} -mt-1 mb-1 text-right`}>yuborilgan: {dt(d.sign_sent_at)}</div> : null}
            <label className={FR}>
              <span>Yuk xati</span>
              <span className="flex min-w-0 items-center gap-2">
                <input type="checkbox" className="ck" defaultChecked={!!d.docs_done} onChange={(e) => onSave("docs_done", e.target.checked)} />
                <span className={`${SMALL} min-w-0 leading-tight`} title="Yuk xati va dalolatnoma imzolandi — «Yutildi» sharti">dalolatnoma imzolandi</span>
              </span>
            </label>
          </details>
          {d.linked?.length ? (
            <div className={BOX}>
              <h4 className={BOX_H}>Bog&apos;langan bitimlar</h4>
              {d.linked.map((x) => (
                <button key={x.id} type="button" className={`${DLR} ${DLR_TAP} w-full cursor-pointer border-0 bg-transparent text-left`} onClick={() => onOpenDeal(x.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {x.rel === "parent" ? "← " : "→ "}
                      {pipelines.find((p) => p.code === x.pipeline)?.name ?? x.pipeline} · #{x.id}
                    </span>
                    <span className={SMALL}>{stg[x.stage]?.name ?? x.stage}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {d.docs.length ? (
            <div className={BOX}>
              <h4 className={BOX_H}>
                Hujjatlar <span>{d.docs.length || ""}</span>
              </h4>
              {d.docs.map((x) => (
                <div
                  key={x.id}
                  className={`${DLR} ${DLR_TAP}`}
                  role="link"
                  tabIndex={0}
                  onClick={() => onOpenDoc(x.id)}
                  onKeyDown={(e) => e.key === "Enter" && onOpenDoc(x.id)}
                >
                  <Icon n={x.kind === "order" ? "cart" : "file"} />
                  <div className="m">
                    <div>
                      <span className="code">{x.number || "qoralama"}</span> · {KIND[x.kind] || x.kind}
                    </div>
                    <div className={SMALL}>
                      {d8(x.date)} · {x.status === "draft" ? "qoralama" : (x.state && DST[x.state]) || "o'tkazilgan"}
                    </div>
                  </div>
                  <b className="num">{num(x.total, 0)}</b>
                  <Icon n="chevron-right" />
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="min-w-0 overflow-y-auto px-5 pt-4 pb-[30px] max-[900px]:overflow-visible max-md:px-3 max-md:pt-3 max-md:pb-10">
          {items}
          {activity}
        </div>
      </div>
    </>
  );
}
