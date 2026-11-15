// Mijozlar (faqat ko'rinish): jadval (xaridlar, oxirgi va keyingi kutilgan xarid, ochiq bitimlar) va kartochka paneli
// (rekvizit, kontakt shaxslar, izoh, statistika, bitimlar, Telegram chatlari, «Yangi bitim»).
import type { ReactNode } from "react";

import { dt, short } from "@/erp/kit/fmt";
import { Empty, Icon, Loaded } from "@/erp/kit/ui";
import { AvaView } from "@/erp/crm/badges";
import type { Contact, CustomerCard, CustomersResp, Meta, Stage } from "@/erp/crm/lib";
import { BOX, BOX_H, DLR, DLR_TAP, FR, FR_TOP, PANE, RT, SMALL, SRCH, SUM, TB_IN, TTL, X } from "@/erp/crm/tw";

const SORTS: [string, string][] = [
  ["next", "Keyingi xarid"],
  ["last", "Oxirgi xarid"],
  ["sum", "Summa"],
  ["name", "Nomi"],
];

/** "2026-12-01" → "01.12.26"; bugungacha qolgan/o'tgan kun */
const dshort = (d: string | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(2, 4)}` : "—");
export const daysTo = (d: string | null, now = Date.now()): number | null => (d ? Math.round((new Date(d).getTime() - now) / 864e5) : null);
const dueText = (n: number | null) => (n === null ? "" : n < 0 ? `${-n} kun o'tdi` : n === 0 ? "bugun" : `${n} kundan keyin`);

