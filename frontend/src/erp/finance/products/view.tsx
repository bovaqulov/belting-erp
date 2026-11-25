// Tovar oynasi: standart belgi (.code), tur va kategoriya, o'lchov, brend; texnik ko'rsatkichlar (oila standarti, hisoblar),
// kodlar (artikul, shtrixkod, 1C, MXIK, TIF TN), analoglar (bir xil belgi — boshqa brend, qoldig'i bilan); narx (birligi
// bilan), kengliklar, shu rukavdan tayyor mahsulotlar, ombordagi qoldiq. Amallar: tahrirlash, stiker, kenglik, rukavdan mahsulot.
import { useState } from "react";

import { toast } from "@/erp/kit/env";
import { num } from "@/erp/kit/fmt";
import { Icon, List, Loaded, Row, Sf, Sh, Sheet, useLoad } from "@/erp/kit/ui";
import { api, post } from "@/erp/finance/api";
import { useAcc } from "@/erp/finance/context";
import { dimsLabel, famTitle, groupName, groupOptions, KCOL, KIND, splitWidths, un, type Item } from "@/erp/finance/lib";

import { PriceBlock } from "./price-block";
import { PriceForm } from "./price";

export function ItemView({
  id,
  onClose,
  onEdit,
  onOpen,
  onChanged,
}: {
  id: number;
  onClose: () => void;
  onEdit: (it: Item) => void;
  onOpen: (id: number) => void;
  onChanged: () => void;
}) {
  const { groups, ask } = useAcc();
  const st = useLoad(() => api<Item>(`/app/api/erp/cat/items/${id}`), [id]);
  const [mk, setMk] = useState<Item | null>(null);
  const [pr, setPr] = useState<Item | null>(null);
  const run = (fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <>
      <Sheet title={st.data?.name ?? "Tovar"} onClose={onClose}>
        <Loaded st={st}>
          {(it) => {
            const a = it.attrs ?? {};
            const widths = run(async () => {
              const v = await ask("Kengliklar, mm", { placeholder: "10, 15, 20, 25", label: "Vergul bilan. Har kenglik — alohida variant (sotuv va qoldiq shu kesimda).", ok: "Qo'shish" });
              if (!v) return;
              await post(`/app/api/erp/cat/items/${it.id}/widths`, { widths: splitWidths(v) });
              toast("Qo'shildi");
              onChanged();
              void st.reload();
            });
            const labels = run(async () => {
              await post("/app/api/erp/labels/link", { item_id: it.id });
            });
            return (
              <>
                <List>
                  {it.designation ?? it.belt_mark ? <Row t="Belgi" val={<span className="code lg">{it.designation ?? it.belt_mark}</span>} /> : null}
                  <Row icon="layers" color={KCOL[it.kind]} t={[KIND[it.kind], famTitle(it.family)].filter(Boolean).join(" · ")} s={groupName(groups, it.group_id)} />
                  <Row t="O'lchov" val={a.dims ? dimsLabel(a.dims) : un(it.unit)} />
                  {it.brand ? <Row t="Brend" val={[it.brand, a.series].filter(Boolean).join(" ")} /> : null}
                  {it.name_ru && it.name_ru !== it.name ? <Row t="To'liq nom" s={it.name_ru} /> : null}
                  {it.min_qty ? <Row t="Minimal qoldiq" val={`${num(it.min_qty, 3)} ${un(it.unit)}`} /> : null}
                  {it.material ? <Row t="Xom ashyosi" s={it.material.name} chev onClick={() => onOpen(it.material!.id)} /> : null}
                </List>
                {it.spec_view?.length || it.computed?.length ? (
                  <>
                    <Sh t="Texnik ko'rsatkichlar" r={it.std ? <span className="text-xs">{it.std}</span> : null} />
                    <List>
                      {(it.spec_view ?? []).map((x) => (
                        <Row key={x.label} t={x.label} val={x.value} />
                      ))}
                      {(it.computed ?? []).map((x) => (
                        <Row key={x.label} t={x.label} val={<span className="num">{x.value}</span>} />
                      ))}
                    </List>
                  </>
                ) : it.family && it.family !== "other" && it.family !== "service" ? (
                  <Sf>Texnik ko&apos;rsatkichlar kiritilmagan — «Tahrirlash»da to&apos;ldiring (belgi va analoglar shundan).</Sf>
                ) : null}
                <Sh t="Kodlar" />
                <List>
                  <Row t="Artikul" val={it.sku ? <span className="code">{it.sku}</span> : "—"} />
                  <Row t="Shtrixkod" val={it.barcode ? <span className="code">{it.barcode}</span> : "—"} />
                  {it.legacy?.length ? <Row t="1C kodi" val={<span className="code">{it.legacy.join(", ")}</span>} valSmall={it.base ?? ""} /> : null}
                  <Row t="MXIK (IKPU)" val={it.ikpu ? <span className="code">{it.ikpu}</span> : "—"} />
                  <Row
                    t="TIF TN (HS)"
                    val={it.hs_code ? <span className="code">{it.hs_code}</span> : it.hs_hint ? <span className="text-hint">taklif: {it.hs_hint}</span> : "—"}
                  />
                </List>
                {it.analogs?.length ? (
                  <>
                    <Sh t="Analoglar" r={`${it.analogs.length} ta`} />
                    <List>
                      {it.analogs.map((x) => (
                        <Row
                          key={x.id}
                          icon="swap"
                          color={x.same_brand ? "red" : "teal"}
                          t={x.name}
                          s={x.same_brand ? "bir xil brend — takror bo'lishi mumkin" : (x.brand ?? "brendsiz")}
                          val={x.qty ? <span className="num">{num(x.qty, 3)}</span> : ""}
                          valSmall={x.qty ? un(x.unit) : ""}
                          chev
                          onClick={() => onOpen(x.id)}
                        />
                      ))}
                    </List>
                    <Sf>Bir xil standart belgi — o&apos;zaro almashadi (masalan HTD 8M ≈ RPP8). Mijozga qoldig&apos;i borini taklif qiling.</Sf>
                  </>
                ) : null}
                <PriceBlock it={it} onManual={() => setPr(it)} onChanged={() => { onChanged(); void st.reload(); }} />
                {it.products.length ? (
                  <>
                    <Sh t="Shu rukavdan tayyor mahsulot" />
                    <List>
                      {it.products.map((p) => (
                        <Row key={p.id} icon="package" color="green" t={p.name} chev onClick={() => onOpen(p.id)} />
                      ))}
                    </List>
                  </>
                ) : null}
                <Sh t="Qoldiq" r={it.stock.length ? `${it.stock.length} birlik` : null} />
                {it.stock.length ? (
                  <List>
                    {it.stock.slice(0, 30).map((x, i) => (
                      <Row
                        key={i}
                        icon="pin"
                        color="red"
                        t={x.loc ? <span className="code">{x.loc}</span> : "joysiz"}
                        s={[
                          x.code,
                          x.width_mm && x.length_mm ? `${num(x.width_mm, 0)}×${num(x.length_mm / 1000, 1)} m` : x.width_mm ? `eni ${num(x.width_mm, 0)}` : x.length_mm ? `${num(x.length_mm / 1000, 1)} m` : "",
                          x.char,
                          x.firm,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        val={<span className="num">{num(x.qty, 3)}</span>}
                        valSmall={un(it.unit)}
                      />
                    ))}
                  </List>
                ) : (
                  <Sf>Hali omborga joylanmagan — Ombor › Joylashtirish.</Sf>
                )}
                <div className="btns">
                  <button className="btn sec" onClick={() => onEdit(it)}>
                    <Icon n="pencil" /> Tahrirlash
                  </button>
                  <button className="btn sec" onClick={labels}>
                    <Icon n="printer" /> Stiker PDF
                  </button>
                </div>
                {it.kind === "product" || (!a.dims && it.kind !== "service") ? (
                  <div className="btns">
                    <button className="btn sec" onClick={widths}>
                      <Icon n="ruler" /> Kenglik qo&apos;shish
                    </button>
                  </div>
                ) : null}
                {a.dims === "w" ? (
                  <>
                    <div className="btns">
                      <button className="btn" onClick={() => setMk(it)}>
                        <Icon n="scissors" /> Tayyor mahsulot yaratish
                      </button>
                    </div>
                    <Sf>Rukavdan kesiladigan remen: shu profil, uzunlik va brend, kengliklari bilan (10, 15, 20… mm).</Sf>
                  </>
                ) : null}
              </>
            );
          }}
        </Loaded>
      </Sheet>
      {pr ? (
        <PriceForm
          it={pr}
          onClose={() => setPr(null)}
          onSaved={() => {
            setPr(null);
            onChanged();
            void st.reload();
          }}
        />
      ) : null}
      {mk ? (
        <ProductsForm
          m={mk}
          onClose={() => setMk(null)}
          onDone={(p) => {
            setMk(null);
            onChanged();
            onOpen(p.id);
          }}
        />
      ) : null}
    </>
  );
}

/** Rukavdan tayyor mahsulot: kategoriya (odatda "Tishli remenlar") va kengliklar */
function ProductsForm({ m, onClose, onDone }: { m: Item; onClose: () => void; onDone: (p: Item) => void }) {
  const { groups } = useAcc();
  const [g, setG] = useState(() => String(groups.find((x) => x.attrs.kind === "product")?.id ?? ""));
  const [w, setW] = useState("");
  return (
    <Sheet
      title="Tayyor mahsulot"
      done="Yaratish"
      onClose={onClose}
      onDone={async () => {
        const r = await post<Item>(`/app/api/erp/cat/items/${m.id}/products`, { group_id: g, widths: splitWidths(w) });
        toast(`Yaratildi: ${r.name}`);
        onDone(r);
        return false;
      }}
    >
      <List>
        <Row icon="layers" color="orange" t={m.name} s="xom ashyo (rukav)" />
        <div className="field">
          <label htmlFor="acc-pg">Kategoriya</label>
          <select id="acc-pg" value={g} onChange={(e) => setG(e.target.value)}>
            <option value="">— tanlang —</option>
            {groupOptions(groups).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field col">
          <label htmlFor="acc-pw">Kengliklar, mm</label>
          <input id="acc-pw" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} placeholder="10, 15, 20, 25, 30" />
        </div>
      </List>
      <Sf>Nomi: «{m.name.replace(/^Рукав\s+/, "")}». Kenglikni keyin ham qo&apos;shish mumkin.</Sf>
    </Sheet>
  );
}
