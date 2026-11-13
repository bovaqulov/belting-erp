"use client";
// Yig'ish (buyurtma → jo'natish). Har tovar skaner bilan tasdiqlanadi — qo'lda qo'shib bo'lmaydi. Birlik QR — butun
// birlik (kerakdan katta bo'lsa kesish taklif qilinadi). Donali tovar: birinchi skanda soni so'raladi, keyingi har skan +1.
// Noto'g'ri tovar bloklanadi. Yorlig'i yo'q tovar — qatorni bosib stiker chiqariladi. Holat modul darajasida.
import { useRef, useState } from "react";

import { beep, confirm, toast } from "@/erp/kit/env";
import { dnum, num, un } from "@/erp/kit/fmt";
import { Empty, Loaded, MainButton, useLoad } from "@/erp/kit/ui";
import { api, post, queueLabels } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import { useCutUnit } from "@/erp/warehouse/cut";
import { EPS, size, type PickBrief, type PickLine, type PickOrder, type ScanRes } from "@/erp/warehouse/lib";
import { ScanBar, useScanMsg, useScanner } from "@/erp/warehouse/scan-bar";

import { PickDone, PickList, PickOrderView, type Picked } from "./ui";

// bo'limlar orasida o'tganda yig'ilgan narsa yo'qolmasin (sahifa yangilanguncha)
const PK: { order: PickOrder | null; picks: Picked[] } = { order: null, picks: [] };
const keepOrder = (o: PickOrder | null) => {
  PK.order = o;
  PK.picks = [];
};
const keepPicks = (p: Picked[]) => {
  PK.picks = p;
};
const savedPicks = () => PK.picks;
const savedOrder = () => PK.order;

/** Paneldan buyurtma bosilganda: bo'limga o'tishdan oldin buyurtmani yuklab qo'yish (Pick shu bilan ochiladi) */
export async function preparePick(id: number): Promise<void> {
  keepOrder(await api<PickOrder>(`/app/api/erp/picks/${id}`));
}

