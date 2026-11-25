// Logistika (faqat ko'rinish): sarlavha, holat filtri (faol / yetkazildi / hammasi), qidiruv, jo'natmalar ro'yxati;
// jo'natma oynasi (ma'lumot, keyingi holat tugmalari, tarix); yaratish/tahrirlash formasi.
import { AppTop } from "@/erp/kit/layout";
import { Empty, List, Row, Seg, Sf, Sh, Sheet } from "@/erp/kit/ui";

import { CARRIERS, carrier, FILTERS, STATUS, sum, when, type Filter, type Form, type Shipment, type ShipmentList, type StatusKey } from "./logistics.lib";

const FILTER_LABEL: Record<Filter, string> = { active: "Faol", delivered: "Yetkazildi", all: "Hammasi" };

export function Top() {
  return <AppTop up="/app/erp" upLabel="ERP" title="Logistika" sub="Jo'natmalar va kuzatuv" logo />;
}

const St = ({ s }: { s: StatusKey }) => <span className={`st ${STATUS[s].st}`}>{STATUS[s].title}</span>;

const Sq = ({ k }: { k: string }) => {
  const c = carrier(k);
  return (
    <span className="sq text-[13px] font-bold" style={{ background: c.color }} aria-hidden="true">
      {c.title.slice(0, 1)}
    </span>
  );
};

export function ListView({
  d,
  filter,
  q,
  onFilter,
  onQ,
  onOpen,
}: {
  d: ShipmentList;
  filter: Filter;
  q: string;
  onFilter: (f: Filter) => void;
  onQ: (q: string) => void;
  onOpen: (s: Shipment) => void;
}) {
  const label = (f: Filter) => (f === "active" ? `${FILTER_LABEL[f]} · ${d.active}` : f === "delivered" ? `${FILTER_LABEL[f]} · ${d.counts.delivered}` : FILTER_LABEL[f]);
  return (
    <>
      <Seg items={FILTERS.map((f) => [f, label(f)])} cur={filter} onPick={onFilter} />
      <List>
        <div className="field">
          <input type="search" className="!text-left" value={q} placeholder="Raqam, qabul qiluvchi, trek, shahar" aria-label="Jo'natma qidirish" onChange={(e) => onQ(e.target.value)} />
        </div>
      </List>
      {d.shipments.length ? (
        <List cls="mt-2">
          {d.shipments.map((x) => (
            <Row
              key={x.id}
              lead={<Sq k={x.carrier} />}
              t={x.recipient}
              s={
                <>
                  <span className="code">{x.number}</span> · {[x.city, carrier(x.carrier).title, x.track_no].filter(Boolean).join(" · ")}
                </>
              }
              right={<St s={x.status} />}
              chev
              onClick={() => onOpen(x)}
              data={{ id: x.id }}
            />
          ))}
        </List>
      ) : (
        <Empty icon="truck" title={q ? "Topilmadi" : filter === "active" ? "Faol jo'natma yo'q" : "Jo'natma yo'q"}>
          {q ? "Boshqa so'z bilan qidirib ko'ring." : "Yangi jo'natma — pastdagi tugma."}
        </Empty>
      )}
    </>
  );
}

