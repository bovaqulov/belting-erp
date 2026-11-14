// Bitimlar ro'yxati (faqat ko'rinish): holat tugmalari, bosqich filtri, jadval (telefonda — kartochkalar), ustun tanlash
// oynasi, ommaviy amallar paneli va formasi.
import { useState, type ReactNode } from "react";

import { ago, d8, dtitle, iso, num } from "@/erp/kit/fmt";
import { Modal } from "@/erp/kit/modal";
import { Empty, ErrHint, Icon, Skeleton } from "@/erp/kit/ui";
import { AvaView, Tags, TaskBadge } from "@/erp/crm/badges";
import { days, SRC, type Deal, type DealKind, type Query, type Stage } from "@/erp/crm/lib";
import { idle as idleCls, PANE, PILL, RT, SP, SUM, TB_IN, TCK, TN, TR, TR_SEL, TTL, WHO } from "@/erp/crm/tw";

/** Ustun ko'rsatish uchun kerakli lug'atlar (konteyner kontekstdan beradi) */
export type Lookups = { stg: Record<string, Stage>; pipes: Record<string, string>; users: Record<number, string> };

type Col = [key: string, title: string, cls: string, render: (d: Deal, lk: Lookups, pipe: string) => ReactNode];
export const COLDEF: Col[] = [
  [
    "idle",
    "Tegilmagan",
    "",
    (d) => {
      const idle = days(d.touched || d.updated);
      return <span className={d.rotten ? idleCls(idle !== null && idle > 90) : ""}>{idle ?? ""} kun</span>;
    },
  ],
  [
    "title",
    "Bitim",
    TTL,
    (d) => (
      <>
        <b>{dtitle(d.title)}</b>
        <div className={SUM}>
          #{d.id} <Tags d={d} />
        </div>
      </>
    ),
  ],
  ["customer", "Mijoz", "", (d) => d.customer || "—"],
  [
    "stage",
    "Bosqich",
    "",
    (d, lk, pipe) => {
      const st = lk.stg[d.stage];
      return (
        <>
          <span className={PILL}>
            <i style={{ background: st?.color || "#888" }} />
            {st?.name || d.stage}
          </span>
          {!pipe && st ? <div className={SUM}>{lk.pipes[st.pipeline] || ""}</div> : null}
          {d.lost_reason ? <div className={`${SUM} !text-danger`}>{d.lost_reason}</div> : null}
        </>
      );
    },
  ],
  ["amount", "Summa", TN, (d) => (d.amount && Number(d.amount) ? num(d.amount, 0) : "")],
  ["prob", "Ehtimollik", TN, (d) => (d.prob != null ? num(d.prob, 0) + "%" : "")],
  [
    "owner",
    "Mas'ul",
    "",
    (d, lk) => {
      const n = (d.owner_tg != null && lk.users[d.owner_tg]) || "";
      return (
        <span className={WHO}>
          <AvaView name={n || "—"} /> {n}
        </span>
      );
    },
  ],
  ["source", "Manba", "", (d) => SRC[d.source || ""] || d.source || ""],
  ["task", "Keyingi vazifa", "", (d) => (d.closed ? "" : <TaskBadge d={d} />)],
  ["close", "Yopilish sanasi", "", (d) => (d.close_date ? <span className={d.close_date < iso() ? idleCls(true) : ""}>{d8(d.close_date)}</span> : "")],
  ["created", "Ochilgan", "", (d) => d8(d.created)],
  ["updated", "Yangilangan", "", (d) => ago(d.updated)],
];
export const SORTABLE = new Set(["idle", "title", "customer", "stage", "amount", "owner", "task", "created", "updated"]);
export const KINDS: [DealKind, string][] = [
  ["open", "Ochiq"],
  ["won", "Muvaffaqiyatli"],
  ["lost", "Muvaffaqiyatsiz"],
  ["all", "Hammasi"],
];

