// Shablon tahrirlash oynasi (faqat ko'rinish): bo'lim, sarlavha, eslatma/jadval vaqti, maydonlar (kalit, nomi, turi).
import s from "@/shared/ui/panel/styles";
import { Icon, SectionHeader, Sq } from "@/shared/ui/panel/ui";
import { deptOf, TYPE_NAMES, type TemplatesData } from "@/ai/templates/templates.lib";

export interface Row {
  id: number;
  key: string;
  label: string;
  type: string;
}

export type EditorForm = { dept: string; title: string; askAt: string; sumAt: string };

export function TplEditorView({
  d,
  editable,
  blank,
  v,
  rows,
  busy,
  set,
  onRow,
  onRemove,
  onAddRow,
  onSave,
}: {
  d: TemplatesData;
  editable: string[];
  blank: boolean;
  v: EditorForm;
  rows: Row[];
  busy: boolean;
  set: (k: keyof EditorForm, val: string) => void;
  onRow: (id: number, patch: Partial<Row>) => void;
  onRemove: (id: number) => void;
  onAddRow: () => void;
  onSave: () => void;
}) {
  return (
    <>
      <div className={s.who}>
        <Sq icon="file-text" color="#5288c1" style={{ width: 64, height: 64, borderRadius: 18, background: "#5288c1" }} />
        <h2>{blank ? "Yangi shablon" : "Shablonni tahrirlash"}</h2>
      </div>
      <SectionHeader>Asosiy</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        <div className={s.field}>
          <label>Bo&apos;lim</label>
          <select value={v.dept} onChange={(e) => set("dept", e.target.value)}>
            {editable.map((k) => (
              <option key={k} value={k}>
                {deptOf(d.depts, k).name}
              </option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label>Sarlavha</label>
          <input value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="SOTUVCHI" />
        </div>
        <div className={s.field}>
          <label>Eslatma</label>
          <input type="time" value={v.askAt} onChange={(e) => set("askAt", e.target.value)} />
        </div>
        <div className={s.field}>
          <label>Jadval</label>
          <input type="time" value={v.sumAt} onChange={(e) => set("sumAt", e.target.value)} />
        </div>
      </div>
      <SectionHeader>Maydonlar</SectionHeader>
      <div style={{ margin: 0 }}>
        {rows.map((f) => (
          <div key={f.id} className={s.list} style={{ marginBottom: 8 }}>
            <div className={s.field}>
              <label>Kalit</label>
              <input placeholder="calls" value={f.key} onChange={(e) => onRow(f.id, { key: e.target.value })} />
            </div>
            <div className={s.field}>
              <label>Nomi</label>
              <input
                placeholder="Qo'ng'iroqlar soni"
                value={f.label}
                onChange={(e) => onRow(f.id, { label: e.target.value })}
              />
            </div>
            <div className={s.field}>
              <label>Turi</label>
              <select value={f.type} onChange={(e) => onRow(f.id, { type: e.target.value })}>
                {Object.entries(TYPE_NAMES).map(([t, n]) => (
                  <option key={t} value={t}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                className={`${s.lnk} ${s.danger}`}
                title="O'chirish"
                aria-label="Maydonni o'chirish"
                onClick={() => onRemove(f.id)}
              >
                <Icon name="trash-2" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className={s.actions} style={{ marginTop: 4 }}>
        <button
          className={`${s.btn} ${s.sec}`}
          onClick={onAddRow}
        >
          <Icon name="plus" /> Maydon qo&apos;shish
        </button>
      </div>
      <div className={s.actions}>
        <button className={s.btn} disabled={busy} onClick={onSave}>
          {busy ? "Yuborilmoqda…" : d.is_approver ? "Saqlash — darhol kuchga kiradi" : "Tasdiqqa yuborish"}
        </button>
      </div>
    </>
  );
}
