// WB postavka ichi — kabinetdagi 3 bosqich: 1) buyurtmalarni yig'ish (tanlanma ro'yxati, stikerlar),
// 2) yuk joylari (1 quti = 1 yuk joyi, QR qutiga), 3) yetkazib berishga topshirish → postavka QR.
// Ixcham: 1-qator — nom, bosqichlar, topshirish; 2-qator — chop etish va yuk joylari (qutilar — chip).
// Buyurtmalar: rasm bilan; tanlanganlar uchun — stiker, boshqa postavkaga o'tkazish, bekor qilish.
import { useState } from "react";

import { confirm, toast } from "@/erp/kit/env";
import { dt } from "@/erp/kit/fmt";
import { Icon, List, Loaded, MainButton, Row, Sh, useLoad } from "@/erp/kit/ui";
import { LINK_BTN } from "@/erp/kit/layout";
import { Tbl } from "@/erp/kit/table";
import { api, P, post } from "@/erp/marketplace/api";
import { useMk } from "@/erp/marketplace/context";
import { firstTitle, sold, type Order, type Supply, type SupplyDetail } from "@/erp/marketplace/lib";
import { OrderSheet } from "@/erp/marketplace/order";
import { esc, pickingHtml, printWin } from "@/erp/marketplace/print";
import { Thumb } from "@/erp/marketplace/thumb";

import { useNewSupply } from "./index";
import { usePoll } from "@/erp/marketplace/orders/sync";

const STEPS = ["Yig'ish", "Yuk joylari", "Topshirish"];

const printStickers = async (ids: string[]) => {
  toast("Stikerlar olinmoqda…", "info");
  const r = await post<{ stickers: { file: string }[] }>(`${P}/wb/stickers`, { orders: ids });
  printWin("Stikerlar", r.stickers.map((x) => `<div class="st"><img src="data:image/png;base64,${esc(x.file)}"></div>`).join(""), true);
};

