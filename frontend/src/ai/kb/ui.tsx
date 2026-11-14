// Bilimlar (faqat ko'rinish): daraxt/graf tugmalari, "Chatlardan yangilash" / "Hujjat", tasdiq kutayotganlar,
// bo'lim → mavzu → hujjat daraxti; hujjat oynasi; yangi hujjat formasi.
import type { MouseEvent, ReactNode } from "react";

import s from "@/shared/ui/panel/styles";
import { Icon, SectionHeader, Sq, tapProps } from "@/shared/ui/panel/ui";
import type { Dept } from "@/ai/shell/AdminContext";

import { buildKbTree, countKb, sortedEntries, splitKb, type KbDoc, type KbNode } from "./kb.lib";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export interface KbFull extends KbDoc {
  body: string;
}

export const deptName = (depts: Dept[], k: string) =>
  k === "umumiy" ? "Umumiy (butun firma)" : depts.find((d) => d.key === k)?.name || k;
const deptColor = (depts: Dept[], k: string) => depts.find((d) => d.key === k)?.color || "#5288c1";

/** xato yoki yuklanmoqda */
export const KbStatus = ({ err }: { err?: string }) => (err ? <div className={s.err}>{err}</div> : <div className={s.empty}>Yuklanmoqda…</div>);

export function KbSegView({ graph, onView }: { graph: boolean; onView: (v: "tree" | "graph") => void }) {
  return (
    <div className={s.toolbar}>
      <div className={s.seg} style={{ flex: 1 }}>
        <button className={!graph ? s.on : ""} onClick={() => onView("tree")}>
          <Icon name="folder" /> Daraxt
        </button>
        <button className={graph ? s.on : ""} onClick={() => onView("graph")}>
          <Icon name="network" /> Graf
        </button>
      </div>
    </div>
  );
}

export function DocSheet({ d, dn }: { d: KbFull; dn: string }) {
  return (
    <>
      <div className={s.who}>
        <h2>{d.title}</h2>
        <div className={s.s}>
          {dn}
          {d.path ? " · " + d.path : ""}
        </div>
      </div>
      <div className={cx(s.list, s.plain)}>
        <div className={s.field} style={{ whiteSpace: "pre-wrap", display: "block", lineHeight: 1.5 }}>
          {d.body}
        </div>
      </div>
    </>
  );
}

export type AddForm = { dept: string; path: string; title: string; body: string };

