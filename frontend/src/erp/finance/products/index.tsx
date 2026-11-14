// Tovarlar: qidiruv (nom, remen belgisi "1040 8M", artikul), kategoriya va tur filtri, ro'yxat (telefon) / jadval
// (kompyuter); tovar → ko'rish oynasi (view.tsx), "Yangi tovar" → forma (form.tsx). Kategoriya yo'q — avval kategoriya.
import { useEffect, useState } from "react";

import { num } from "@/erp/kit/fmt";
import { Tbl } from "@/erp/kit/table";
import { Empty, Icon, List, Loaded, Row, useLoad } from "@/erp/kit/ui";
import { CNT, FILT, KIND_CLS } from "@/erp/finance/tw";
import { api } from "@/erp/finance/api";
import { useAcc } from "@/erp/finance/context";
import { groupOptions, KCOL, KIND, un, type Item, type ItemRow, type Kind } from "@/erp/finance/lib";

import { ItemForm } from "./form";
import { ItemView } from "./view";

type Open = { k: "view"; id: number } | { k: "form"; it: Partial<Item> } | null;

export function Products() {
  const { wide, groups, go } = useAcc();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [group, setGroup] = useState("");
  const [kind, setKind] = useState<"" | Kind>("");
  const [open, setOpen] = useState<Open>(null);
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const st = useLoad(() => {
    const p = new URLSearchParams({ q: dq });
    if (group) p.set("group_id", group);
    if (kind) p.set("kind", kind);
    return api<ItemRow[]>(`/app/api/erp/cat/items?${p}`);
  }, [dq, group, kind]);

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

  const filtered = !!(dq || group || kind);
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
        <select className="sel" value={kind} onChange={(e) => setKind(e.target.value as Kind | "")} aria-label="Turi">
          <option value="">Hamma turi</option>
          {(Object.keys(KIND) as Kind[]).map((k) => (
            <option key={k} value={k}>
              {KIND[k]}
            </option>
          ))}
        </select>
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
                          {r.belt_mark || r.sku ? (
                            <div className="t2">
                              {r.belt_mark ? <span className="code">{r.belt_mark}</span> : null}
                              {r.belt_mark && r.sku ? " · " : ""}
                              {r.sku}
                            </div>
                          ) : null}
                        </>
                      ),
                    },
                    { h: "Kategoriya", f: (r) => [r.parent_grp, r.grp].filter(Boolean).join(" › ") },
                    { h: "Turi", f: (r) => <span className={`badge ${KIND_CLS[r.kind] ?? ""}`}>{KIND[r.kind]}</span> },
                    { h: "Variant", f: (r) => (r.chars ? num(r.chars, 0) : ""), n: true },
                    {
                      h: "Narx, so'm",
                      f: (r) =>
                        r.price?.price != null ? (
                          <>
                            {num(r.price.price, 0)}
                            <div className="t2">{r.price.mode === "mm" ? `1 mm${r.price.step_mm ? ` · qadam ${r.price.step_mm}` : ""}` : "dona"}</div>
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
                      s={[KIND[r.kind], r.grp].filter(Boolean).join(" · ")}
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
