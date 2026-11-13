// Tovar oynasi: tur va kategoriya, o'lchov, remen belgisi (.code), brend, xom ashyosi; kengliklar (variant), shu rukavdan
// tayyor mahsulotlar, ombordagi qoldiq (joy, birlik). Amallar: tahrirlash, stiker PDF, kenglik qo'shish, rukavdan mahsulot.
import { useState } from "react";

import { toast } from "@/erp/kit/env";
import { num } from "@/erp/kit/fmt";
import { Icon, List, Loaded, Row, Sf, Sh, Sheet, useLoad } from "@/erp/kit/ui";
import { api, post } from "@/erp/finance/api";
import { useAcc } from "@/erp/finance/context";
import { dimsLabel, groupName, groupOptions, KCOL, KIND, priceFor, priceLabel, splitWidths, un, type Item } from "@/erp/finance/lib";

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
                  <Row icon="layers" color={KCOL[it.kind]} t={KIND[it.kind]} s={groupName(groups, it.group_id)} />
                  <Row t="O'lchov" val={a.dims ? dimsLabel(a.dims) : un(it.unit)} />
                  {it.belt_mark ? <Row t="Remen belgisi" val={<span className="code lg">{it.belt_mark}</span>} /> : null}
                  {it.brand ? <Row t="Brend" val={[it.brand, a.series].filter(Boolean).join(" ")} /> : null}
                  {it.sku ? <Row t="Artikul" val={<span className="code">{it.sku}</span>} /> : null}
                  {it.min_qty ? <Row t="Minimal qoldiq" val={`${num(it.min_qty, 3)} ${un(it.unit)}`} /> : null}
                  {it.material ? <Row t="Xom ashyosi" s={it.material.name} chev onClick={() => onOpen(it.material!.id)} /> : null}
                </List>
                <Sh t="Narx" r={<button type="button" className="mod-link" onClick={() => setPr(it)}>Belgilash</button>} />
                <List>
                  <Row icon="coins" color={it.price?.price != null || Object.keys(it.price?.overrides ?? {}).length ? "green" : "gray"} t={priceLabel(it.price, (x) => num(x, 0))} tap onClick={() => setPr(it)} chev />
                  {it.chars.map((c) => {
                    const v = priceFor(it.price, c.width_mm);
                    const manual = c.width_mm !== null && it.price?.overrides[String(c.width_mm)] !== undefined;
                    return (
                      <Row
                        key={c.id}
                        t={<span className="code">{c.name}</span>}
                        val={v === null ? "—" : <span className="num">{num(v, 0)}</span>}
                        valSmall={v === null ? "" : manual ? "so'm · qo'lda" : "so'm"}
                      />
                    );
                  })}
                </List>
                {it.chars.length ? null : <Sf>Kengligi (varianti) yo&apos;q tovar — bitta narx.</Sf>}
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
