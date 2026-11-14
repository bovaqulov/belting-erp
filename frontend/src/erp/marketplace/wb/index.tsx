// WB buyurtmalari — kabinetdagi tartib: Yangilari (tanlab → postavkaga) | Yig'ilmoqda (postavkalar → postavka ichi) |
// Yetkazib berishda | Yakunlanganlar | Bekor qilinganlar.
import { useState } from "react";

import { LINK_BTN } from "@/erp/kit/layout";
import { toast } from "@/erp/kit/env";
import { dt } from "@/erp/kit/fmt";
import { Check, Empty, List, Loaded, Row, Sh, useLoad } from "@/erp/kit/ui";
import { api, P, post } from "@/erp/marketplace/api";
import { useMk } from "@/erp/marketplace/context";
import { ageCls, agoText, firstTitle, sold, WB_STG, type Board, type Order, type Stage, type Supply } from "@/erp/marketplace/lib";
import { OrderSheet } from "@/erp/marketplace/order";
import { SyncRow } from "@/erp/marketplace/orders/sync";
import { Tbl } from "@/erp/kit/table";

import { SupplyView } from "./supply";

/** Yangi postavka: nom so'raladi (standart — bugungi sana) */
export function useNewSupply() {
  const { ask } = useMk();
  return async (): Promise<string | null> => {
    const n = await ask("Yangi yetkazma nomi", { value: `Yetkazma ${new Date().toLocaleDateString("ru")}`, ok: "Yaratish" });
    if (!n) return null;
    try {
      const r = await post<{ id: string }>(`${P}/wb/supplies`, { name: n });
      toast("Yetkazma yaratildi");
      return r.id;
    } catch (e) {
      toast((e as Error).message, "bad");
      return null;
    }
  };
}

export function WbOrders() {
  const [stage, setStage] = useState<Stage>("new");
  const [sup, setSup] = useState<string | null>(null);
  const st = useLoad(() => api<Board>(`${P}/orders/wb/board?stage=${stage}`), [stage]);
  if (stage === "assembly" && sup) return <SupplyView sid={sup} onBack={() => (setSup(null), void st.reload())} />;
  const cnt = st.data?.counts ?? {};
  return (
    <>
      <div className="chips" role="group" aria-label="Bosqich">
        {WB_STG.map(([k, t]) => (
          <button key={k} type="button" className={`chip ${stage === k ? "on" : ""}`} aria-pressed={stage === k} onClick={() => setStage(k)}>
            {t}
            {cnt[k] ? ` · ${cnt[k]}` : ""}
          </button>
        ))}
      </div>
      <div style={{ height: 10 }} />
      <SyncRow ch="wb" onDone={() => void st.reload()} />
      <Loaded st={st}>
        {(b) =>
          stage === "new" ? (
            <NewOrders rows={b.orders} onDone={(sid) => (setStage("assembly"), setSup(sid))} reload={() => void st.reload()} />
          ) : stage === "assembly" ? (
            <Supplies rows={b.orders} onOpen={setSup} />
          ) : (
            <Plain rows={b.orders} reload={() => void st.reload()} />
          )
        }
      </Loaded>
    </>
  );
}