export function AddSheetView({
  depts,
  v,
  pdf,
  busy,
  set,
  onPdf,
  onSave,
}: {
  depts: Dept[];
  v: AddForm;
  pdf: File | null;
  busy: boolean;
  set: (k: keyof AddForm, val: string) => void;
  onPdf: (f: File | null) => void;
  onSave: () => void;
}) {
  return (
    <>
      <div className={s.who}>
        <Sq icon="book-open" color="#5288c1" style={{ width: 64, height: 64, borderRadius: 18, background: "#5288c1" }} />
        <h2>Yangi hujjat</h2>
      </div>
      <SectionHeader>Hujjat</SectionHeader>
      <div className={cx(s.list, s.plain)}>
        <div className={s.field}>
          <label>Bo&apos;lim</label>
          <select id="kdept" value={v.dept} onChange={(e) => set("dept", e.target.value)}>
            <option value="umumiy">Umumiy (hamma)</option>
            {depts.map((d) => (
              <option key={d.key} value={d.key}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label>Bo&apos;lim/mavzu</label>
          <input id="kpath" placeholder="Mahsulotlar › Tishli remenlar" value={v.path} onChange={(e) => set("path", e.target.value)} />
        </div>
        <div className={s.field}>
          <label>Sarlavha</label>
          <input
            id="ktitle"
            placeholder={pdf ? "Bo'sh qolsa — fayl nomi" : "B2B narx-navo 2026"}
            value={v.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>
        <div className={s.field}>
          <label>PDF fayl</label>
          <input
            id="kpdf"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => onPdf(e.currentTarget.files?.[0] ?? null)}
          />
        </div>
        {pdf ? null : (
          <div className={s.field} style={{ alignItems: "flex-start" }}>
            <textarea
              id="kbody"
              placeholder="Narxlar, qoidalar, mahsulot tavsiflari… (yoki yuqorida PDF tanlang)"
              value={v.body}
              onChange={(e) => set("body", e.target.value)}
            />
          </div>
        )}
      </div>
      <div className={s.actions}>
        <button className={s.btn} id="ksave" onClick={onSave} disabled={busy}>
          {busy ? "O'qilmoqda…" : pdf ? "PDF'ni qo'shish" : "Qo'shish"}
        </button>
      </div>
    </>
  );
}

export function KbView({
  seg,
  docs,
  depts,
  busy,
  extracting,
  onOpen,
  onDecide,
  onDel,
  onExtract,
  onAdd,
}: {
  /** daraxt/graf tugmalari */
  seg: ReactNode;
  docs: KbDoc[];
  depts: Dept[];
  busy: boolean;
  extracting: boolean;
  onOpen: (id: KbDoc["id"]) => void;
  onDecide: (id: KbDoc["id"], act: "approve" | "reject") => void;
  onDel: (ev: MouseEvent, id: KbDoc["id"]) => void;
  onExtract: () => void;
  onAdd: () => void;
}) {
  const dn = (k: string) => deptName(depts, k);
  const { pending, active, fromChat } = splitKb(docs);
  const root = buildKbTree(active);

  const docRow = (d: KbDoc) => (
    <div className={s.kdoc} key={String(d.id)}>
      <Icon name={d.source === "chat" ? "message-circle" : "file-text"} />
      <span className={s.kt} {...tapProps(() => onOpen(d.id))}>
        {d.title}
      </span>
      <button
        className={cx(s.lnk, s.danger, s.kdel)}
        title="O'chirish"
        aria-label={`O'chirish: ${d.title}`}
        disabled={busy}
        onClick={(ev) => onDel(ev, d.id)}
      >
        <Icon name="trash-2" />
      </button>
    </div>
  );

  const kids = (n: KbNode, depth: number) => (
    <div className={s.kkids}>
      {sortedEntries(n.kids).map(([k, v]) => branch(k, v, depth))}
      {n.docs.map(docRow)}
    </div>
  );

  const branch = (name: string, n: KbNode, depth: number) => (
    <details className={s.knode} open={depth < 1} key={name}>
      <summary>
        <Icon name="folder" />
        <span>{name}</span>
        <em>{countKb(n)}</em>
      </summary>
      {kids(n, depth + 1)}
    </details>
  );

  return (
    <>
      {seg}
      <div className={s.actions}>
        <button className={cx(s.btn, s.sec)} id="kext" disabled={extracting} onClick={onExtract}>
          <Icon name="refresh-cw" /> Chatlardan yangilash
        </button>
        <button className={s.btn} id="kadd" onClick={onAdd}>
          <Icon name="plus" /> Hujjat
        </button>
      </div>
      <div className={s.sf}>
        Jami {active.length} ta bilim · chatlardan {fromChat} ta
      </div>
      {pending.length > 0 && (
        <>
          <SectionHeader>Tasdiq kutmoqda (butun firma uchun) · {pending.length}</SectionHeader>
          <div className={s.list}>
            {pending.map((d) => (
              <div className={s.item} key={String(d.id)}>
                <Sq icon="message-circle" color="#f5a623" />
                <div className={cx(s.main, s.kopen)} style={{ cursor: "pointer" }} {...tapProps(() => onOpen(d.id))}>
                  <div className={s.t}>{d.title}</div>
                  <div className={s.s}>{d.path || "—"}</div>
                </div>
                <button className={cx(s.lnk, s.kok)} title="Tasdiqlash" aria-label="Tasdiqlash" disabled={busy} onClick={() => onDecide(d.id, "approve")}>
                  <Icon name="check" />
                </button>
                <button className={cx(s.lnk, s.danger, s.kno)} title="Rad etish" aria-label="Rad etish" disabled={busy} onClick={() => onDecide(d.id, "reject")}>
                  <Icon name="x" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {active.length ? (
        <>
          <SectionHeader>Bilimlar daraxti</SectionHeader>
          <div className={cx(s.list, s.ktree)}>
            {sortedEntries(root).map(([dept, n]) => (
              <details className={cx(s.knode, s.kdept)} open key={dept}>
                <summary>
                  <span className={s.dot} style={{ background: deptColor(depts, dept) }} />
                  <span>{dn(dept)}</span>
                  <em>{countKb(n)}</em>
                </summary>
                {kids(n, 1)}
              </details>
            ))}
          </div>
        </>
      ) : (
        <div className={s.empty}>Bilimlar hali yo&apos;q</div>
      )}
    </>
  );
}
