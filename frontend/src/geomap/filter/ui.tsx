import { FIELDS, FIELD_TYPE, num, OPS } from "@/geomap/lib/fields";
import type { Cond, FieldKey, Filter, Group, Op, Rule } from "@/geomap/lib/types";

import { Btn, Chips, Seg } from "@/geomap/kit";

export type EnumOptions = (f: FieldKey) => { v: string; label: string; n?: number; color?: string }[];

const defaultOp = (f: FieldKey): Op => OPS[FIELD_TYPE[f]][0].op;
const newCond = (f: FieldKey = "status"): Cond => ({ kind: "cond", field: f, op: defaultOp(f), value: FIELD_TYPE[f] === "enum" ? [] : undefined });

function CondEditor({ c, onChange, onRemove, enumOptions }: { c: Cond; onChange: (c: Cond) => void; onRemove: () => void; enumOptions: EnumOptions }) {
  const t = FIELD_TYPE[c.field];
  const needsValue = !["empty", "not_empty"].includes(c.op);
  return (
    <div className="gm-cond">
      <div className="gm-cond-row">
        <select className="gm-input" aria-label="Maydon" value={c.field} onChange={(e) => onChange(newCond(e.target.value as FieldKey))}>
          {FIELDS.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
        <select className="gm-input" aria-label="Shart turi" value={c.op} onChange={(e) => onChange({ ...c, op: e.target.value as Op, value: e.target.value === "between" ? [0, 0] : c.value })}>
          {OPS[t].map((o) => (
            <option key={o.op} value={o.op}>{o.label}</option>
          ))}
        </select>
        <button type="button" className="gm-x" onClick={onRemove} aria-label="Shartni o'chirish">×</button>
      </div>
      {needsValue && t === "enum" && (
        <Chips options={enumOptions(c.field)} value={(c.value as string[]) ?? []} onChange={(v) => onChange({ ...c, value: v })} />
      )}
      {needsValue && t === "text" && (
        <input className="gm-input" aria-label="Qiymat" value={String(c.value ?? "")} placeholder="Matn" onChange={(e) => onChange({ ...c, value: e.target.value })} />
      )}
      {needsValue && t === "number" && c.op !== "between" && (
        <input className="gm-input" type="number" inputMode="decimal" aria-label="Qiymat" value={c.value === undefined ? "" : String(c.value)}
          placeholder={c.field === "sales" || c.field === "debt" ? "so'm (masalan 10000000)" : "son"}
          onChange={(e) => onChange({ ...c, value: e.target.value === "" ? undefined : Number(e.target.value) })} />
      )}
      {needsValue && t === "number" && c.op === "between" && (
        <div className="gm-cond-row">
          {[0, 1].map((i) => (
            <input key={i} className="gm-input" type="number" inputMode="decimal" placeholder={i ? "gacha" : "dan"}
              value={String(((c.value as [number, number]) ?? [0, 0])[i] ?? "")}
              onChange={(e) => {
                const v = [...(((c.value as [number, number]) ?? [0, 0]))] as [number, number];
                v[i] = Number(e.target.value);
                onChange({ ...c, value: v });
              }} />
          ))}
        </div>
      )}
      {needsValue && t === "date" && (c.op === "last_days" || c.op === "older_days") && (
        <input className="gm-input" type="number" inputMode="numeric" placeholder="kun" value={c.value === undefined ? "" : String(c.value)}
          onChange={(e) => onChange({ ...c, value: e.target.value === "" ? undefined : Number(e.target.value) })} />
      )}
      {needsValue && t === "date" && (c.op === "after" || c.op === "before") && (
        <input className="gm-input" type="date" value={String(c.value ?? "")} onChange={(e) => onChange({ ...c, value: e.target.value })} />
      )}
    </div>
  );
}

function RulesEditor({ rules, onChange, enumOptions, depth }: { rules: Rule[]; onChange: (r: Rule[]) => void; enumOptions: EnumOptions; depth: number }) {
  const set = (i: number, r: Rule | null) => onChange(r ? rules.map((x, j) => (j === i ? r : x)) : rules.filter((_, j) => j !== i));
  return (
    <div className="gm-rules">
      {rules.map((r, i) =>
        r.kind === "cond" ? (
          <CondEditor key={i} c={r} enumOptions={enumOptions} onChange={(c) => set(i, c)} onRemove={() => set(i, null)} />
        ) : (
          <div key={i} className="gm-group">
            <div className="gm-cond-row">
              <Seg small value={r.match} onChange={(m) => set(i, { ...r, match: m })} options={[{ v: "all", label: "hammasi (VA)" }, { v: "any", label: "biri (YOKI)" }]} />
              <button type="button" className="gm-x" onClick={() => set(i, null)} aria-label="Guruhni o'chirish">×</button>
            </div>
            <RulesEditor rules={r.rules} depth={depth + 1} enumOptions={enumOptions} onChange={(rs) => set(i, { ...r, rules: rs } as Group)} />
          </div>
        ),
      )}
      <div className="gm-row">
        <Btn kind="ghost" onClick={() => onChange([...rules, newCond()])}>+ Shart</Btn>
        {depth === 0 && <Btn kind="ghost" onClick={() => onChange([...rules, { kind: "group", match: "any", rules: [newCond("region")] }])}>+ Guruh (YOKI)</Btn>}
      </div>
    </div>
  );
}

export const PRESETS: { label: string; mine?: boolean; filter: (bx: string | null) => Filter }[] = [
  { label: "Faol mijozlar", filter: () => ({ match: "all", search: "", rules: [{ kind: "cond", field: "status", op: "in", value: ["faol"] }] }) },
  { label: "Qarzdorlar", filter: () => ({ match: "all", search: "", rules: [{ kind: "cond", field: "debt", op: "gt", value: 0 }] }) },
  { label: "Muddati o'tgan qarz", filter: () => ({ match: "all", search: "", rules: [{ kind: "cond", field: "overdue", op: "gt", value: 0 }] }) },
  { label: "90+ kun xaridsiz", filter: () => ({ match: "all", search: "", rules: [{ kind: "cond", field: "status", op: "in", value: ["sust", "yo'qotilgan"] }] }) },
  { label: "Ochiq bitimli", filter: () => ({ match: "all", search: "", rules: [{ kind: "cond", field: "deals", op: "gt", value: 0 }] }) },
  { label: "Mening mijozlarim", mine: true, filter: (id) => ({ match: "all", search: "", rules: id ? [{ kind: "cond", field: "owner", op: "in", value: [id] }] : [] }) },
  { label: "Joyi taxminiy", filter: () => ({ match: "all", search: "", rules: [{ kind: "cond", field: "q", op: "in", value: ["region", "district"] }] }) },
];

export default function FilterPanel({ filter, onChange, enumOptions, ownerId, total, shown }: {
  filter: Filter; onChange: (f: Filter) => void; enumOptions: EnumOptions; ownerId: string | null; total: number; shown: number;
}) {
  return (
    <div className="gm-panel-body">
      <input className="gm-input gm-search" type="search" placeholder="Nomi, manzil yoki mas'ul bo'yicha qidirish" aria-label="Qidirish" value={filter.search}
        onChange={(e) => onChange({ ...filter, search: e.target.value })} />
      <div className="gm-presets">
        {PRESETS.map((p) => {
          // "Mening mijozlarim" — mas'ul (CRM xodimi) ma'lum bo'lmasa bo'sh filtr berardi (hech narsa o'zgarmasdi)
          const off = p.mine && !ownerId;
          return (
            <button key={p.label} type="button" className="gm-chip" disabled={off} title={off ? "Mas'ul xodim aniqlanmadi" : undefined}
              onClick={() => onChange({ ...p.filter(ownerId), search: filter.search })}>{p.label}</button>
          );
        })}
      </div>
      <div className="gm-row between">
        <span className="gm-muted">{num(shown)} / {num(total)} ta ko&apos;rsatilmoqda</span>
        {filter.rules.length > 1 && (
          <Seg small value={filter.match} onChange={(m) => onChange({ ...filter, match: m })} options={[{ v: "all", label: "VA" }, { v: "any", label: "YOKI" }]} />
        )}
      </div>
      <RulesEditor rules={filter.rules} depth={0} enumOptions={enumOptions} onChange={(rules) => onChange({ ...filter, rules })} />
      {(filter.rules.length > 0 || filter.search) && (
        <Btn kind="ghost" onClick={() => onChange({ match: "all", rules: [], search: "" })}>Filtrni tozalash</Btn>
      )}
    </div>
  );
}
