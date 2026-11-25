// Tovar formasi (yangi / tahrir): kategoriya → texnik oila (odatiy qiymat), oila maydonlari (xalqaro standart bo'yicha,
// specs.json), jonli ko'rinish (backend `cat/preview`: standart belgi, nom, tish soni va h.k., TIF TN taklifi, takror va
// analoglar), nom va brend, kodlar (artikul, shtrixkod, MXIK, TIF TN), minimal qoldiq, kengliklar.
import { useEffect, useState, type ReactNode } from "react";

import { toast } from "@/erp/kit/env";
import { LINK_BTN } from "@/erp/kit/layout";
import { List, Row, Sf, Sh, Sheet } from "@/erp/kit/ui";
import { TWO } from "@/erp/finance/tw";
import { api, post } from "@/erp/finance/api";
import { useAcc } from "@/erp/finance/context";
import {
  DIMS,
  FAMILIES,
  famOf,
  groupAttrs,
  groupOptions,
  KIND,
  specOut,
  splitWidths,
  TIMING_PROFILES,
  type Dims,
  type FamilyDef,
  type Item,
  type Kind,
  type Preview,
  type SpecField,
  type SpecVal,
} from "@/erp/finance/lib";

type F = {
  group_id: string;
  family: string;
  kind: Kind;
  dims: Dims | "";
  brand: string;
  series: string;
  name: string;
  name_ru: string;
  sku: string;
  barcode: string;
  ikpu: string;
  hs_code: string;
  min_qty: string;
  widths: string;
};

const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const ERR = "text-[13px] text-danger";

function Field({ id, label, children, err }: { id: string; label: ReactNode; children: ReactNode; err?: string }) {
  return (
    <div className="field col">
      <label htmlFor={id}>{label}</label>
      {children}
      {err ? <span className={ERR}>{err}</span> : null}
    </div>
  );
}

