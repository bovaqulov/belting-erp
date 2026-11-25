// Pul hujjatlari jurnali (1C «Банк и касса»): tur (kirim / chiqim / o'tkazish), qidiruv, davr, hisob filtri,
// «Yaratish»; kompyuterda jadval, telefonda ro'yxat.
import { useEffect, useState } from "react";

import { api } from "@/erp/kit/env";
import { Tbl } from "@/erp/kit/table";
import { Empty, Icon, List, Loaded, Row, Seg, useLoad } from "@/erp/kit/ui";

import { cur, KIND, STATUS, sum, when, type Kind, type Row as DocRow } from "./lib";

type K = "" | Kind;
const KINDS: [K, string][] = [
  ["", "Hammasi"],
  ["in", "Kirim"],
  ["out", "Chiqim"],
  ["transfer", "O'tkazish"],
];
const MENU = "absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-sep bg-page py-1 shadow-2";

export function CreateMenu({ onCreate }: { onCreate: (k: Kind) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex-none">
      <button type="button" className="b pri h-10 coarse:h-11" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon n="plus" /> Yaratish <Icon n="chevron-down" />
      </button>
      {open ? (
        <div className={MENU} role="menu">
          {(Object.keys(KIND) as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2.5 text-left hover:bg-fill coarse:min-h-11"
              onClick={() => {
                setOpen(false);
                onCreate(k);
              }}
            >
              <Icon n={KIND[k].icon} /> {KIND[k].t}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const signed = (r: DocRow, acc: number | null) => (r.kind === "in" || (r.kind === "transfer" && acc !== null && r.account_to_id === acc) ? "+" : r.kind === "out" || acc !== null ? "−" : "");

export function Journal({ wide, account, onClearAccount, onOpen, onCreate }: { wide: boolean; account: number | null; onClearAccount: () => void; onOpen: (id: number) => void; onCreate: (k: Kind) => void }) {
  const [kind, setKind] = useState<K>("");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [d1, setD1] = useState("");
  const [d2, setD2] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const st = useLoad(() => {
    const p = new URLSearchParams();
    if (kind) p.set("kind", kind);
    if (dq) p.set("q", dq);
    if (account) p.set("account_id", String(account));
    if (d1) p.set("from", d1);
    if (d2) p.set("to", d2);
    return api<{ rows: DocRow[]; more: boolean }>(`/app/api/erp/money/docs?${p}`);
  }, [kind, dq, account, d1, d2]);
  return (
    <>
      <Seg<K> items={KINDS} cur={kind} onPick={setKind} />
      <div className="mx-4 flex flex-wrap items-center gap-2">
        <label className="search !m-0 !h-10 min-w-0 flex-[1_1_220px] coarse:!h-11">
          <Icon n="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Raqam, kontragent, maqsad" aria-label="Qidirish" />
        </label>
        <input type="date" className="sel !h-10 flex-[0_1_150px] coarse:!h-11" value={d1} onChange={(e) => setD1(e.target.value)} aria-label="Davr boshi" />
        <input type="date" className="sel !h-10 flex-[0_1_150px] coarse:!h-11" value={d2} onChange={(e) => setD2(e.target.value)} aria-label="Davr oxiri" />
        <CreateMenu onCreate={onCreate} />
      </div>
      {account ? (
        <div className="mx-4 mt-2">
          <button type="button" className="mini" onClick={onClearAccount}>
            Hisob filtri <Icon n="x" />
          </button>
        </div>
      ) : null}
      <Loaded st={st}>
        {({ rows, more }) =>
          !rows.length ? (
            <Empty icon="file-text" title="Hujjat yo'q">
              «Yaratish» bilan kirim, chiqim yoki o&apos;tkazish kiriting.
            </Empty>
          ) : (
            <>
              <div className="sf !pt-2.5 pb-1.5 tabular-nums">
                {rows.length}
                {more ? "+" : ""} ta hujjat
              </div>
              {wide ? (
                <Tbl
                  label="Pul hujjatlari"
                  rows={rows}
                  rowKey={(r) => String(r.id)}
                  onRow={(r) => onOpen(r.id)}
                  cols={[
                    { h: "Sana", f: (r) => <span className="num whitespace-nowrap">{when(r.date)}</span>, w: "140px" },
                    { h: "Raqam", f: (r) => <span className="code whitespace-nowrap">{r.number}</span> },
                    { h: "Turi", f: (r) => <>{KIND[r.kind].t}<div className="t2">{r.kind === "transfer" ? `${r.account} → ${r.account_to}` : r.account}</div></> },
                    { h: "Kontragent / modda", f: (r) => <>{r.party ?? <span className="text-hint">—</span>}<div className="t2">{r.item ?? r.op_name}</div></> },
                    { h: "Summa", f: (r) => <span className={`num ${r.kind === "in" ? "text-st-done" : r.kind === "out" ? "text-st-bad" : ""}`}>{signed(r, account)}{sum(r.amount)} <small className="text-hint">{cur(r.currency)}</small></span>, n: true },
                    { h: "Holat", f: (r) => <span className="inline-flex flex-wrap gap-1"><span className={`st ${STATUS[r.status].st}`}>{STATUS[r.status].t}</span>{r.source_label ? <span className="st">sotuv {r.source_label}</span> : null}</span> },
                  ]}
                />
              ) : (
                <List>
                  {rows.map((r) => (
                    <Row
                      key={r.id}
                      icon={KIND[r.kind].icon}
                      color={r.status === "posted" ? KIND[r.kind].color : "gray"}
                      t={r.party ?? (r.kind === "transfer" ? `${r.account} → ${r.account_to}` : (r.item ?? r.op_name))}
                      s={`${r.number} · ${when(r.date)}${r.status === "draft" ? " · qoralama" : ""}`}
                      val={<span className="num">{signed(r, account)}{sum(r.amount)}</span>}
                      valSmall={cur(r.currency)}
                      chev
                      onClick={() => onOpen(r.id)}
                    />
                  ))}
                </List>
              )}
            </>
          )
        }
      </Loaded>
    </>
  );
}