export function DealListView({
  f,
  pipe,
  lk,
  stages,
  rows,
  total,
  ready,
  err,
  net,
  cols,
  sel,
  allOn,
  more,
  isHead,
  onKind,
  onStage,
  onSort,
  onCols,
  onExport,
  onRetry,
  onSelAll,
  onToggle,
  onOpen,
  onMore,
  onBulk,
  onClearSel,
  children,
}: {
  f: Query;
  pipe: string;
  lk: Lookups;
  stages: Stage[];
  rows: Deal[];
  total: number;
  ready: boolean;
  err: string;
  net: boolean;
  cols: typeof COLDEF;
  sel: Set<number>;
  allOn: boolean;
  more: boolean;
  isHead: boolean;
  onKind: (k: DealKind) => void;
  onStage: (code: string) => void;
  onSort: (k: string) => void;
  onCols: () => void;
  onExport: () => void;
  onRetry: () => void;
  onSelAll: (on: boolean) => void;
  onToggle: (id: number, on: boolean) => void;
  onOpen: (id: number) => void;
  onMore: () => void;
  onBulk: (action: string) => void;
  onClearSel: () => void;
  /** oynalar (ustunlar, ommaviy amal formasi) */
  children?: ReactNode;
}) {
  return (
    <div className={PANE}>
      <div className={TB_IN}>
        <div className="grp" role="group" aria-label="Holat">
          {KINDS.map(([k, t]) => (
            <button key={k} type="button" className={`b ${f.kind === k ? "on" : ""}`} aria-pressed={f.kind === k} onClick={() => onKind(k)}>
              {t}
            </button>
          ))}
        </div>
        <select className="sel" aria-label="Bosqich" value={f.stage} onChange={(e) => onStage(e.target.value)}>
          <option value="">Barcha bosqichlar</option>
          {stages.map((s) => (
            <option key={s.code} value={s.code}>
              {(pipe ? "" : lk.pipes[s.pipeline] + " · ") + s.name}
            </option>
          ))}
        </select>
        <span className={SP} />
        <button type="button" className="b" onClick={onCols}>
          <Icon n="layers" /> Ustunlar
        </button>
        <button type="button" className="b" onClick={onExport}>
          <Icon n="download" /> Excel
        </button>
      </div>

      {!ready && !err ? (
        <Skeleton />
      ) : err ? (
        <Empty icon="alert" title="Yuklab bo'lmadi">
          {err}
          <ErrHint net={net} />
          <div className="btns">
            <button className="btn sec" onClick={onRetry}>
              Qayta urinish
            </button>
          </div>
        </Empty>
      ) : (
        <>
          <table className={RT}>
            <thead>
              <tr>
                <th style={{ width: 34 }}>
                  <input
                    type="checkbox"
                    className="ck"
                    aria-label="Hammasini belgilash"
                    checked={allOn}
                    onChange={(e) => onSelAll(e.target.checked)}
                  />
                </th>
                {cols.map(([k, t, c]) => (
                  <th
                    key={k}
                    className={`${c} ${f.sort === k ? "!text-link" : ""} ${SORTABLE.has(k) ? "cursor-pointer" : ""}`}
                    aria-sort={f.sort === k ? "descending" : undefined}
                    onClick={SORTABLE.has(k) ? () => onSort(k) : undefined}
                  >
                    {SORTABLE.has(k) ? (
                      <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-inherit [font:inherit]">
                        {t}
                        {f.sort === k ? " ↓" : ""}
                      </button>
                    ) : (
                      t
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className={`${TR} ${sel.has(d.id) ? TR_SEL : ""}`} onClick={(e) => !(e.target as HTMLElement).closest(".ck") && onOpen(d.id)}>
                  <td className={TCK}>
                    <input type="checkbox" className="ck" aria-label={`#${d.id} belgilash`} checked={sel.has(d.id)} onChange={(e) => onToggle(d.id, e.target.checked)} />
                  </td>
                  {cols.map(([k, t, c, fn]) => (
                    <td key={k} className={c} data-l={k === "title" ? undefined : t}>
                      {fn(d, lk, pipe)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? (
            <Empty icon="handshake" title="Bitim topilmadi">
              Filtrni o&apos;zgartiring yoki yangi bitim oching.
            </Empty>
          ) : null}
          {rows.length < total ? (
            <div className="p-3.5 text-center">
              <button type="button" className="b" disabled={more} onClick={onMore}>
                Yana yuklash ({rows.length} / {total})
              </button>
            </div>
          ) : null}
        </>
      )}

      {sel.size ? (
        <div className="fixed bottom-[calc(18px+var(--safe-b))] left-1/2 z-45 flex w-[min(1100px,calc(100vw-32px))] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl bg-sec px-3.5 py-2.5 shadow-2 max-md:right-2 max-md:bottom-[calc(8px+var(--safe-b))] max-md:left-2 max-md:w-auto max-md:translate-x-0 max-md:gap-1.5 max-md:p-2 max-md:[&>.b]:flex-[1_0_auto] max-md:[&>b]:w-full" role="toolbar" aria-label="Ommaviy amallar">
          <b>{sel.size} ta tanlandi</b>
          <span className={`${SP} max-md:hidden`} />
          <button type="button" className="b" onClick={() => onBulk("stage")}>
            <Icon n="layers" /> Bosqich
          </button>
          {isHead ? (
            <button type="button" className="b" onClick={() => onBulk("owner")}>
              <Icon n="user" /> Mas&apos;ul
            </button>
          ) : null}
          <button type="button" className="b" onClick={() => onBulk("task")}>
            <Icon n="clock" /> Vazifa
          </button>
          <button type="button" className="b" onClick={() => onBulk("tag_add")}>
            <Icon n="plus" /> Teg
          </button>
          <button type="button" className="b" onClick={() => onBulk("tag_del")}>
            <Icon n="x" /> Tegni olish
          </button>
          <button type="button" className="b" onClick={() => onBulk("close_date")}>
            <Icon n="calendar" /> Yopilish sanasi
          </button>
          <button type="button" className="b" onClick={onClearSel}>
            Bekor
          </button>
        </div>
      ) : null}

      {children}
    </div>
  );
}

export function ColsModal({ hide, onClose, onApply }: { hide: Set<string>; onClose: () => void; onApply: (h: Set<string>) => void }) {
  const [h, setH] = useState(() => new Set(hide));
  return (
    <Modal title="Ustunlar" ok="Qo'llash" onClose={onClose} onOk={() => onApply(h)}>
      {COLDEF.map(([k, t]) => (
        <label key={k} className="opt">
          <input
            type="checkbox"
            className="ck"
            checked={!h.has(k)}
            onChange={(e) =>
              setH((s) => {
                const n = new Set(s);
                if (e.target.checked) n.delete(k);
                else n.add(k);
                return n;
              })
            }
          />
          {t}
        </label>
      ))}
    </Modal>
  );
}

export type BulkAction = "task" | "close_date" | "tag_add" | "tag_del";

export function BulkFormView({
  action,
  n,
  tags,
  v,
  due,
  onV,
  onDue,
  onClose,
  onOk,
}: {
  action: BulkAction;
  n: number;
  tags: string[];
  v: string;
  due: string;
  onV: (v: string) => void;
  onDue: (v: string) => void;
  onClose: () => void;
  onOk: () => Promise<boolean | void>;
}) {
  return (
    <Modal title={`${n} ta bitim`} ok="Bajarish" onClose={onClose} onOk={onOk}>
      {action === "task" ? (
        <>
          <label className="l">Vazifa</label>
          <textarea className="inp" value={v} placeholder="Masalan: mijoz bilan bog'lanib holatini aniqlash" onChange={(e) => onV(e.target.value)} />
          <label className="l">Muddat</label>
          <input type="datetime-local" className="inp" value={due} onChange={(e) => onDue(e.target.value)} />
        </>
      ) : action === "close_date" ? (
        <>
          <label className="l">Kutilgan yopilish sanasi</label>
          <input type="date" className="inp" value={v} onChange={(e) => onV(e.target.value)} />
        </>
      ) : (
        <>
          <label className="l">Teg</label>
          <input className="inp" list="crm-taglist" value={v} placeholder="masalan: zavod, ulgurji, takroriy" onChange={(e) => onV(e.target.value)} />
          <datalist id="crm-taglist">
            {tags.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </>
      )}
    </Modal>
  );
}