export function Pick() {
  const { can } = useWh();
  const [order, setOrder] = useState<PickOrder | null>(savedOrder);
  const [done, setDone] = useState<{ number: string; total: number } | null>(null);
  const openId = async (id: number) => {
    try {
      const o = await api<PickOrder>(`/app/api/erp/picks/${id}`);
      keepOrder(o);
      setOrder(o);
      setDone(null);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  if (!can("sale", "create"))
    return (
      <Empty icon="alert" title="Ruxsat yo'q">
        Jo&apos;natish hujjati yaratish huquqi kerak
      </Empty>
    );
  if (done)
    return (
      <PickDone
        number={done.number}
        total={done.total}
        onBack={() => setDone(null)}
      />
    );
  if (order)
    return (
      <Order
        key={order.id}
        o={order}
        onBack={() => {
          keepOrder(null);
          setOrder(null);
        }}
        onShipped={(r) => {
          keepOrder(null);
          setOrder(null);
          setDone(r);
        }}
      />
    );
  return <Queue onOpen={(id) => void openId(id)} />;
}

function Queue({ onOpen }: { onOpen: (id: number) => void }) {
  const { wide } = useWh();
  const st = useLoad(() => api<PickBrief[]>("/app/api/erp/picks"), []);
  return <Loaded st={st}>{(rs) => <PickList wide={wide} rs={rs} onOpen={onOpen} />}</Loaded>;
}

function Order({ o, onBack, onShipped }: { o: PickOrder; onBack: () => void; onShipped: (r: { number: string; total: number }) => void }) {
  const { wide, can, whName, choose, ask } = useWh();
  const cutUnit = useCutUnit();
  const [picks, setPicks] = useState<Picked[]>(savedPicks);
  // skan ishlovchisi (asinxron) eng so'nggi ro'yxatni ko'rsin — ref; render faqat `picks` holatini o'qiydi
  const ref = useRef(picks);
  const upd = (p: Picked[]) => {
    ref.current = p;
    keepPicks(p);
    setPicks(p);
  };
  const got = (ln: PickLine, ps: Picked[]) => ps.filter((p) => p.line_no === ln.line_no).reduce((a, p) => a + p.qty, 0);
  const all = o.lines.every((ln) => got(ln, picks) >= Number(ln.left) - EPS);

  const m = useScanMsg();
  const sc = useScanner(async (code) => {
    const r = await api<ScanRes>(`/app/api/erp/scan?code=${encodeURIComponent(code)}`);
    if (r.type !== "unit" && r.type !== "item") {
      beep(false);
      return m.say(false, r.type === "unknown" ? "Kod topilmadi" : "Tovar yoki birlik kodini skanerlang", code);
    }
    const ln = o.lines.find((x) => x.item_id === r.item_id && (x.dims || (x.char_id || null) === (r.char_id || null)));
    if (!ln) {
      beep(false);
      return m.say(false, "BU TOVAR BUYURTMADA YO'Q", r.name);
    }
    const need = Number(ln.left) - got(ln, ref.current);
    if (need <= EPS) {
      beep(false);
      return m.say(false, "Bu qator to'liq yig'ilgan", ln.name);
    }
    if (r.type === "unit") {
      if (ref.current.some((p) => p.batch_id === r.id)) {
        beep(false);
        return m.say(false, "Bu birlik allaqachon yig'ilgan", r.code);
      }
      const here = r.stock.filter((s) => s.warehouse_id === o.warehouse_id);
      if (!here.length) {
        beep(false);
        return m.say(false, "Birlik bu omborda emas", `${r.code} · ${r.stock.map((s) => s.warehouse).join(", ") || "hisobda yo'q"}`);
      }
      const have = here.reduce((a, s) => a + Number(s.qty), 0);
      if (have > need + EPS) {
        if (!r.dims) {
          upd([...ref.current, { line_no: ln.line_no, batch_id: r.id, qty: need, label: ln.name, sub: `${r.code} dan`, scan: code }]);
          beep(true);
          return m.say(true, `${r.code} dan ${num(need, 3)} ${un(ln.unit)}`, ln.name);
        }
        if (!can("cut", "post")) {
          beep(false);
          return m.say(false, "Birlik kerakdan katta — kesish huquqi yo'q", r.code);
        }
        if (!(await confirm(`${r.code}: ${num(have, 3)} ${un(r.unit)} bor, kerak ${num(need, 3)}. Kesib olaymi?`))) return;
        const w = r.width_mm ? Number(r.width_mm) : 0;
        const p = await cutUnit(r, r.dims === "wl" ? { w: w || "", l: w ? Math.round((need * 1e6) / w) : "" } : { q: need });
        if (!p) return;
        if (p.qty > need + EPS) {
          beep(false);
          return m.say(false, `Kesilgan bo'lak ${num(p.qty, 3)} — buyurtmada ${num(need, 3)}`, "Bo'lak omborda qoldi, kichikroq kesing");
        }
        upd([...ref.current, { line_no: ln.line_no, batch_id: p.piece, qty: p.qty, label: ln.name, sub: `${p.number} bo'lagi`, scan: code }]);
        return m.say(true, `Kesildi va yig'ildi: ${num(p.qty, 3)} ${un(ln.unit)}`, `${p.number} · stikerlar navbatda`);
      }
      upd([...ref.current, { line_no: ln.line_no, batch_id: r.id, qty: have, label: ln.name, sub: [r.code, size(r)].filter(Boolean).join(" · "), scan: code }]);
      beep(true);
      return m.say(true, `${r.code} · ${num(have, 3)} ${un(r.unit)}`, ln.name);
    }
    if (ln.dims) {
      beep(false);
      return m.say(false, "O'lchamli tovar — birlik (rulon/bo'lak) QR'ini skanerlang", ln.name);
    }
    const cur = ref.current.find((x) => x.line_no === ln.line_no && !x.batch_id);
    if (cur) upd(ref.current.map((x) => (x === cur ? { ...x, qty: x.qty + 1 } : x)));
    else {
      // skaner tovarni tasdiqladi; ko'p dona bo'lsa sonini bir marta kiritadi (har donani skanerlash shart emas)
      let n = 1;
      if (need > 1) {
        const v = await ask(ln.name, { label: `Tovar tasdiqlandi. Nechta olindi? (kerak ${num(need, 3)} ${un(ln.unit)})`, value: String(need), ok: "Yig'ish" });
        if (v === null) return;
        n = Number(dnum(v));
        if (!(n > 0)) return;
        if (n > need + EPS) {
          beep(false);
          return m.say(false, `Buyurtmada ${num(need, 3)} qolgan`, ln.name);
        }
      }
      upd([...ref.current, { line_no: ln.line_no, batch_id: null, qty: n, label: ln.name, sub: `skaner: ${code}`, scan: code }]);
    }
    beep(true);
    m.say(true, `${num(got(ln, ref.current), 3)} / ${num(ln.left, 3)}`, ln.name);
  }, m);

  const ship = async () => {
    const partial = o.lines.some((ln) => got(ln, ref.current) < Number(ln.left) - EPS);
    if (partial && !(await confirm("Hammasi yig'ilmagan — qolgani keyingi jo'natishga qoladi. Jo'nataymi?"))) return;
    try {
      const s = await post<{ number: string; total: number }>(`/app/api/erp/picks/${o.id}/ship`, {
        picks: ref.current.map((p) => ({ line_no: p.line_no, batch_id: p.batch_id || null, qty: String(p.qty), scan: p.scan })),
      });
      beep(true);
      onShipped(s);
    } catch (e) {
      beep(false);
      m.say(false, (e as Error).message);
    }
  };

  return (
    <>
      <PickOrderView
        wide={wide}
        o={o}
        wh={whName(o.warehouse_id)}
        bar={<ScanBar sc={sc} ph="Tovar yoki birlik kodini skanerlang" />}
        picks={picks}
        got={(ln) => got(ln, picks)}
        onBack={onBack}
        onRemove={(i) => upd(picks.filter((_, k) => k !== i))}
        onLine={async (ln) => {
          // qo'lda kiritish yo'q: tovar faqat skaner bilan yig'iladi. Bu yerda — qayerdan olish va yorlig'i yo'q bo'lsa stiker
          const us = ln.units;
          const a = await choose(ln.name, [
            ...us.map((u, i) => ({
              value: `u${i}`,
              label: u.code ?? "partiya",
              sub: [u.loc ? `joy ${u.loc}` : "joyi belgilanmagan", `${num(u.qty, 3)} ${un(ln.unit)}`, size(u), u.firm].filter(Boolean).join(" · "),
            })),
            { value: "lbl", label: "Yorliq yo'q — stiker chop etish", sub: us.length ? "Birlik QR stikeri yoki tovar stikeri" : "Tovar stikeri" },
          ]);
          if (a === "lbl") {
            const b = us.find((u) => u.batch_id);
            return void queueLabels(b ? { batch_ids: [b.batch_id!] } : { item_id: ln.item_id, char_id: ln.char_id });
          }
          if (a?.startsWith("u")) {
            const u = us[Number(a.slice(1))];
            if (u.batch_id) void queueLabels({ batch_ids: [u.batch_id] });
          }
        }}
      />
      {picks.length ? <MainButton text={all ? "Jo'natish" : `Qisman jo'natish · ${picks.length}`} onClick={ship} /> : null}
    </>
  );
}
