// Tovarlar: qidiruv (nom, standart belgi "1040 8M", artikul), kategoriya, texnik oila, brend va tur filtri, ro'yxat
// (telefon) / jadval (kompyuter); tovar → ko'rish oynasi (view.tsx), "Yangi tovar" → forma (form.tsx), "Takrorlar" —
// bir xil belgi+brend yoki artikul. Kategoriya yo'q — avval kategoriya.
import { useEffect, useState } from "react";

import { num } from "@/erp/kit/fmt";
import { Tbl } from "@/erp/kit/table";
import { Empty, Icon, List, Loaded, Row, Sf, Sheet, useLoad } from "@/erp/kit/ui";
import { CNT, FILT, KIND_CLS } from "@/erp/finance/tw";
import { api } from "@/erp/finance/api";
import { useAcc } from "@/erp/finance/context";
import { FAMILIES, famTitle, groupOptions, KCOL, KIND, PRICE_BY, priceUnit, un, type DupGroup, type Item, type ItemRow, type Kind } from "@/erp/finance/lib";

import { ItemForm } from "./form";
import { ItemView } from "./view";

/** Belgi (nom ichida bo'lmasa — takrorlanmasin) */
const markOf = (r: ItemRow): string | null => {
  const m = r.designation || r.belt_mark;
  return m && !r.name.toUpperCase().includes(m.toUpperCase()) ? m : null;
};

type Open = { k: "view"; id: number } | { k: "form"; it: Partial<Item> } | { k: "dups" } | null;

/** Ehtimoliy takrorlar: guruh — sababi va tovarlari (qoldiq bilan); tovar → ko'rish oynasi */
function Dups({ onClose, onOpen }: { onClose: () => void; onOpen: (id: number) => void }) {
  const st = useLoad(() => api<DupGroup[]>("/app/api/erp/cat/duplicates"), []);
  return (
    <Sheet title="Takrorlar" onClose={onClose}>
      <Loaded st={st}>
        {(gs) =>
          gs.length ? (
            <>
              <Sf>Bir xil standart belgi va brend yoki bir xil artikul. Birini qoldirib, ikkinchisini arxivga oling (qoldig&apos;ini ko&apos;chiring).</Sf>
              {gs.map((g, i) => (
                <List key={i} cls="mt-2">
                  <Row icon="alert" color="orange" t={g.why} />
                  {g.items.map((x) => (
                    <Row
                      key={x.id}
                      t={x.name}
                      s={[x.brand, x.sku, `#${x.id}`].filter(Boolean).join(" · ")}
                      val={x.qty ? <span className="num">{num(x.qty, 3)}</span> : "—"}
                      valSmall={x.qty ? un(x.unit) : ""}
                      chev
                      onClick={() => onOpen(x.id)}
                    />
                  ))}
                </List>
              ))}
            </>
          ) : (
            <Empty icon="check" title="Takror yo'q">
              Bir xil belgi + brend yoki artikulli tovar topilmadi.
            </Empty>
          )
        }
      </Loaded>
    </Sheet>
  );
}

