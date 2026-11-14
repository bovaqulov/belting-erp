// Tovar formasi (yangi / tahrir): kategoriya → turi va o'lchovi odatiy qiymatdan; kategoriyada "remen belgisi" yoqilgan
// bo'lsa — profil, uzunlik, Li/Lp, qovurg'a, brend, seriya; nom bo'sh qolsa belgidan avtomatik (oldindan ko'rinadi).
import { useState, type ReactNode } from "react";

import { toast } from "@/erp/kit/env";
import { List, Sf, Sh, Sheet } from "@/erp/kit/ui";
import { TWO } from "@/erp/finance/tw";
import { post } from "@/erp/finance/api";
import { useAcc } from "@/erp/finance/context";
import { autoName, DIMS, groupAttrs, groupOptions, KIND, splitWidths, type Dims, type Item, type Kind } from "@/erp/finance/lib";

type F = { group_id: string; kind: Kind; dims: Dims | ""; profile: string; length: string; lstd: string; ribs: string; brand: string; series: string; name: string; sku: string; min_qty: string; widths: string };

const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="field col">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

export function ItemForm({ it, onClose, onSaved }: { it: Partial<Item>; onClose: () => void; onSaved: (it: Item) => void }) {
  const { groups } = useAcc();
  const a = it.attrs ?? {};
  const [f, setF] = useState<F>(() => ({
    group_id: s(it.group_id),
    kind: it.kind ?? "goods",
    dims: a.dims ?? "",
    profile: s(a.profile),
    length: s(a.length),
    lstd: s(a.lstd),
    ribs: s(a.ribs),
    brand: s(it.brand),
    series: s(a.series),
    name: it.id ? s(it.name) : "",
    sku: s(it.sku),
    min_qty: s(it.min_qty),
    widths: "",
  }));
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((x) => ({ ...x, [k]: v }));
  const inp = (k: keyof F, o: { num?: boolean; ph?: string } = {}) => (
    <input id={`acc-${k}`} value={f[k]} inputMode={o.num ? "decimal" : undefined} placeholder={o.ph} onChange={(e) => set(k, e.target.value as never)} />
  );

  const ga = groupAttrs(groups, f.group_id);
  const belt = !!(ga.belt || f.profile.trim() || it.belt_mark);
  const auto = autoName({ profile: f.profile, length: f.length, lstd: f.lstd, ribs: f.ribs, brand: f.brand, series: f.series, dims: f.dims });

  const pickGroup = (v: string) => {
    const g = groupAttrs(groups, v);
    setF((x) => ({ ...x, group_id: v, ...(!it.id ? { kind: g.kind ?? x.kind, dims: g.dims ?? "" } : {}) }));
  };

  return (
    <Sheet
      title={it.id ? "Tovarni tahrirlash" : "Yangi tovar"}
      done="Saqlash"
      onClose={onClose}
      onDone={async () => {
        const r = await post<Item>("/app/api/erp/cat/items", {
          id: it.id,
          group_id: f.group_id,
          kind: f.kind,
          dims: f.dims || null,
          profile: f.profile,
          length: f.length,
          lstd: f.lstd,
          ribs: f.ribs,
          brand: f.brand,
          series: f.series,
          name: f.name,
          sku: f.sku,
          min_qty: f.min_qty,
          widths: f.dims ? [] : splitWidths(f.widths),
          material_id: a.material_id,
        });
        toast(`Saqlandi: ${r.name}`);
        onSaved(r);
        return false;
      }}
    >
      <Sh t="Asosiy" />
      <List>
        <div className="field">
          <label htmlFor="acc-group">Kategoriya</label>
          <select id="acc-group" value={f.group_id} onChange={(e) => pickGroup(e.target.value)}>
            <option value="">— tanlang —</option>
            {groupOptions(groups).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="acc-kind">Turi</label>
          <select id="acc-kind" value={f.kind} onChange={(e) => set("kind", e.target.value as Kind)}>
            {(Object.keys(KIND) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="acc-dims">O&apos;lchov</label>
          <select id="acc-dims" value={f.dims} onChange={(e) => set("dims", e.target.value as Dims | "")}>
            {DIMS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </List>
      {belt ? (
        <>
          <Sh t="Remen belgisi" />
          <List cls={TWO}>
            <Field id="acc-profile" label="Profil">
              {inp("profile", { ph: "8M, RPP8, XL, SPB, PJ" })}
            </Field>
            <Field id="acc-length" label="Uzunlik, mm">
              {inp("length", { num: true, ph: "1040" })}
            </Field>
            <Field id="acc-lstd" label="Li / Lp / La (klinli)">
              {inp("lstd", { ph: "lp" })}
            </Field>
            <Field id="acc-ribs" label="Qovurg'a (poliklinli)">
              {inp("ribs", { num: true, ph: "8" })}
            </Field>
            <Field id="acc-brand" label="Brend">
              {inp("brand", { ph: "MEGADYNE" })}
            </Field>
            <Field id="acc-series" label="Seriya">
              {inp("series", { ph: "BASIC, SILVER3" })}
            </Field>
          </List>
        </>
      ) : null}
      <Sh t="Nom va boshqalar" />
      <List>
        <Field id="acc-name" label={belt ? "Nomi (bo'sh — belgidan avtomatik)" : "Nomi"}>
          {inp("name", { ph: auto || "masalan: Соединитель Flexco R5" })}
        </Field>
        {!f.dims ? (
          <Field id="acc-widths" label="Kengliklar, mm (variant)">
            {inp("widths", { num: true, ph: "10, 15, 20 — ixtiyoriy" })}
          </Field>
        ) : null}
      </List>
      <List cls={TWO} style={{ marginTop: 8 }}>
        <Field id="acc-sku" label="Artikul">
          {inp("sku")}
        </Field>
        <Field id="acc-min_qty" label="Minimal qoldiq">
          {inp("min_qty", { num: true })}
        </Field>
      </List>
      <Sf>
        {f.name ? (
          ""
        ) : auto ? (
          <>
            Nomi: <b>{auto}</b>
          </>
        ) : belt ? (
          "Nom yoki profil + uzunlik kiriting."
        ) : (
          "Nomini kiriting."
        )}
      </Sf>
    </Sheet>
  );
}