export function ShipmentSheet({
  x,
  onClose,
  onEdit,
  onStatus,
}: {
  x: Shipment;
  onClose: () => void;
  onEdit: () => void;
  onStatus: (s: StatusKey) => void;
}) {
  const c = carrier(x.carrier);
  const open = x.next.length > 0;
  return (
    <Sheet title={x.number} onClose={onClose}>
      <div className="mx-4 mb-2 flex items-center gap-2">
        <St s={x.status} />
        <span className="text-sm text-hint">{c.title}</span>
      </div>
      <List>
        <Row icon="user" color="blue" t={x.recipient} s={x.phone || undefined} />
        <Row icon="pin" color="red" t={x.city || "—"} s={x.address || undefined} />
        <Row icon="package" color="orange" t="Joylar" val={`${x.places}${x.weight_kg !== null ? ` · ${String(x.weight_kg).replace(".", ",")} kg` : ""}`} />
        <Row icon="wallet" color="green" t="Narx" val={x.cost !== null ? `${sum(x.cost)} so'm` : "—"} s={x.payer === "customer" ? "Mijoz to'laydi" : "Biz to'laymiz"} />
        {x.track_no ? <Row icon="scan" color="purple" t="Trek raqami" val={<span className="code">{x.track_no}</span>} /> : null}
        {x.ref ? <Row icon="link" color="gray" t="Buyurtma" val={<span className="code">{x.ref}</span>} /> : null}
      </List>
      {x.note ? <Sf>{x.note}</Sf> : null}
      {open ? (
        <>
          <Sh t="Holatni o'zgartirish" />
          <div className="mx-4 flex flex-wrap gap-2">
            {x.next.map((s) => (
              <button key={s} type="button" className={`mini ${s === "delivered" ? "pri" : ""}`} onClick={() => onStatus(s)}>
                {STATUS[s].act}
              </button>
            ))}
          </div>
          <div className="btns">
            <button type="button" className="btn sec" onClick={onEdit}>
              Tahrirlash
            </button>
          </div>
        </>
      ) : null}
      {x.history?.length ? (
        <>
          <Sh t="Tarix" />
          <List>
            {[...x.history].reverse().map((h, i) => (
              <Row key={i} t={STATUS[h.status].title} s={h.note || undefined} val={<span className="num text-sm text-hint">{when(h.ts)}</span>} />
            ))}
          </List>
        </>
      ) : null}
    </Sheet>
  );
}

export function FormSheet({
  title,
  f,
  set,
  onSave,
  onClose,
}: {
  title: string;
  f: Form;
  set: (patch: Partial<Form>) => void;
  onSave: () => Promise<boolean>;
  onClose: () => void;
}) {
  const inp = (k: keyof Form, label: string, o: { mode?: "numeric" | "decimal" | "tel"; ph?: string } = {}) => (
    <div className="field">
      <label htmlFor={`lg-${k}`}>{label}</label>
      <input id={`lg-${k}`} inputMode={o.mode} type={o.mode === "tel" ? "tel" : "text"} placeholder={o.ph} value={f[k]} onChange={(e) => set({ [k]: e.target.value })} />
    </div>
  );
  return (
    <Sheet title={title} done="Saqlash" onDone={onSave} onClose={onClose}>
      <Sh t="Tashuvchi" />
      <div className="mx-4 grid grid-cols-2 gap-2 min-[560px]:grid-cols-4" role="radiogroup" aria-label="Tashuvchi">
        {CARRIERS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={f.carrier === c.key}
            className={`mini !rounded-xl ${f.carrier === c.key ? "pri" : ""}`}
            onClick={() => set({ carrier: c.key })}
          >
            {c.title}
          </button>
        ))}
      </div>
      <Sh t="Qabul qiluvchi" />
      <List>
        {inp("recipient", "Nomi", { ph: "Firma yoki shaxs" })}
        {inp("phone", "Telefon", { mode: "tel", ph: "+998" })}
        {inp("city", "Shahar")}
        {inp("address", "Manzil")}
      </List>
      <Sh t="Yuk" />
      <List>
        {inp("places", "Joylar", { mode: "numeric" })}
        {inp("weight_kg", "Vazn, kg", { mode: "decimal" })}
        {inp("cost", "Narx, so'm", { mode: "decimal" })}
        <div className="field">
          <label htmlFor="lg-payer">To&apos;laydi</label>
          <select id="lg-payer" value={f.payer} onChange={(e) => set({ payer: e.target.value as Form["payer"] })}>
            <option value="us">Biz</option>
            <option value="customer">Mijoz</option>
          </select>
        </div>
      </List>
      <Sh t="Qo'shimcha" />
      <List>
        {inp("track_no", "Trek raqami")}
        {inp("ref", "Buyurtma", { ph: "BR-BU-26-…" })}
        {inp("note", "Izoh")}
      </List>
    </Sheet>
  );
}
