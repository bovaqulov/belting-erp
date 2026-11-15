// Bitim paneli (faqat ko'rinish): ramka (o'ngdan; telefonda to'liq ekran), yuklanish/xato holati, sarlavha (nom,
// voronka, bosqich strelkalari, yakunlash, bosqich ko'rsatmasi), chapda — maydonlar va hujjatlar, o'ngda — tovarlar va tarix.
import type { ReactNode, RefObject } from "react";

import { d8, dnum, dt, dtitle, num } from "@/erp/kit/fmt";
import { Empty, Icon, Skeleton } from "@/erp/kit/ui";
import { DST, KIND, SRC, type DealDetail, type Meta, type Stage } from "@/erp/crm/lib";
import { BOX, BOX_H, DLR, DLR_TAP, FR, FR_TOP, PILL, SMALL, SP, X } from "@/erp/crm/tw";

export function DrawerFrame({
  on,
  title,
  panelRef,
  onClose,
  children,
}: {
  on: boolean;
  title: string;
  panelRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className={`fixed inset-0 z-50 bg-black/35 transition-opacity duration-150 ${on ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <div className={`fixed top-0 right-0 bottom-0 z-51 flex w-[min(1080px,94vw)] flex-col bg-page text-sm shadow-[-8px_0_30px_rgba(0,0,0,.25)] transition-transform duration-200 max-md:w-screen ${on ? "translate-x-0" : "translate-x-full"}`} role="dialog" aria-modal="true" aria-label={title} ref={panelRef}>
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
  onClose,
  onSave,
  onPipe,
  onMove,
  onFinish,
  onAmount,
  onAmountBlur,
  onPdf,
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
  onClose: () => void;
  onSave: (field: string, value: unknown) => void;
  onPipe: (code: string) => void;
  onMove: (code: string) => void;
  onFinish: () => void;
  onAmount: (v: string) => void;
  onAmountBlur: () => void;
  onPdf: (docId: number) => void;
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
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 !text-xl font-bold text-fg outline-none [font-family:inherit] hover:border-sep focus:border-link focus:bg-page max-md:!text-lg"
            defaultValue={dtitle(d.title)}
            aria-label="Bitim nomi"
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== dtitle(d.title)) onSave("title", v);
            }}
          />
          <span className="text-hint tabular-nums max-md:hidden">#{d.id}</span>
          <a className="b ic" href={`/app/erp/savdo?mobile=1&deal=${d.id}`} target="_blank" rel="noreferrer" title="Telefon ko'rinishida" aria-label="Telefon ko'rinishida">
            <Icon n="link" />
          </a>
          <button type="button" className={X} onClick={onClose} aria-label="Yopish">
            <Icon n="x" />
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
          <div className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:thin] max-md:basis-full" role="group" aria-label="Bosqichlar">
            {opn.map((s, i) => {
              const done = isOpen && i <= cur;
              return (
                <button
                  key={s.code}
                  type="button"
                  className={`-mr-2 min-w-[70px] flex-[1_0_auto] cursor-pointer border-0 py-2 pr-[18px] pl-[22px] text-[12.5px] whitespace-nowrap [clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%,10px_50%)] first:rounded-l-md first:pl-3.5 first:[clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%)] hover:brightness-108 coarse:min-h-11 ${done ? "text-white" : "bg-fill text-hint"} ${s.code === d.stage ? "font-semibold text-white" : ""}`}
                  style={done ? { background: s.color || "var(--link)" } : undefined}
                  aria-current={s.code === d.stage ? "step" : undefined}
                  title={s.name}
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
        {isOpen && st?.guide ? (
          <div className="mt-2 rounded-lg bg-fill px-3 py-[7px] text-[13px] text-fg [&_b]:mr-1.5 [&_b]:font-semibold [&_b]:text-hint">
            <b>Bu bosqichda:</b>
            {st.guide}
          </div>
        ) : null}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[380px_minmax(0,1fr)] overflow-hidden max-[900px]:grid-cols-1 max-[900px]:overflow-y-auto">
        <div className="min-w-0 overflow-y-auto border-r border-sep px-[22px] pt-4 pb-[30px] max-[900px]:overflow-visible max-[900px]:border-r-0 max-[900px]:pb-0 max-md:px-3 max-md:pt-3">
          <div className={BOX}>
            <h4 className={BOX_H}>Shartnoma va to&apos;lov</h4>
            <label className={FR}>
              <span>To&apos;lov sharti</span>
              <select defaultValue={d.pay_terms ?? "full"} onChange={(e) => onSave("pay_terms", e.target.value)}>
                <option value="full">100% oldindan</option>
                <option value="half">50/50</option>
              </select>
            </label>
            <div className={FR}>
              <span>To&apos;langan</span>
              <div className="flex min-w-0 items-center gap-2">
                <span className="tabular-nums">
                  <b>{num(d.paid_sum ?? 0, 0)}</b>
                  <span className="text-hint"> / {num(d.amount ?? 0, 0)} so&apos;m</span>
                </span>
                <span className={SP} />
                <button type="button" className="b h-7 flex-none px-2 text-[13px] coarse:h-11" onClick={onPayment}>
                  <Icon n="plus" /> To&apos;lov
                </button>
              </div>
            </div>
            {Number(d.amount) ? (
              <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden="true">
                <div className="h-full rounded-full bg-ok" style={{ width: `${Math.min(100, (Number(d.paid_sum ?? 0) / Number(d.amount)) * 100)}%` }} />
              </div>
            ) : null}
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
              <span>Yuk xati va dalolatnoma</span>
              <span className="flex items-center gap-2">
                <input type="checkbox" className="ck" defaultChecked={!!d.docs_done} onChange={(e) => onSave("docs_done", e.target.checked)} />
                <span className={SMALL}>imzolandi — «Yutildi» sharti</span>
              </span>
            </label>
          </div>
          <div className={BOX}>
            <h4 className={BOX_H}>Bitim haqida</h4>
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
              <span>Kontakt</span>
              <input defaultValue={d.contact || ""} placeholder="Ism, lavozim" onBlur={(e) => e.target.value !== (d.contact || "") && onSave("contact", e.target.value)} />
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
            <label className={`${FR} ${FR_TOP}`}>
              <span>Ehtiyoj</span>
              <textarea defaultValue={d.need || ""} placeholder="Mijozga nima kerak?" onBlur={(e) => e.target.value !== (d.need || "") && onSave("need", e.target.value)} />
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
          </div>
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
                onClick={(e) => !(e.target as HTMLElement).closest("[data-pdf]") && window.open(`/app/erp/savdo?mobile=1&deal=${d.id}&doc=${x.id}`, "_blank")}
                onKeyDown={(e) => e.key === "Enter" && window.open(`/app/erp/savdo?mobile=1&deal=${d.id}&doc=${x.id}`, "_blank")}
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
                {["quote", "order"].includes(x.kind) ? (
                  <button type="button" className="b ic" data-pdf title="PDF" aria-label="PDF" onClick={() => onPdf(x.id)}>
                    <Icon n="download" />
                  </button>
                ) : null}
              </div>
            ))}
            {!d.docs.length ? (
              <div className={DLR}>
                <span className={SMALL}>Hujjat yo&apos;q — tovarlardan taklif yoki buyurtma tuzing</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="min-w-0 overflow-y-auto px-[22px] pt-4 pb-[30px] max-[900px]:overflow-visible max-md:px-3 max-md:pt-3 max-md:pb-10">
          {items}
          {activity}
        </div>
      </div>
    </>
  );
}