export function SupplyView({ sid, onBack }: { sid: string; onBack: () => void }) {
  const { wide, touched, choose } = useMk();
  const st = useLoad(() => api<SupplyDetail>(`${P}/wb/supplies/${encodeURIComponent(sid)}`), [sid]);
  usePoll(() => void st.reload());
  const [open, setOpen] = useState<Order | null>(null);
  const [boxN, setBoxN] = useState("1");
  const [sel, setSel] = useState<string[]>([]);
  const newSupply = useNewSupply();
  const S = `${P}/wb/supplies/${encodeURIComponent(sid)}`;
  const run = (fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const again = () => void st.reload();
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Loaded st={st}>
      {(d) => {
        const sp = d.supply;
        const closed = !!(sp.closedAt || sp.done);
        const rs = d.orders;
        const picked = sel.filter((id) => rs.some((o) => o.ext_id === id)); // yangilangandan keyin yo'qolganlari tushadi
        const all = rs.length > 0 && picked.length === rs.length;
        const stickers = run(() => printStickers(rs.map((o) => o.ext_id)));
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

        // ---------------------------------------------------------- tanlanganlar
        const selStickers = run(() => printStickers(picked));
        const selMove = run(async () => {
          const ss = (await api<Supply[]>(`${P}/wb/supplies`)).filter((x) => x.id !== sid);
          const to = await choose("Qaysi postavkaga o'tkazilsin?", [...ss.map((x) => ({ value: x.id, label: x.name || x.id, sub: x.id })), { value: "_new", label: "+ Yangi postavka" }]);
          if (!to) return;
          const target = to === "_new" ? await newSupply() : to;
          if (!target) return;
          await post(`${P}/wb/supplies/${encodeURIComponent(target)}/add`, { orders: picked });
          toast(`${picked.length} ta buyurtma o'tkazildi`);
          setSel([]);
          touched();
          again();
        });
        const selCancel = run(async () => {
          if (!(await confirm(`${picked.length} ta buyurtma bekor qilinsinmi? WB'da qaytarib bo'lmaydi.`))) return;
          let ok = 0;
          const fail: string[] = [];
          for (const id of picked) {
            try {
              await post(`${P}/orders/wb/${encodeURIComponent(id)}/cancel`, { reason: "" });
              ok++;
            } catch (e) {
              fail.push(`${id}: ${(e as Error).message}`);
              if ((e as { status?: number }).status === 403) break; // yozish o'chiq — qolganlarini urinmaymiz
            }
          }
          if (ok) toast(`${ok} ta buyurtma bekor qilindi`);
          if (fail.length) toast(fail[0] + (fail.length > 1 ? ` (+${fail.length - 1})` : ""), "bad");
          setSel([]);
          touched();
          again();
        });
        const done = rs.filter((o) => o.assembled_at).length;
        const title = (o: Order) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <Thumb o={o} />
            <span className="min-w-0">
              {firstTitle(o)}
              <span className="t2 block">
                <span className="code mut">{o.article}</span>
                {o.number ? ` · ERP ${o.number}` : ""}
              </span>
            </span>
          </span>
        );
        const ck = (o: Order) => (
          <input
            type="checkbox"
            className="ck"
            aria-label={`${o.ext_id} tanlash`}
            checked={picked.includes(o.ext_id)}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggle(o.ext_id)}
          />
        );

        return (
          <>
            {/* 1-qator: orqaga, nom, bosqichlar, asosiy amal (o'ngda) */}
            <div className="mx-4 mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <button type="button" className="icon-btn -ml-2" onClick={onBack} aria-label="Postavkalarga qaytish" title="Postavkalar">
                <Icon n="back" />
              </button>
              <h2 className="m-0 min-w-0 text-lg font-bold desk:text-xl">{sp.name || sid}</h2>
              <ol className="m-0 flex max-sm:hidden list-none flex-wrap items-center gap-1 p-0 text-[13px]" aria-label="Bosqichlar">
                {STEPS.map((x, i) => (
                  <li key={x} className={`inline-flex items-center gap-1 ${i + 1 <= d.step ? "text-fg" : "text-hint"}`} aria-current={i + 1 === d.step ? "step" : undefined}>
                    {i ? (
                      <span className="px-0.5 text-hint" aria-hidden>
                        ›
                      </span>
                    ) : null}
                    <span className={`grid size-[18px] place-items-center rounded-full text-[11px] font-bold tabular-nums ${i + 1 < d.step ? "bg-st-done text-white" : i + 1 === d.step ? "bg-st-new text-white" : "bg-fill"}`}>
                      {i + 1 < d.step ? "✓" : i + 1}
                    </span>
                    <span className={i + 1 === d.step ? "font-semibold" : ""}>{x}</span>
                  </li>
                ))}
              </ol>
              {!wide ? null : closed ? (
                <button type="button" className="b pri ml-auto" onClick={qr}>
                  <Icon n="printer" /> Yetkazma QR kodi
                </button>
              ) : (
                <button type="button" className="b pri ml-auto" title="Buyurtmalar yig'ilib, yuk joylariga QR yopishtirilgach" onClick={deliver}>
                  <Icon n="send" /> Topshirish
                </button>
              )}
            </div>
            <div className="mx-4 flex flex-wrap items-center gap-x-1.5 text-[13px] text-hint">
              {wide ? null : (
                <span className={`inline-flex items-center gap-1 font-semibold ${closed ? "text-ok" : "text-fg"}`}>
                  <span className={`grid size-[18px] place-items-center rounded-full text-[11px] font-bold text-white ${closed ? "bg-st-done" : "bg-st-new"}`}>{closed ? "✓" : d.step}</span>
                  {STEPS[d.step - 1]} ·
                </span>
              )}
              <span className="code">{sid}</span> · {rs.length} buyurtma
              {wide ? ` · Мой склад · ${dt(sp.createdAt)} dan` : ""}
            </div>

            {/* 2-qator: chop etish | yuk joylari (boshqaruv + qutilar) */}
            <div className="mx-4 mt-2 flex flex-wrap items-center gap-2">
              <button type="button" className="b" title="Omborda bir yurishda olish uchun — tovar bo'yicha" onClick={() => printWin(`Tanlanma ro'yxati — ${sp.name || sid}`, pickingHtml(sp.name || sid, rs.length, d.picking))}>
                <Icon n="list" /> Tanlanma
              </button>
              <button type="button" className="b" title="Buyurtma stikerlari 58×40" aria-label={`Stikerlar · ${rs.length}`} onClick={stickers}>
                <Icon n="printer" /> {wide ? "Stikerlar · " : ""}
                {rs.length}
              </button>
              {closed ? null : (
                <>
                  <span className="mx-1 h-6 w-px bg-sep max-sm:hidden" aria-hidden />
                  <span className="inline-flex items-center gap-2">
                    <label htmlFor="mk-boxn" className="text-sm text-sub max-sm:sr-only" title="1 quti = 1 yuk joyi, har qutiga kamida 2 buyurtma; QR — qutiga, buyurtmaga emas">
                      Yuk joyi
                    </label>
                    <input id="mk-boxn" className="inp w-12 text-center tabular-nums" inputMode="numeric" aria-label="Nechta quti" value={boxN} onChange={(e) => setBoxN(e.target.value.replace(/\D/g, ""))} />
                    <button type="button" className="b" onClick={addBoxes} aria-label="Yuk joyi qo'shish" title="Qo'shish">
                      <Icon n="plus" />
                      {wide ? null : "Quti"}
                    </button>
                  </span>
                  {d.boxes.length > 1 ? (
                    <button type="button" className="b" onClick={printBoxes(d.boxes.map((x) => x.id))} title="Hamma yuk joylari QR-kodlari">
                      <Icon n="printer" /> QR · {d.boxes.length}
                    </button>
                  ) : null}
                  {d.boxes.map((x) => (
                    <span key={x.id} className="inline-flex h-[34px] items-center gap-1.5 rounded-lg bg-sec pl-2.5 coarse:min-h-11">
                      <span className="code">{x.id}</span>
                      <span className="text-[12.5px] text-hint" title={`${x.orders.length} buyurtma`}>
                        · {x.orders.length}
                      </span>
                      <button type="button" className="mini !bg-transparent !px-2" onClick={printBoxes([x.id])} aria-label={`${x.id} QR chop etish`}>
                        QR
                      </button>
                      <button type="button" className="icon-btn -ml-1 !size-[30px] text-danger coarse:!size-11" aria-label={`${x.id} o'chirish`} title="O'chirish" onClick={delBox(x.id)}>
                        <Icon n="x" />
                      </button>
                    </span>
                  ))}
                </>
              )}
            </div>

            <Sh
              t={`Buyurtmalar · ${rs.length}`}
              r={
                !rs.length ? null : wide ? (
                  `yig'ildi ${done}/${rs.length}`
                ) : (
                  <button type="button" className={`${LINK_BTN} text-[13px]`} onClick={() => setSel(all ? [] : rs.map((o) => o.ext_id))}>
                    {all ? "Tanlovni tozalash" : "Hammasini tanlash"}
                  </button>
                )
              }
            />
            {/* tanlanganlar paneli — ro'yxat ustida yopishqoq */}
            {picked.length ? (
              <div className="sticky top-0 z-10 mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-sec px-3 py-2 shadow-[0_0_0_6px_var(--page)]" role="toolbar" aria-label="Tanlanganlar bilan">
                <span className="text-sm font-semibold tabular-nums">{picked.length} ta tanlandi</span>
                <button type="button" className="b" onClick={selStickers}>
                  <Icon n="printer" /> Stiker
                </button>
                {closed ? null : (
                  <>
                    <button type="button" className="b" onClick={selMove}>
                      <Icon n="swap" /> Boshqa postavkaga
                    </button>
                    <button type="button" className="b danger" onClick={selCancel}>
                      <Icon n="x" /> Bekor qilish
                    </button>
                  </>
                )}
                <button type="button" className="icon-btn ml-auto" aria-label="Tanlovni tozalash" title="Tanlovni tozalash" onClick={() => setSel([])}>
                  <Icon n="x" />
                </button>
              </div>
            ) : null}
            {wide ? (
              <Tbl
                label="Postavka buyurtmalari"
                rows={rs}
                rowKey={(o) => o.ext_id}
                onRow={setOpen}
                cols={[
                  {
                    h: <input type="checkbox" className="ck" aria-label="Hammasini tanlash" checked={all} onChange={() => setSel(all ? [] : rs.map((o) => o.ext_id))} />,
                    f: ck,
                    w: "40px",
                  },
                  {
                    h: "Vazifa",
                    f: (o) => (
                      <>
                        <span className="code">{o.ext_id}</span>
                        <div className="t2">{dt(o.ordered)} dan</div>
                      </>
                    ),
                    w: "150px",
                  },
                  { h: "Tovar", f: title },
                  { h: "Narx", f: sold, n: true },
                  {
                    h: "Yig'ildi",
                    f: (o) => (o.assembled_at ? <span className="text-ok">✓</span> : <span className="code">{`${o.picked.length}/${o.need || 1}`}</span>),
                    n: true,
                  },
                ]}
              />
            ) : (
              <List>
                {rs.map((o) => (
                  <Row
                    key={o.ext_id}
                    lead={
                      <span className="flex flex-none items-center gap-2">
                        <label className="grid size-11 -ml-2 place-items-center" onClick={(e) => e.stopPropagation()}>
                          {ck(o)}
                        </label>
                        <Thumb o={o} />
                      </span>
                    }
                    t={firstTitle(o)}
                    tcls="wrap2"
                    s={
                      <>
                        <span className="code mut">{o.ext_id}</span> · {sold(o)}
                      </>
                    }
                    val={<span className={`code ${o.assembled_at ? "text-ok" : ""}`}>{o.assembled_at ? "✓" : `${o.picked.length}/${o.need || 1}`}</span>}
                    onClick={() => setOpen(o)}
                  />
                ))}
              </List>
            )}
            {wide ? null : closed ? <MainButton text="Yetkazma QR kodi" onClick={qr} /> : <MainButton text="Yetkazib berishga topshirish" onClick={deliver} />}
            {open ? <OrderSheet o={{ ...open, stage: closed ? open.stage : "assembly" }} onClose={() => setOpen(null)} onChanged={again} /> : null}
          </>
        );
      }}
    </Loaded>
  );
}
