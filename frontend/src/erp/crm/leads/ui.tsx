// Lidlar (faqat ko'rinish): qidiruv, holat, mas'ul filtri, soni; jadval (telefonda — kartochkalar) — taqsimlash
// (ROP), bitimga aylantirish, yaroqsiz; yangi lid formasi.
import type { ReactNode } from "react";

import { ago, dt, dtitle } from "@/erp/kit/fmt";
import { Modal } from "@/erp/kit/modal";
import { Empty, Icon, Loaded } from "@/erp/kit/ui";
import { AvaView } from "@/erp/crm/badges";
import { leadWait, LSRC, waitText, type Lead, type Meta } from "@/erp/crm/lib";

export const STATES: [string, string][] = [
  ["new,work", "Ochiq"],
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
  /** yangi lid oynasi */
  children?: ReactNode;
}) {
  return (
    <div className="pane">
      <div className="tb in">
        <div className="srch">
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
        <select className="sel" aria-label="Mas'ul" value={owner} onChange={(e) => onOwner(e.target.value)}>
          <option value="">Barcha mas&apos;ullar</option>
          <option value="none">Taqsimlanmagan</option>
          {sellers.map((u) => (
            <option key={u.tg_id} value={u.tg_id}>
              {u.name}
            </option>
          ))}
        </select>
        {st.data ? (
          <span className="sum">
            {st.data.length} lid
            {st.data.some((l) => !l.owner_tg) ? <b className="bad-t"> · {st.data.filter((l) => !l.owner_tg).length} taqsimlanmagan</b> : null}
          </span>
        ) : null}
        <span className="sp" />
        <button type="button" className="b pri" onClick={onAdd}>
          <Icon n="plus" /> Lid
        </button>
      </div>
      <Loaded st={st}>
        {(ls) =>
          ls.length ? (
            <table className="t rt">
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
                        <div className="sum">{ago(l.created)}</div>
                      </td>
                      <td className="ttl">
                        <b>{dtitle(l.title || l.name || "—")}</b>
                        {l.company ? <div className="sum">{l.company}</div> : null}
                        {l.note ? <div className="sum">{l.note.slice(0, 120)}</div> : null}
                      </td>
                      <td data-l="Telefon">
                        {l.phone ? (
                          <a href={`tel:+${l.phone}`} className="num">
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
                          <span className="who">
                            <AvaView name={users[l.owner_tg] || "—"} /> {users[l.owner_tg] || ""}
                          </span>
                        ) : (
                          <span className="idle bad">taqsimlanmagan</span>
                        )}
                      </td>
                      <td data-l="Javob">
                        {wait !== null ? <span className={`idle ${wait > 30 ? "bad" : ""}`}>{waitText(wait)} kutmoqda</span> : l.first_touch ? "✓" : ""}
                      </td>
                      <td className="acts2">
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

export type LeadForm = { name: string; phone: string; company: string; source: string; note: string };

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