// ---------------------------------------------------------------- yangilari: tanlab postavkaga
function NewOrders({ rows, onDone, reload }: { rows: Order[]; onDone: (sid: string) => void; reload: () => void }) {
  const { wide, choose, touched } = useMk();
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState<Order | null>(null);
  const newSupply = useNewSupply();
  if (!rows.length) return <Empty icon="cart" title="Yangi buyurtma yo'q">WB&apos;dan kelgan buyurtmalar shu yerda tanlanib postavkaga qo&apos;shiladi.</Empty>;
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const all = sel.length === rows.length;
  const add = async () => {
    if (!sel.length) return toast("Buyurtma tanlanmagan", "bad");
    try {
      const ss = await api<Supply[]>(`${P}/wb/supplies`);
      const pickd = ss.length
        ? await choose("Qaysi postavkaga?", [...ss.map((x) => ({ value: x.id, label: x.name || x.id, sub: x.id })), { value: "_new", label: "+ Yangi postavka" }])
        : "_new";
      if (!pickd) return;
      const sid = pickd === "_new" ? await newSupply() : pickd;
      if (!sid) return;
      await post(`${P}/wb/supplies/${encodeURIComponent(sid)}/add`, { orders: sel });
      toast(`${sel.length} ta buyurtma postavkaga qo'shildi`);
      touched();
      onDone(sid);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const age = (o: Order) => <span className={`badge ${ageCls(o.age_min)}`}>{agoText(o.age_min)}</span>;
  return (
    <>
      <Sh t={`Yangilari · ${rows.length}`} r={sel.length ? `tanlandi ${sel.length}` : null} />
      {wide ? (
        <Tbl
          label="WB yangi buyurtmalari"
          rows={rows}
          rowKey={(o) => o.ext_id}
          onRow={setOpen}
          cols={[
            {
              h: <input type="checkbox" className="ck" aria-label="Hammasini tanlash" checked={all} onChange={() => setSel(all ? [] : rows.map((o) => o.ext_id))} />,
              f: (o) => <input type="checkbox" className="ck" aria-label={`${o.ext_id} tanlash`} checked={sel.includes(o.ext_id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(o.ext_id)} />,
              w: "40px",
            },
            {
              h: "Vazifa",
              f: (o) => (
                <>
                  <span className="code">{o.ext_id}</span>
                  <div className="t2">{dt(o.ordered)}</div>
                  {age(o)}
                </>
              ),
            },
            {
              h: "Tovar",
              f: (o) => (
                <>
                  {firstTitle(o)}
                  <div className="t2 code mut">{o.article}</div>
                </>
              ),
            },
            { h: "Narx", f: sold, n: true },
          ]}
        />
      ) : (
        <List>
          <Row lead={<Check on={all} />} t="Hammasini tanlash" role="checkbox" checked={all} onClick={() => setSel(all ? [] : rows.map((o) => o.ext_id))} />
          {rows.map((o) => (
            <Row
              key={o.ext_id}
              lead={<Check on={sel.includes(o.ext_id)} />}
              role="checkbox"
              checked={sel.includes(o.ext_id)}
              label={`${o.ext_id} tanlash`}
              t={firstTitle(o)}
              tcls="wrap2"
              s={
                <>
                  <span className="code mut">{o.ext_id}</span> · {age(o)}
                </>
              }
              scls="ml"
              val={sold(o)}
              onClick={() => toggle(o.ext_id)}
            />
          ))}
        </List>
      )}
      <div className="btns">
        <button type="button" className="btn" disabled={!sel.length} onClick={() => void add()}>
          {sel.length ? `${sel.length} ta buyurtmani postavkaga qo'shish` : "Buyurtmalarni tanlang"}
        </button>
      </div>
      {open ? <OrderSheet o={open} onClose={() => setOpen(null)} onChanged={reload} /> : null}
    </>
  );
}

// ---------------------------------------------------------------- yig'ilmoqda: ochiq postavkalar
function Supplies({ rows, onOpen }: { rows: Order[]; onOpen: (sid: string) => void }) {
  const { wide } = useMk();
  const st = useLoad(() => api<Supply[]>(`${P}/wb/supplies`), []);
  const newSupply = useNewSupply();
  const by: Record<string, number> = {};
  for (const o of rows) if (o.supply_id) by[o.supply_id] = (by[o.supply_id] ?? 0) + 1;
  const create = async () => {
    const id = await newSupply();
    if (id) void st.reload();
  };
  return (
    <>
      <Sh
        t={`Postavkalar${st.data ? ` · ${st.data.length}` : ""}`}
        r={
          <button type="button" className={LINK_BTN} onClick={() => void create()}>
            + Bo&apos;sh yetkazma yaratish
          </button>
        }
      />
      <Loaded st={st}>
        {(ss) =>
          !ss.length ? (
            <Empty icon="truck" title="Ochiq postavka yo'q">
              «Yangilari» bo&apos;limida buyurtmalarni tanlab, postavkaga qo&apos;shing.
            </Empty>
          ) : wide ? (
            <Tbl
              label="WB postavkalari"
              rows={ss}
              rowKey={(x) => x.id}
              onRow={(x) => onOpen(x.id)}
              cols={[
                {
                  h: "Yetkazma",
                  f: (x) => (
                    <>
                      <b>{x.name}</b>
                      <div className="t2">{dt(x.createdAt)} dan</div>
                    </>
                  ),
                },
                { h: "QR kodi", f: (x) => <span className="code">{x.id}</span> },
                { h: "Buyurtmalar", f: (x) => by[x.id] ?? 0, n: true },
                { h: "Ombor", f: () => "Мой склад" },
              ]}
            />
          ) : (
            <List>
              {ss.map((x) => (
                <Row
                  key={x.id}
                  icon="truck"
                  color="purple"
                  t={x.name || x.id}
                  s={
                    <>
                      <span className="code mut">{x.id}</span> · {by[x.id] ?? 0} buyurtma
                    </>
                  }
                  chev
                  onClick={() => onOpen(x.id)}
                />
              ))}
            </List>
          )
        }
      </Loaded>
    </>
  );
}

// ---------------------------------------------------------------- yo'lda / yakunlangan / bekor
function Plain({ rows, reload }: { rows: Order[]; reload: () => void }) {
  const { wide } = useMk();
  const [open, setOpen] = useState<Order | null>(null);
  if (!rows.length) return <Empty icon="cart" title="Hozircha buyurtmalar yo'q" />;
  return (
    <>
      <div style={{ height: 14 }} />
      {wide ? (
        <Tbl
          label="WB buyurtmalari"
          rows={rows}
          rowKey={(o) => o.ext_id}
          onRow={setOpen}
          cols={[
            {
              h: "Vazifa",
              f: (o) => (
                <>
                  <span className="code">{o.ext_id}</span>
                  <div className="t2">{dt(o.ordered)}</div>
                </>
              ),
            },
            {
              h: "Tovar",
              f: (o) => (
                <>
                  {firstTitle(o)}
                  <div className="t2 code mut">{o.article}</div>
                </>
              ),
            },
            { h: "Holat", f: (o) => o.ext_status },
            { h: "Yetkazma", f: (o) => <span className="code mut">{o.supply_id}</span> },
            { h: "Narx", f: sold, n: true },
          ]}
        />
      ) : (
        <List>
          {rows.map((o) => (
            <Row
              key={o.ext_id}
              t={firstTitle(o)}
              tcls="wrap2"
              s={
                <>
                  <span className="code mut">{o.ext_id}</span> · {o.ext_status}
                </>
              }
              val={sold(o)}
              chev
              onClick={() => setOpen(o)}
            />
          ))}
        </List>
      )}
      {open ? <OrderSheet o={open} onClose={() => setOpen(null)} onChanged={reload} /> : null}
    </>
  );
}
