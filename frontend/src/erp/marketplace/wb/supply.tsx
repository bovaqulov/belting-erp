// WB postavka ichi — kabinetdagi 3 bosqich: 1) buyurtmalarni yig'ish (tanlanma ro'yxati, stikerlar),
// 2) yuk joylari (1 quti = 1 yuk joyi, QR qutiga), 3) yetkazib berishga topshirish → postavka QR.
import { useState } from "react";

import { confirm, toast } from "@/erp/kit/env";
import { dt } from "@/erp/kit/fmt";
import { List, Loaded, Row, Sf, Sh, useLoad } from "@/erp/kit/ui";
import { api, P, post } from "@/erp/marketplace/api";
import { useMk } from "@/erp/marketplace/context";
import { firstTitle, sold, type Order, type SupplyDetail } from "@/erp/marketplace/lib";
import { OrderSheet } from "@/erp/marketplace/order";
import { esc, pickingHtml, printWin } from "@/erp/marketplace/print";
import { Tbl } from "@/erp/kit/table";

const STEPS = ["Yig'ish", "Yuk joylari", "Topshirish"];

export function SupplyView({ sid, onBack }: { sid: string; onBack: () => void }) {
  const { wide, touched } = useMk();
  const st = useLoad(() => api<SupplyDetail>(`${P}/wb/supplies/${encodeURIComponent(sid)}`), [sid]);
  const [open, setOpen] = useState<Order | null>(null);
  const [boxN, setBoxN] = useState("1");
  const S = `${P}/wb/supplies/${encodeURIComponent(sid)}`;
  const run = (fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const again = () => void st.reload();

  return (
    <>
      <div className="chips">
        <button type="button" className="chip" onClick={onBack}>
          ← Postavkalar
        </button>
      </div>
      <Loaded st={st}>
        {(d) => {
          const sp = d.supply;
          const closed = !!(sp.closedAt || sp.done);
          const rs = d.orders;
          const stickers = run(async () => {
            toast("Stikerlar olinmoqda…", "info");
            const r = await post<{ stickers: { file: string }[] }>(`${P}/wb/stickers`, { orders: rs.map((o) => o.ext_id) });
            printWin("Stikerlar", r.stickers.map((x) => `<div class="st"><img src="data:image/png;base64,${esc(x.file)}"></div>`).join(""), true);
          });
          const printBoxes = (ids: string[]) =>
            run(async () => {
              const r = await post<{ files: string[] }>(`${S}/boxes/stickers`, { ids });
              printWin("Yuk joylari QR", r.files.map((f) => `<div class="st"><img src="data:image/png;base64,${esc(f)}"></div>`).join(""), true);
            });
          const addBoxes = run(async () => {
            const n = Math.max(1, Math.min(Number(boxN) || 1, 100));
            await post(`${S}/boxes`, { amount: n });
            toast(`${n} ta yuk joyi yaratildi`);
            again();
          });
          const delBox = (id: string) =>
            run(async () => {
              if (!(await confirm(`${id} yuk joyi o'chirilsinmi?`))) return;
              await post(`${S}/boxes/delete`, { ids: [id] });
              toast("O'chirildi");
              again();
            });
          const deliver = run(async () => {
            if (!d.boxes.length && !(await confirm("Yuk joyi yaratilmagan — qabul punkti qabul qilmasligi mumkin. Baribir topshirilsinmi?"))) return;
            if (!d.picked_all && !(await confirm("Hamma buyurtma skanerlanmagan. Baribir topshirilsinmi?"))) return;
            if (!(await confirm(`${sp.name || sid} yetkazib berishga topshirilsinmi? Keyin unga buyurtma qo'shib bo'lmaydi.`))) return;
            await post(`${S}/deliver`);
            toast("Topshirildi — QR kodni chop eting");
            touched();
            again();
          });
          const qr = run(async () => {
            await api(`${S}/qr`);
          });
          const done = rs.filter((o) => o.assembled_at).length;

          return (
            <>
              <div className="large mk-sup">
                {sp.name || sid}
                <small>
                  <span className="code">{sid}</span> · Мой склад · {rs.length} buyurtma · {d.boxes.length} yuk joyi · {dt(sp.createdAt)} dan
                </small>
              </div>
              <ol className="mk-steps" aria-label="Bosqichlar">
                {STEPS.map((t, i) => (
                  <li key={t} className={i + 1 < d.step ? "done" : i + 1 === d.step ? "on" : ""} aria-current={i + 1 === d.step ? "step" : undefined}>
                    <span className="n">{i + 1 < d.step ? "✓" : i + 1}</span>
                    {t}
                  </li>
                ))}
              </ol>
              <div className="cols">
                <div>
                  <Sh t="Amallar" />
                  <List>
                    <Row
                      icon="list"
                      color="blue"
                      t="Tanlanma ro'yxati"
                      s="Omborda bir yurishda olish uchun — tovar bo'yicha"
                      tap
                      onClick={() => printWin(`Tanlanma ro'yxati — ${sp.name || sid}`, pickingHtml(sp.name || sid, rs.length, d.picking))}
                    />
                    <Row icon="printer" color="purple" t="Stikerlarni chop etish" s={`${rs.length} ta buyurtma, 58×40`} tap onClick={stickers} />
                    {closed ? (
                      <Row icon="printer" color="green" t="Yetkazma QR kodi" s="Topshirilgan — QR ni chop eting" tap onClick={qr} />
                    ) : (
                      <Row icon="send" color="green" t="Yetkazib berishga topshirish" s="Buyurtmalar yig'ilib, yuk joylariga QR yopishtirilgach" tap onClick={deliver} />
                    )}
                  </List>
                </div>
                {closed ? null : (
                  <div>
                    <Sh t={`Yuk joylari · ${d.boxes.length}`} />
                    <List>
                      <div className="field">
                        <label htmlFor="mk-boxn">Nechta quti</label>
                        <input id="mk-boxn" inputMode="numeric" value={boxN} onChange={(e) => setBoxN(e.target.value.replace(/\D/g, ""))} style={{ maxWidth: 80 }} />
                      </div>
                      <Row icon="plus" color="blue" t="Yuk joyini qo'shish" tap onClick={addBoxes} />
                      {d.boxes.length ? <Row icon="printer" color="purple" t="Hamma yuk joylari QR-kodlari" tap onClick={printBoxes(d.boxes.map((x) => x.id))} /> : null}
                      {d.boxes.map((x) => (
                        <Row
                          key={x.id}
                          icon="package"
                          color="gray"
                          t={<span className="code">{x.id}</span>}
                          s={`${x.orders.length} buyurtma`}
                          right={
                            <span className="mk-acts">
                              <button type="button" className="chip" onClick={printBoxes([x.id])}>
                                QR
                              </button>
                              <button type="button" className="chip" aria-label={`${x.id} o'chirish`} onClick={delBox(x.id)}>
                                O&apos;chirish
                              </button>
                            </span>
                          }
                        />
                      ))}
                    </List>
                    <Sf>1 yuk joyi = 1 quti. Har qutiga kamida 2 buyurtma; QR kodni buyurtmaga emas, qutiga yopishtiring.</Sf>
                  </div>
                )}
              </div>
              <Sh t={`Buyurtmalar · ${rs.length}`} r={rs.length ? `yig'ildi ${done}/${rs.length}` : null} />
              {wide ? (
                <Tbl
                  label="Postavka buyurtmalari"
                  rows={rs}
                  rowKey={(o) => o.ext_id}
                  onRow={setOpen}
                  cols={[
                    {
                      h: "Vazifa",
                      f: (o) => (
                        <>
                          <span className="code">{o.ext_id}</span>
                          <div className="t2">{dt(o.ordered)} dan</div>
                        </>
                      ),
                    },
                    {
                      h: "Tovar",
                      f: (o) => (
                        <>
                          {firstTitle(o)}
                          <div className="t2">
                            <span className="code mut">{o.article}</span>
                            {o.number ? ` · ERP ${o.number}` : ""}
                          </div>
                        </>
                      ),
                    },
                    { h: "Narx", f: sold, n: true },
                    {
                      h: "Yig'ildi",
                      f: (o) => (o.assembled_at ? <span className="ok-t">✓</span> : <span className="code">{`${o.picked.length}/${o.need || 1}`}</span>),
                      n: true,
                    },
                  ]}
                />
              ) : (
                <List>
                  {rs.map((o) => (
                    <Row
                      key={o.ext_id}
                      icon={o.assembled_at ? "check" : "package"}
                      color={o.assembled_at ? "green" : "orange"}
                      t={firstTitle(o)}
                      tcls="wrap2"
                      s={<span className="code mut">{o.ext_id}</span>}
                      val={sold(o)}
                      valSmall={o.assembled_at ? "yig'ildi ✓" : `${o.picked.length}/${o.need || 1}`}
                      chev
                      onClick={() => setOpen(o)}
                    />
                  ))}
                </List>
              )}
              {open ? <OrderSheet o={{ ...open, stage: closed ? open.stage : "assembly" }} onClose={() => setOpen(null)} onChanged={again} /> : null}
            </>
          );
        }}
      </Loaded>
    </>
  );
}