export function CustomersView({
  st,
  q,
  sort,
  users,
  onQ,
  onSort,
  onOpen,
}: {
  st: { data: CustomersResp | undefined; err: string; net?: boolean; reload?: () => Promise<void> };
  q: string;
  sort: string;
  users: Record<number, string>;
  onQ: (v: string) => void;
  onSort: (v: string) => void;
  onOpen: (id: number) => void;
}) {
  return (
    <div className={PANE}>
      <div className={TB_IN}>
        <div className={SRCH}>
          <Icon n="search" />
          <input className="inp" type="search" value={q} placeholder="Nomi, STIR, telefon, kontakt" aria-label="Mijoz qidirish" onChange={(e) => onQ(e.target.value)} />
        </div>
        <select className="sel" aria-label="Saralash" value={sort} onChange={(e) => onSort(e.target.value)}>
          {SORTS.map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
        {st.data ? (
          <span className={SUM}>
            {st.data.total} mijoz
            {st.data.overdue ? <b className="text-danger"> · {st.data.overdue} tasida xarid vaqti o&apos;tgan</b> : null}
          </span>
        ) : null}
      </div>
      <Loaded st={st}>
        {(r) =>
          r.rows.length ? (
            <table className={RT}>
              <thead>
                <tr>
                  <th>Mijoz</th>
                  <th>Mas&apos;ul</th>
                  <th>Xaridlar</th>
                  <th>Oxirgi xarid</th>
                  <th>Keyingi xarid</th>
                  <th>Ochiq bitim</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((c) => {
                  const n = daysTo(c.next_buy);
                  return (
                    <tr key={c.id} className="cursor-pointer hover:bg-fill" tabIndex={0} onClick={() => onOpen(c.id)} onKeyDown={(e) => e.key === "Enter" && onOpen(c.id)}>
                      <td className={TTL}>
                        <b>{c.name}</b>
                        <div className={SUM}>{[c.inn && `STIR ${c.inn}`, c.phones?.[0] && `+${c.phones[0]}`].filter(Boolean).join(" · ") || "—"}</div>
                      </td>
                      <td data-l="Mas'ul">{c.owner_tg ? users[c.owner_tg] || c.owner_tg : "—"}</td>
                      <td data-l="Xaridlar" className="tabular-nums">
                        {c.bought_n ? `${c.bought_n} ta · ${short(c.bought_sum)}` : "—"}
                      </td>
                      <td data-l="Oxirgi xarid" className="tabular-nums">
                        {dshort(c.last_buy)}
                      </td>
                      <td data-l="Keyingi xarid" className="tabular-nums">
                        {c.next_buy ? (
                          <span className={c.overdue ? "font-semibold text-danger" : n !== null && n <= 7 ? "font-semibold text-st-work" : ""}>
                            {dshort(c.next_buy)} <span className={SMALL}>({dueText(n)})</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-l="Ochiq bitim" className="tabular-nums">
                        {c.open_n || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <Empty icon="users" title={q ? "Topilmadi" : "Mijoz yo'q"}>
              {q ? "Boshqa so'z bilan qidiring." : "Mijozlar bitim ochilganda yoki liddan bitimga aylanganda qo'shiladi."}
            </Empty>
          )
        }
      </Loaded>
    </div>
  );
}

export function CustomerCardView({
  c,
  users,
  isHead,
  stg,
  pipelines,
  contacts,
  onSave,
  onContacts,
  onOpenDeal,
  onNewDeal,
  onClose,
}: {
  c: CustomerCard;
  users: Meta["users"];
  isHead: boolean;
  stg: Record<string, Stage>;
  pipelines: Meta["pipelines"];
  /** tahrirlanayotgan kontaktlar ro'yxati */
  contacts: Contact[];
  onSave: (field: string, value: unknown) => void;
  onContacts: (list: Contact[], save: boolean) => void;
  onOpenDeal: (id: number) => void;
  onNewDeal: () => void;
  onClose: () => void;
}) {
  const s = c.stats;
  const n = daysTo(s.next_buy);
  const setContact = (i: number, k: keyof Contact, v: string) => onContacts(contacts.map((x, j) => (j === i ? { ...x, [k]: v } : x)), false);
  return (
    <>
      <div className="flex-none border-b border-sep bg-sec px-[22px] pt-3 pb-2.5 max-md:px-3 max-md:pt-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="m-0 min-w-0 flex-1 truncate text-lg font-bold">{c.name}</h2>
          <button type="button" className="b pri" onClick={onNewDeal}>
            <Icon n="plus" /> Bitim
          </button>
          <button type="button" className={X} onClick={onClose} aria-label="Yopish">
            <Icon n="x" />
          </button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[380px_minmax(0,1fr)] overflow-hidden max-[900px]:grid-cols-1 max-[900px]:overflow-y-auto">
        <div className="min-w-0 overflow-y-auto border-r border-sep px-[22px] pt-4 pb-[30px] max-[900px]:overflow-visible max-[900px]:border-r-0 max-[900px]:pb-0 max-md:px-3 max-md:pt-3">
          <div className={BOX}>
            <h4 className={BOX_H}>Rekvizitlar</h4>
            <label className={FR}>
              <span>Nomi</span>
              <input defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && onSave("name", e.target.value.trim())} />
            </label>
            <label className={FR}>
              <span>STIR</span>
              <input className="code" inputMode="numeric" defaultValue={c.inn || ""} placeholder="9 xonali" onBlur={(e) => e.target.value.trim() !== (c.inn || "") && onSave("inn", e.target.value.trim())} />
            </label>
            <label className={FR}>
              <span>Telefonlar</span>
              <input
                inputMode="tel"
                defaultValue={(c.phones || []).map((p) => `+${p}`).join(", ")}
                placeholder="+998 …, +998 …"
                onBlur={(e) => {
                  const list = e.target.value.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
                  if (list.join() !== (c.phones || []).map((p) => `+${p}`).join()) onSave("phones", list);
                }}
              />
            </label>
            <label className={FR}>
              <span>Mas&apos;ul</span>
              <select disabled={!isHead} defaultValue={c.owner_tg != null ? String(c.owner_tg) : ""} onChange={(e) => onSave("owner_tg", e.target.value || null)}>
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.tg_id} value={u.tg_id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${FR} ${FR_TOP}`}>
              <span>Izoh</span>
              <textarea defaultValue={c.note} placeholder="To'lov sharti, yetkazish manzili, odatlari…" onBlur={(e) => e.target.value !== c.note && onSave("note", e.target.value)} />
            </label>
          </div>
          <div className={BOX}>
            <h4 className={BOX_H}>Kontakt shaxslar</h4>
            {contacts.map((x, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-1.5 [&_input]:min-w-0 [&_input]:rounded-md [&_input]:border [&_input]:border-sep [&_input]:bg-page [&_input]:px-2 [&_input]:py-1.5">
                <input value={x.name} placeholder="Ism" aria-label="Kontakt ismi" onChange={(e) => setContact(i, "name", e.target.value)} onBlur={() => onContacts(contacts, true)} />
                <input value={x.role} placeholder="Lavozim" aria-label="Lavozim" onChange={(e) => setContact(i, "role", e.target.value)} onBlur={() => onContacts(contacts, true)} />
                <button type="button" className="b ic" aria-label="Kontaktni o'chirish" onClick={() => onContacts(contacts.filter((_, j) => j !== i), true)}>
                  <Icon n="x" />
                </button>
                <input className="col-span-2" value={x.phone} inputMode="tel" placeholder="Telefon" aria-label="Kontakt telefoni" onChange={(e) => setContact(i, "phone", e.target.value)} onBlur={() => onContacts(contacts, true)} />
                {x.phone ? (
                  <a className="b ic" href={`tel:+${x.phone.replace(/\D/g, "")}`} aria-label="Qo'ng'iroq">
                    <Icon n="phone" />
                  </a>
                ) : (
                  <span />
                )}
              </div>
            ))}
            <button type="button" className="b" onClick={() => onContacts([...contacts, { name: "", role: "", phone: "" }], false)}>
              <Icon n="plus" /> Kontakt
            </button>
          </div>
        </div>
        <div className="min-w-0 overflow-y-auto px-[22px] pt-4 pb-[30px] max-md:px-3">
          <div className={BOX}>
            <h4 className={BOX_H}>Xaridlar</h4>
            <div className="grid grid-cols-4 gap-2 max-md:grid-cols-2 [&>div]:rounded-lg [&>div]:bg-fill [&>div]:px-3 [&>div]:py-2 [&_b]:block [&_b]:text-base [&_b]:tabular-nums">
              <Stat label="Xaridlar">{s.bought_n}</Stat>
              <Stat label="Jami">{s.bought_n ? short(s.bought_sum) : "—"}</Stat>
              <Stat label="Odatda har">{s.cycle ? `${s.cycle} kunda` : "—"}</Stat>
              <Stat label="Keyingi xarid">
                {s.next_buy ? (
                  <span className={n !== null && n < 0 ? "text-danger" : ""}>
                    {dshort(s.next_buy)} <span className={SMALL}>{dueText(n)}</span>
                  </span>
                ) : (
                  "—"
                )}
              </Stat>
            </div>
            {s.last_buy ? <div className={`${SUM} mt-2`}>Oxirgi xarid: {dshort(s.last_buy)}</div> : null}
          </div>
          <div className={BOX}>
            <h4 className={BOX_H}>
              Bitimlar <span className="text-hint">{c.deals.length || ""}</span>
            </h4>
            {c.deals.length ? (
              c.deals.map((d) => (
                <button key={d.id} type="button" className={`${DLR} ${DLR_TAP} w-full cursor-pointer border-0 bg-transparent text-left`} onClick={() => onOpenDeal(d.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {d.title}
                      {d.repeat ? <span className={SMALL}> · takroriy</span> : null}
                    </span>
                    <span className={SMALL}>
                      {pipelines.find((p) => p.code === d.pipeline)?.name ?? d.pipeline} · {stg[d.stage]?.name ?? d.stage} · {dt(d.created)}
                    </span>
                  </span>
                  <span className="flex-none font-semibold tabular-nums">{Number(d.amount) ? short(d.amount) : ""}</span>
                </button>
              ))
            ) : (
              <div className={SUM}>Bitim yo&apos;q — «Bitim» tugmasi bilan oching.</div>
            )}
          </div>
          {c.tg.length ? (
            <div className={BOX}>
              <h4 className={BOX_H}>Telegram</h4>
              {c.tg.map((x) => (
                <div key={x.id} className={DLR}>
                  <AvaView name={x.title} />
                  <span className="min-w-0 flex-1 truncate">{x.title}</span>
                  {x.username ? (
                    <a className="text-link" href={`https://t.me/${x.username}`} target="_blank" rel="noreferrer">
                      @{x.username}
                    </a>
                  ) : null}
                  {x.unread ? <b className="rounded-full bg-[#2aabee] px-1.5 text-[11px] leading-[18px] text-white">{x.unread}</b> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

const Stat = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <span className={SMALL}>{label}</span>
    <b>{children}</b>
  </div>
);