export function Products() {
  const { wide, groups, go } = useAcc();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [group, setGroup] = useState("");
  const [kind, setKind] = useState<"" | Kind>("");
  const [fam, setFam] = useState("");
  const [brand, setBrand] = useState("");
  const brands = useLoad(() => api<string[]>("/app/api/erp/cat/brands").catch(() => [] as string[]), []);
  const [open, setOpen] = useState<Open>(null);
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const st = useLoad(() => {
    const p = new URLSearchParams({ q: dq });
    if (group) p.set("group_id", group);
    if (kind) p.set("kind", kind);
    if (fam) p.set("family", fam);
    if (brand) p.set("brand", brand);
    return api<ItemRow[]>(`/app/api/erp/cat/items?${p}`);
  }, [dq, group, kind, fam, brand]);

  if (!groups.length)
    return (
      <Empty icon="layers" title="Avval kategoriya yarating">
        Tovar kategoriyaga biriktiriladi (masalan: Rukavlar, Tishli remenlar, Klinli remenlar).
        <div className="btns">
          <button className="btn" onClick={() => go({ hub: false, area: "products", sec: "groups" })}>
            Kategoriyalar
          </button>
        </div>
      </Empty>
    );

  const filtered = !!(dq || group || kind || fam || brand);
  return (
    <>
      <div className={FILT}>
        <label className="search">
          <Icon n="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, belgi (1040 8M), artikul" aria-label="Qidiruv" enterKeyHint="search" />
        </label>
        <select className="sel" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Kategoriya">
          <option value="">Hamma kategoriya</option>
          {groupOptions(groups).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select className="sel" value={fam} onChange={(e) => setFam(e.target.value)} aria-label="Texnik oila">
          <option value="">Hamma oila</option>
          {FAMILIES.map((f) => (
            <option key={f.key} value={f.key}>
              {f.title}
            </option>
          ))}
        </select>
        <select className="sel" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brend">
          <option value="">Hamma brend</option>
          {(brands.data ?? []).map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select className="sel" value={kind} onChange={(e) => setKind(e.target.value as Kind | "")} aria-label="Turi">
          <option value="">Hamma turi</option>
          {(Object.keys(KIND) as Kind[]).map((k) => (
            <option key={k} value={k}>
              {KIND[k]}
            </option>
          ))}
        </select>
        <button type="button" className="b" onClick={() => setOpen({ k: "dups" })}>
          <Icon n="swap" /> Takrorlar
        </button>
        <button type="button" className="b pri" onClick={() => setOpen({ k: "form", it: {} })}>
          <Icon n="plus" /> Yangi tovar
        </button>
      </div>
      <Loaded st={st}>
        {(rs) =>
          !rs.length ? (
            <Empty icon="package" title={filtered ? "Topilmadi" : "Katalog bo'sh"}>
              {filtered ? "Qidiruv yoki filtrni o'zgartiring." : "«Yangi tovar» bilan qo'shing."}
            </Empty>
          ) : (
            <>
              <div className={CNT}>
                {rs.length}
                {rs.length >= 200 ? "+" : ""} tovar
              </div>
              {wide ? (
                <Tbl
                  label="Tovarlar"
                  rows={rs}
                  rowKey={(r) => String(r.id)}
                  onRow={(r) => setOpen({ k: "view", id: r.id })}
                  cols={[
                    {
                      h: "Tovar",
                      f: (r) => (
                        <>
                          {r.name}
                          {markOf(r) || r.sku || r.chars ? (
                            <div className="t2">
                              {[
                                markOf(r) ? <span key="m" className="code">{markOf(r)}</span> : null,
                                r.sku,
                                r.chars ? `${r.chars} variant` : null,
                              ]
                                .filter(Boolean)
                                .flatMap((x, i) => (i ? [" · ", x] : [x]))}
                            </div>
                          ) : null}
                        </>
                      ),
                    },
                    {
                      h: "Oila · kategoriya",
                      f: (r) => (
                        <>
                          {famTitle(r.family) || "—"}
                          <div className="t2">{[r.parent_grp, r.grp].filter(Boolean).join(" › ")}</div>
                        </>
                      ),
                    },
                    { h: "Brend", f: (r) => r.brand ?? <span className="text-hint">—</span> },
                    { h: "Turi", f: (r) => <span className={`badge ${KIND_CLS[r.kind] ?? ""}`}>{KIND[r.kind]}</span> },
                    {
                      h: "Narx, so'm",
                      f: (r) =>
                        r.price_from === "appsheet" && r.price_by && r.price_by !== "fixed" && r.price_now == null ? (
                          <span className="t2">{PRICE_BY[r.price_by]} · AppSheet</span>
                        ) : r.price_now != null ? (
                          <>
                            {num(r.price_now, 0)}
                            <div className="t2">
                              {r.price_from === "appsheet" ? "AppSheet" : priceUnit(r.price, r.unit)}
                              {r.price?.mode === "mm" && r.price.step_mm && r.price_from !== "appsheet" ? ` · qadam ${r.price.step_mm}` : ""}
                            </div>
                          </>
                        ) : Object.keys(r.price?.overrides ?? {}).length ? (
                          <span className="t2">kenglik bo&apos;yicha</span>
                        ) : (
                          <span className="text-hint">—</span>
                        ),
                      n: true,
                    },
                    {
                      h: "Qoldiq",
                      f: (r) =>
                        r.qty ? (
                          <>
                            {num(r.qty, 3)} <span className="text-xs text-hint">{un(r.unit)}</span>
                            <div className="t2">{r.units} birlik</div>
                          </>
                        ) : (
                          <span className="text-hint">—</span>
                        ),
                      n: true,
                    },
                  ]}
                />
              ) : (
                <List>
                  {rs.map((r) => (
                    <Row
                      key={r.id}
                      icon="package"
                      color={KCOL[r.kind]}
                      t={r.name}
                      tcls="wrap2"
                      s={[markOf(r), famTitle(r.family) || r.grp, r.brand].filter(Boolean).join(" · ")}
                      val={r.qty ? num(r.qty, 3) : ""}
                      valSmall={r.qty ? un(r.unit) : ""}
                      chev
                      onClick={() => setOpen({ k: "view", id: r.id })}
                    />
                  ))}
                </List>
              )}
            </>
          )
        }
      </Loaded>
      {open?.k === "view" ? (
        <ItemView
          key={open.id}
          id={open.id}
          onClose={() => setOpen(null)}
          onEdit={(it) => setOpen({ k: "form", it })}
          onOpen={(id) => setOpen({ k: "view", id })}
          onChanged={() => void st.reload()}
        />
      ) : null}
      {open?.k === "dups" ? <Dups onClose={() => setOpen(null)} onOpen={(id) => setOpen({ k: "view", id })} /> : null}
      {open?.k === "form" ? (
        <ItemForm
          it={open.it}
          onClose={() => setOpen(null)}
          onSaved={(it) => {
            void st.reload();
            setOpen({ k: "view", id: it.id });
          }}
        />
      ) : null}
    </>
  );
}