/** Bitta texnik maydon: tanlov, kod (tishli profil — tavsiya ro'yxati), son, matn, belgi (ha/yo'q) */
function SpecInput({ f, v, set, err }: { f: SpecField; v: SpecVal | undefined; set: (v: SpecVal) => void; err?: string }) {
  const id = `acc-sp-${f.key}`;
  const label = (
    <>
      {f.label}
      {f.unit ? <span className="text-hint">, {f.unit}</span> : null}
      {f.req ? <span className="text-danger"> *</span> : null}
    </>
  );
  if (f.type === "bool")
    return (
      <div className="field">
        <label htmlFor={id}>{f.label}</label>
        <input id={id} type="checkbox" className="switch" checked={v === true} onChange={(e) => set(e.target.checked)} />
      </div>
    );
  if (f.type === "choice")
    return (
      <Field id={id} label={label} err={err}>
        <select id={id} value={s(v)} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          {(f.options ?? []).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
    );
  const list = f.key === "profile" ? "acc-timing-profiles" : undefined;
  return (
    <Field id={id} label={label} err={err}>
      <input
        id={id}
        value={s(v)}
        list={list}
        inputMode={f.type === "num" ? "decimal" : f.type === "int" ? "numeric" : undefined}
        placeholder={f.ph}
        title={f.hint}
        onChange={(e) => set(e.target.value)}
      />
    </Field>
  );
}

/** Jonli ko'rinish: belgi, nom, hisoblar, takror (qizil) va analoglar */
function PreviewCard({ pv, fam, onHs, hsSet }: { pv: Preview | null; fam: FamilyDef | undefined; onHs: (v: string) => void; hsSet: boolean }) {
  if (!fam?.fields.length) return null;
  if (!pv?.designation)
    return <Sf>{fam.std !== "—" ? `${fam.std} · ` : ""}Majburiy (*) maydonlarni to&apos;ldiring — belgi va nom avtomatik chiqadi.</Sf>;
  return (
    <>
      <Sh t="Natija" />
      <List>
        <Row t="Belgi" val={<span className="code lg">{pv.designation}</span>} />
        {pv.name ? <Row t="Nomi" s={pv.name_ru ?? undefined} val={pv.name} /> : null}
        {(pv.computed ?? []).map((c) => (
          <Row key={c.label} t={c.label} val={<span className="num">{c.value}</span>} />
        ))}
        {pv.hs_hint ? (
          <Row
            t="TIF TN (taklif)"
            val={<span className="code">{pv.hs_hint}</span>}
            right={
              hsSet ? null : (
                <button type="button" className={`${LINK_BTN} ml-2`} onClick={() => onHs(pv.hs_hint ?? "")}>
                  Qo&apos;yish
                </button>
              )
            }
          />
        ) : null}
      </List>
      {pv.dup ? (
        <Sf>
          <span className="text-danger">
            Takror: «{pv.dup.name}» (#{pv.dup.id}) — bir xil belgi va brend. Saqlab bo&apos;lmaydi.
          </span>
        </Sf>
      ) : null}
      {pv.analogs?.length ? (
        <Sf>
          Analoglar ({pv.analogs.length}): {pv.analogs.map((a) => a.name).join(", ")}
        </Sf>
      ) : null}
    </>
  );
}

export function ItemForm({ it, onClose, onSaved }: { it: Partial<Item>; onClose: () => void; onSaved: (it: Item) => void }) {
  const { groups } = useAcc();
  const a = it.attrs ?? {};
  const [f, setF] = useState<F>(() => {
    const ga = groupAttrs(groups, it.group_id);
    const family = it.family ?? ga.family ?? "other";
    return {
      group_id: s(it.group_id),
      family,
      kind: it.kind ?? ga.kind ?? famOf(family)?.kind ?? "goods",
      dims: a.dims ?? "",
      brand: s(it.brand),
      series: s(a.series),
      name: it.id ? s(it.name) : "",
      name_ru: it.id && it.name_ru !== it.name ? s(it.name_ru) : "",
      sku: s(it.sku),
      barcode: s(it.barcode),
      ikpu: s(it.ikpu),
      hs_code: s(it.hs_code),
      min_qty: s(it.min_qty),
      widths: "",
    };
  });
  const [spec, setSpec] = useState<Record<string, SpecVal>>(() => ({ ...(it.spec ?? {}) }));
  const [pv, setPv] = useState<Preview | null>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((x) => ({ ...x, [k]: v }));
  const inp = (k: keyof F, o: { num?: boolean; ph?: string } = {}) => (
    <input id={`acc-${k}`} value={f[k]} inputMode={o.num ? "decimal" : undefined} placeholder={o.ph} onChange={(e) => set(k, e.target.value as never)} />
  );
  const fam = famOf(f.family);
  const sp = specOut(fam, spec);
  const spKey = JSON.stringify(sp);

  useEffect(() => {
    api<string[]>("/app/api/erp/cat/brands").then(setBrands, () => undefined);
  }, []);
  // jonli ko'rinish — yozish to'xtagach (300 ms)
  useEffect(() => {
    if (!fam?.fields.length) return;
    let alive = true;
    const t = setTimeout(() => {
      post<Preview>("/app/api/erp/cat/preview", { id: it.id, family: f.family, spec: JSON.parse(spKey), brand: f.brand, series: f.series }).then(
        (r) => alive && setPv(r),
        () => undefined,
      );
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [fam, f.family, spKey, f.brand, f.series, it.id]);

  const pickGroup = (v: string) => {
    const g = groupAttrs(groups, v);
    setF((x) => {
      const family = !it.id && g.family ? g.family : x.family;
      const fd = famOf(family);
      return { ...x, group_id: v, ...(!it.id ? { family, kind: g.kind ?? fd?.kind ?? x.kind, dims: g.dims ?? fd?.dims ?? "" } : {}) };
    });
  };
  const pickFamily = (v: string) => {
    const fd = famOf(v);
    setPv(null);
    setF((x) => ({ ...x, family: v, ...(!it.id && fd ? { kind: fd.kind, dims: fd.dims ?? "" } : {}) }));
  };
  const errs = pv?.errors ?? {};

  return (
    <Sheet
      title={it.id ? "Tovarni tahrirlash" : "Yangi tovar"}
      done="Saqlash"
      onClose={onClose}
      onDone={async () => {
        const r = await post<Item>("/app/api/erp/cat/items", {
          id: it.id,
          group_id: f.group_id,
          family: f.family,
          spec: sp,
          kind: f.kind,
          dims: f.dims || null,
          brand: f.brand,
          series: f.series,
          name: f.name,
          name_ru: f.name_ru,
          sku: f.sku,
          barcode: f.barcode,
          ikpu: f.ikpu,
          hs_code: f.hs_code,
          min_qty: f.min_qty,
          widths: f.dims ? [] : splitWidths(f.widths),
          material_id: a.material_id,
        });
        toast(`Saqlandi: ${r.name}`);
        onSaved(r);
        return false;
      }}
    >
      <datalist id="acc-timing-profiles">
        {TIMING_PROFILES.map(([p, sys]) => (
          <option key={p} value={p}>
            {sys}
          </option>
        ))}
      </datalist>
      <datalist id="acc-brands">
        {brands.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
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
          <label htmlFor="acc-family">Texnik oila</label>
          <select id="acc-family" value={f.family} onChange={(e) => pickFamily(e.target.value)}>
            {FAMILIES.map((x) => (
              <option key={x.key} value={x.key}>
                {x.title}
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
      {fam?.fields.length ? (
        <>
          <Sh t="Texnik ko'rsatkichlar" r={fam.std !== "—" ? <span className="text-xs">{fam.std}</span> : null} />
          <List cls={TWO}>
            {fam.fields.map((x) => (
              <SpecInput key={x.key} f={x} v={spec[x.key]} err={errs[x.key]} set={(v) => setSpec((o) => ({ ...o, [x.key]: v }))} />
            ))}
          </List>
          {fam.fields.some((x) => x.hint) ? (
            <Sf>
              {fam.fields
                .filter((x) => x.hint)
                .map((x) => `${x.label}: ${x.hint}`)
                .join(" · ")}
            </Sf>
          ) : null}
        </>
      ) : null}
      <PreviewCard pv={pv} fam={fam} onHs={(v) => set("hs_code", v)} hsSet={!!f.hs_code} />
      <Sh t="Nom va brend" />
      <List cls={TWO}>
        <Field id="acc-brand" label="Brend">
          <input id="acc-brand" list="acc-brands" value={f.brand} placeholder="MEGADYNE, PIX, NOVOBELT" onChange={(e) => set("brand", e.target.value)} />
        </Field>
        <Field id="acc-series" label="Seriya">
          {inp("series", { ph: "BASIC, SILVER3" })}
        </Field>
      </List>
      <List style={{ marginTop: 8 }}>
        <Field id="acc-name" label={fam?.fields.length ? "Nomi (bo'sh — avtomatik)" : "Nomi"}>
          {inp("name", { ph: pv?.name ?? "masalan: Клей K2000 500 гр" })}
        </Field>
        <Field id="acc-name_ru" label="To'liq nom (hujjatlar, ruscha)">
          {inp("name_ru", { ph: pv?.name_ru ?? "bo'sh — qisqa nom" })}
        </Field>
        {!f.dims ? (
          <Field id="acc-widths" label="Kengliklar, mm (variant)">
            {inp("widths", { num: true, ph: "10, 15, 20 — ixtiyoriy" })}
          </Field>
        ) : null}
      </List>
      <Sh t="Kodlar" />
      <List cls={TWO}>
        <Field id="acc-sku" label="Artikul">
          {inp("sku")}
        </Field>
        <Field id="acc-barcode" label="Shtrixkod">
          {inp("barcode", { num: true })}
        </Field>
        <Field id="acc-ikpu" label="MXIK (IKPU)">
          {inp("ikpu", { num: true, ph: "17 xonali" })}
        </Field>
        <Field id="acc-hs_code" label="TIF TN (HS)">
          {inp("hs_code", { num: true, ph: pv?.hs_hint ?? "4010.35" })}
        </Field>
        <Field id="acc-min_qty" label="Minimal qoldiq">
          {inp("min_qty", { num: true })}
        </Field>
      </List>
      {!fam?.fields.length && !f.name ? <Sf>Nomini kiriting.</Sf> : null}
    </Sheet>
  );
}
