// Lidlar (faqat ko'rinish): qidiruv, holat, mas'ul filtri, soni; jadval (telefonda — kartochkalar) — taqsimlash
// (ROP), bitimga aylantirish, yaroqsiz; yangi lid formasi.
import type { ReactNode } from "react";

import { ago, dt, dtitle } from "@/erp/kit/fmt";
import { Modal } from "@/erp/kit/modal";
import { Empty, Icon, Loaded } from "@/erp/kit/ui";
import { AvaView } from "@/erp/crm/badges";
import { LEAD_STAGES, leadWait, LSRC, waitText, type Lead, type Meta } from "@/erp/crm/lib";
import { idle, PANE, RT, SP, SRCH, SUM, TACTS, TB_IN, TTL, WHO } from "@/erp/crm/tw";
import { chOf } from "@/erp/crm/telegram/tg.lib";

export const OPEN = "new,work,interested";
export const STATES: [string, string][] = [
  [OPEN, "Ochiq"],
  ["converted", "Bitimga aylangan"],
  ["junk", "Yaroqsiz"],
];

export function LeadsView({
  st,
  q,
  stf,
  owner,
  sellers,
  users,
  isHead,
  onQ,
  onStf,
  onOwner,
  onAdd,
  onAssign,
  onOpenDeal,
  onConvert,
  onJunk,
  onMove,
  onEdit,
  onNoAnswer,
  onChat,
  tgButton,
  onRouting,
  children,
}: {
  st: { data: Lead[] | undefined; err: string; net?: boolean; reload?: () => Promise<void> };
  q: string;
  stf: string;
  owner: string;
  sellers: Meta["users"];
  users: Record<number, string>;
  isHead: boolean;
  onQ: (v: string) => void;
  onStf: (v: string) => void;
  onOwner: (v: string) => void;
  onAdd: () => void;
  onAssign: (l: Lead, tg: number) => void;
  onOpenDeal: (id: number) => void;
  onConvert: (l: Lead) => void;
  onJunk: (l: Lead) => void;
  onMove: (l: Lead, status: string) => void;
  /** kvalifikatsiya maydonini saqlash */
  onEdit: (l: Lead, field: string, value: string) => void;
  /** javob bermadi (1, 3, 7 kun) */
  onNoAnswer: (l: Lead) => void;
  /** Telegram chatini ochish (panel) */
  onChat: (chatId: number) => void;
  /** kichik ekranda Telegram panelini ochish tugmasi */
  tgButton?: ReactNode;
  /** taqsimlash qoidalari (rahbar) */
  onRouting: () => void;
  /** yangi lid oynasi */
  children?: ReactNode;
}) {
  return (
    <div className={PANE}>
      <div className={TB_IN}>
        <div className={SRCH}>
          <Icon n="search" />
          <input className="inp" value={q} placeholder="Ism, telefon, kompaniya" aria-label="Lid qidirish" onChange={(e) => onQ(e.target.value)} />
        </div>
        <div className="grp" role="group" aria-label="Holat">
          {STATES.map(([k, t]) => (
            <button key={k} type="button" className={`b ${stf === k ? "on" : ""}`} aria-pressed={stf === k} onClick={() => onStf(k)}>
              {t}
            </button>
          ))}
        </div>
        {isHead ? (
        <select className="sel" aria-label="Mas'ul" value={owner} onChange={(e) => onOwner(e.target.value)}>
          <option value="">Barcha mas&apos;ullar</option>
          <option value="none">Taqsimlanmagan</option>
          {sellers.map((u) => (
            <option key={u.tg_id} value={u.tg_id}>
              {u.name}
            </option>
          ))}
        </select>
        ) : null}
        {st.data ? (
          <span className={SUM}>
            {st.data.length} lid
            {st.data.some((l) => !l.owner_tg) ? <b className="text-danger"> · {st.data.filter((l) => !l.owner_tg).length} taqsimlanmagan</b> : null}
          </span>
        ) : null}
        <span className={SP} />
        {tgButton}
        {isHead ? (
          <button type="button" className="b" onClick={onRouting} title="Lid mahsulot / hudud bo'yicha qaysi sotuvchiga tushishi">
            <Icon n="settings" /> Taqsimlash
          </button>
        ) : null}
        <button type="button" className="b pri" onClick={onAdd}>
          <Icon n="plus" /> Lid
        </button>
      </div>
      <Loaded st={st}>
        {(ls) =>
          stf === OPEN ? (
            <LeadBoard leads={ls} users={users} sellers={sellers} isHead={isHead} onAssign={onAssign} onConvert={onConvert} onJunk={onJunk} onMove={onMove} onChat={onChat} onEdit={onEdit} onNoAnswer={onNoAnswer} />
          ) : ls.length ? (
            <table className={RT}>
              <thead>
                <tr>
                  <th>Kelgan</th>
                  <th>Lid</th>
                  <th>Telefon</th>
                  <th>Manba</th>
                  <th>Mas&apos;ul</th>
                  <th>Javob</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ls.map((l) => {
                  const wait = leadWait(l);
                  return (
                    <tr key={l.id}>
                      <td data-l="Kelgan">
                        {dt(l.created)}
                        <div className={SUM}>{ago(l.created)}</div>
                      </td>
                      <td className={TTL}>
                        <b>{dtitle(l.title || l.name || "—")}</b>
                        {l.company ? <div className={SUM}>{l.company}</div> : null}
                        {l.note ? <div className={SUM}>{l.note.slice(0, 120)}</div> : null}
                      </td>
                      <td data-l="Telefon">
                        {l.phone ? (
                          <a href={`tel:+${l.phone}`} className="num coarse:inline-flex coarse:min-h-11 coarse:items-center">
                            +{l.phone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-l="Manba">{LSRC[l.source || ""] || l.source || "—"}</td>
                      <td data-l="Mas'ul">
                        {isHead && l.status !== "converted" ? (
                          <select
                            className="sel"
                            aria-label="Mas'ul tanlash"
                            value={l.owner_tg != null ? String(l.owner_tg) : ""}
                            onChange={(e) => e.target.value && onAssign(l, Number(e.target.value))}
                          >
                            <option value="">— tanlang —</option>
                            {sellers.map((u) => (
                              <option key={u.tg_id} value={u.tg_id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        ) : l.owner_tg ? (
                          <span className={WHO}>
                            <AvaView name={users[l.owner_tg] || "—"} /> {users[l.owner_tg] || ""}
                          </span>
                        ) : (
                          <span className={idle(true)}>taqsimlanmagan</span>
                        )}
                      </td>
                      <td data-l="Javob">
                        {wait !== null ? <span className={idle(wait > 30)}>{waitText(wait)} kutmoqda</span> : l.first_touch ? "✓" : ""}
                      </td>
                      <td className={TACTS}>
                        {l.status === "converted" ? (
                          l.deal_id ? (
                            <button type="button" className="b" onClick={() => onOpenDeal(l.deal_id!)}>
                              Bitim
                            </button>
                          ) : null
                        ) : l.status === "junk" ? null : (
                          <>
                            <button
                              type="button"
                              className="b ok"
                              onClick={() => onConvert(l)}
                            >
                              <Icon n="check" /> Bitimga
                            </button>
                            <button
                              type="button"
                              className="b danger"
                              onClick={() => onJunk(l)}
                            >
                              Yaroqsiz
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <Empty icon="inbox" title="Lid yo'q">
              Yangi murojaat kelsa shu yerda ko&apos;rinadi. Qo&apos;ng&apos;iroqni qo&apos;lda qo&apos;shish — «Lid» tugmasi.
            </Empty>
          )
        }
      </Loaded>
      {children}
    </div>
  );
}

export type LeadForm = { name: string; phone: string; company: string; inn: string; region: string; product: string; size: string; qty: string; source: string; note: string };

export function NewLeadView({
  v,
  set,
  onClose,
  onOk,
}: {
  v: LeadForm;
  set: (k: keyof LeadForm) => (e: { target: { value: string } }) => void;
  onClose: () => void;
  onOk: () => Promise<boolean | void>;
}) {
  return (
    <Modal title="Yangi lid" ok="Qo'shish" onClose={onClose} onOk={onOk}>
      <label className="l">Ism</label>
      <input className="inp" value={v.name} onChange={set("name")} />
      <label className="l">Telefon</label>
      <input className="inp" value={v.phone} inputMode="tel" placeholder="+998 …" onChange={set("phone")} />
      <label className="l">Kompaniya</label>
      <input className="inp" value={v.company} onChange={set("company")} />
      <label className="l">STIR</label>
      <input className="inp" value={v.inn} inputMode="numeric" placeholder="9 xonali — doimiy mijoz shu bo'yicha ham topiladi" onChange={set("inn")} />
      <label className="l">Hudud</label>
      <input className="inp" value={v.region} placeholder="Taqsimlash qoidalari uchun (ixtiyoriy)" onChange={set("region")} />
      <label className="l">Tasma turi · o&apos;lcham · hajm</label>
      <div className="grid grid-cols-3 gap-2">
        <input className="inp" value={v.product} placeholder="SPB" aria-label="Tasma turi" onChange={set("product")} />
        <input className="inp" value={v.size} placeholder="1650" aria-label="O'lcham" onChange={set("size")} />
        <input className="inp" value={v.qty} placeholder="25 dona" aria-label="Hajm" onChange={set("qty")} />
      </div>
      <label className="l">Manba</label>
      <select className="sel" value={v.source} onChange={set("source")}>
        {Object.entries(LSRC).map(([k, t]) => (
          <option key={k} value={k}>
            {t}
          </option>
        ))}
      </select>
      <label className="l">Izoh</label>
      <textarea className="inp" value={v.note} placeholder="Nima so'radi?" onChange={set("note")} />
    </Modal>
  );
}

/** Ochiq lidlar kanbani: Yangi → Ishda → Qiziqish bildirdi; kartochkada — keyingi qadam, bitim, yaroqsiz, chat */
function LeadBoard({
  leads,
  users,
  sellers,
  isHead,
  onAssign,
  onConvert,
  onJunk,
  onMove,
  onChat,
  onEdit,
  onNoAnswer,
}: {
  leads: Lead[];
  users: Record<number, string>;
  sellers: Meta["users"];
  isHead: boolean;
  onAssign: (l: Lead, tg: number) => void;
  onConvert: (l: Lead) => void;
  onJunk: (l: Lead) => void;
  onMove: (l: Lead, status: string) => void;
  onChat: (chatId: number) => void;
  onEdit: (l: Lead, field: string, value: string) => void;
  onNoAnswer: (l: Lead) => void;
}) {
  return (
    <div className="flex min-h-0 gap-3 overflow-x-auto pb-4 max-md:snap-x max-md:snap-mandatory">
      {LEAD_STAGES.map(([code, name, hint], i) => {
        const col = leads.filter((l) => l.status === code);
        const next = LEAD_STAGES[i + 1];
        return (
          <section key={code} className="flex w-[300px] flex-none snap-start flex-col rounded-xl bg-fill p-2 max-md:w-[86vw]" aria-label={name}>
            <h3 className="m-0 flex items-baseline gap-2 px-1.5 pt-1 pb-2 text-[13.5px] font-semibold">
              {name}
              <span className="font-normal text-hint">{hint}</span>
              <span className={SP} />
              <span className="text-hint tabular-nums">{col.length}</span>
            </h3>
            <div className="flex flex-col gap-2">
              {col.length ? (
                col.map((l) => {
                  const wait = leadWait(l);
                  return (
                    <article key={l.id} className="rounded-lg bg-sec px-3 py-2.5 shadow-1">
                      <div className="flex items-start gap-2">
                        <b className="min-w-0 flex-1 leading-[1.3] [overflow-wrap:anywhere]">{dtitle(l.title || l.name || "—")}</b>
                        <span className="flex-none text-xs text-hint">{ago(l.created)}</span>
                      </div>
                      {l.company ? <div className={SUM}>{l.company}</div> : null}
                      <div className={`${SUM} mt-0.5`}>
                        {LSRC[l.source || ""] || l.source || "—"}
                        {l.tg?.username ? ` · @${l.tg.username}` : ""}
                        {l.phone ? (
                          <>
                            {" · "}
                            <a href={`tel:+${l.phone}`} className="num text-link coarse:-my-3.5 coarse:inline-block coarse:py-3.5">
                              +{l.phone}
                            </a>
                          </>
                        ) : null}
                      </div>
                      {l.note ? <div className="mt-1 line-clamp-2 text-[13px] text-sub">{l.note}</div> : null}
                      {wait !== null ? <div className={`${idle(wait > 30)} mt-1 text-xs`}>{waitText(wait)} javob kutmoqda</div> : null}
                      {l.next_call_at ? (
                        <div className="mt-1 text-xs text-st-work">
                          📞 Qayta qo&apos;ng&apos;iroq: {dt(l.next_call_at)} · {l.no_answer}/3 urinish
                        </div>
                      ) : null}
                      <Qualify l={l} onEdit={onEdit} />
                      <div className="mt-2 flex items-center gap-1.5">
                        {isHead ? (
                          <select
                            className="sel h-8 min-w-0 flex-1 py-0 text-[13px]"
                            aria-label="Mas'ul"
                            value={l.owner_tg != null ? String(l.owner_tg) : ""}
                            onChange={(e) => e.target.value && onAssign(l, Number(e.target.value))}
                          >
                            <option value="">— taqsimlang —</option>
                            {sellers.map((u) => (
                              <option key={u.tg_id} value={u.tg_id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        ) : l.owner_tg ? (
                          <span className={`${WHO} min-w-0 flex-1 truncate`}>
                            <AvaView name={users[l.owner_tg] || "—"} /> {users[l.owner_tg] || ""}
                          </span>
                        ) : (
                          <span className={`${idle(true)} flex-1`}>taqsimlanmagan</span>
                        )}
                        {l.tg ? (
                          <button type="button" className="b h-8 flex-none px-2 text-[13px] coarse:h-11" onClick={() => onChat(l.tg!.chat_id)} title={`${chOf(l.tg.channel).name} yozishmasi`}>
                            <span className="contents" style={{ color: chOf(l.tg.channel).color }}>
                              <Icon n={chOf(l.tg.channel).icon} />
                            </span>{" "}
                            Chat
                            {l.tg.unread ? (
                              <b className="ml-0.5 rounded-full px-1.5 text-[11px] leading-[18px] text-white" style={{ background: chOf(l.tg.channel).color }}>
                                {l.tg.unread}
                              </b>
                            ) : null}
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 [&>.b]:h-8 [&>.b]:px-2.5 [&>.b]:text-[13px] coarse:[&>.b]:h-11">
                        {next ? (
                          <button type="button" className="b" onClick={() => onMove(l, next[0])}>
                            → {next[1]}
                          </button>
                        ) : null}
                        <button type="button" className={`b ${code === "interested" ? "pri" : "ok"}`} onClick={() => onConvert(l)}>
                          <Icon n="check" /> Bitim ochish
                        </button>
                        <button type="button" className="b" onClick={() => onNoAnswer(l)} title="1, 3 va 7 kunda qayta qo'ng'iroq rejalashtiriladi; uchinchisidan keyin lid yopiladi">
                          Javob bermadi
                        </button>
                        <button type="button" className="b danger" onClick={() => onJunk(l)} title="Rad etish — sabab majburiy">
                          Yaroqsiz
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className={`${SUM} px-2 py-4 text-center`}>{code === "new" ? "Yangi murojaat yo'q" : "Bo'sh"}</div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Kvalifikatsiya: tasma turi, o'lcham, hajm, kompaniya, STIR — bitimga aylantirish uchun tasma turi va kompaniya majburiy */
const QFIELDS: [keyof Lead, string, string][] = [
  ["product", "Tasma turi", "SPB, 8PK, EP-400/3…"],
  ["size", "O'lcham", "1650 mm, 800 mm…"],
  ["qty", "Hajm", "25 dona, 60 m…"],
  ["company", "Kompaniya", "MChJ nomi"],
  ["inn", "STIR", "9 xonali"],
  ["region", "Hudud", "Toshkent, Samarqand…"],
];

function Qualify({ l, onEdit }: { l: Lead; onEdit: (l: Lead, field: string, value: string) => void }) {
  const filled = QFIELDS.filter(([k]) => k !== "region" && String(l[k] ?? "").trim()).length;
  const ready = !!String(l.product ?? "").trim() && !!String(l.company ?? l.name ?? "").trim();
  return (
    <details className="mt-1.5 rounded-md bg-fill px-2 py-1 text-[13px]" open={!ready && l.status !== "new"}>
      <summary className={`cursor-pointer select-none text-xs font-semibold ${ready ? "text-ok" : "text-st-work"}`}>
        Kvalifikatsiya {filled}/{QFIELDS.length - 1}
        {ready ? " ✓" : " — tasma turi va kompaniya kerak"}
      </summary>
      <div className="mt-1 grid grid-cols-[84px_1fr] items-center gap-x-2 gap-y-1">
        {QFIELDS.map(([k, label, ph]) => (
          <label key={k} className="contents">
            <span className="text-xs text-hint">{label}</span>
            <input
              className="min-w-0 rounded border border-sep bg-sec px-1.5 py-1 text-[13px] coarse:min-h-11"
              defaultValue={String(l[k] ?? "")}
              placeholder={ph}
              inputMode={k === "inn" ? "numeric" : undefined}
              onBlur={(e) => e.target.value.trim() !== String(l[k] ?? "") && onEdit(l, k, e.target.value.trim())}
            />
          </label>
        ))}
      </div>
    </details>
  );
}

export type Rule = { kind: "product" | "region"; keywords: string; seller_tg: number | null };

/** Taqsimlash qoidalari: tartib bo'yicha birinchi mos qoida; mos kelmasa — navbat (eng kam lid olgan sotuvchiga) */
export function RoutingView({
  rules,
  sellers,
  onChange,
  onClose,
  onOk,
}: {
  rules: Rule[];
  sellers: Meta["users"];
  onChange: (rules: Rule[]) => void;
  onClose: () => void;
  onOk: () => Promise<boolean | void>;
}) {
  const set = (i: number, p: Partial<Rule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <Modal title="Lidlarni taqsimlash qoidalari" ok="Saqlash" onClose={onClose} onOk={onOk}>
      <p className={`${SUM} mt-0`}>
        Yangi lid kelganda qoidalar yuqoridan pastga tekshiriladi: mahsulot — tasma turi va izohda, hudud — hudud, kompaniya va izohda
        kalit so&apos;z bo&apos;lsa, o&apos;sha sotuvchiga tushadi. Mos qoida bo&apos;lmasa — navbat bo&apos;yicha (eng kam lid olgan sotuvchiga).
      </p>
      <div className="flex flex-col gap-2">
        {rules.map((r, i) => (
          <div key={i} className="grid grid-cols-[110px_1fr_150px_auto] items-center gap-2 max-md:grid-cols-[1fr_auto] max-md:rounded-lg max-md:bg-fill max-md:p-2">
            <select className="sel" aria-label="Qoida turi" value={r.kind} onChange={(e) => set(i, { kind: e.target.value as Rule["kind"] })}>
              <option value="product">Mahsulot</option>
              <option value="region">Hudud</option>
            </select>
            <input className="inp max-md:order-3 max-md:col-span-2" value={r.keywords} aria-label="Kalit so'zlar" placeholder={r.kind === "product" ? "konveyer, lenta" : "Samarqand, Buxoro"} onChange={(e) => set(i, { keywords: e.target.value })} />
            <select className="sel max-md:order-4 max-md:col-span-2" aria-label="Sotuvchi" value={r.seller_tg ?? ""} onChange={(e) => set(i, { seller_tg: Number(e.target.value) || null })}>
              <option value="">— sotuvchi —</option>
              {sellers.map((u) => (
                <option key={u.tg_id} value={u.tg_id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button type="button" className="b ic max-md:order-2" aria-label="Qoidani o'chirish" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
              <Icon n="x" />
            </button>
          </div>
        ))}
        {!rules.length ? <div className={SUM}>Qoida yo&apos;q — hamma lid navbat bo&apos;yicha taqsimlanadi.</div> : null}
        <button type="button" className="b self-start" onClick={() => onChange([...rules, { kind: "product", keywords: "", seller_tg: null }])}>
          <Icon n="plus" /> Qoida
        </button>
      </div>
    </Modal>
  );
}
