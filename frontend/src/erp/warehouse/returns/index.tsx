"use client";
// Mijozdan qaytarish (RMA): jo'natish hujjatini topish (raqam, mijoz yoki jo'natilgan birlik QR) → qaytgan qatorlar
// (miqdor jo'natilgandan oshmaydi) va holati: yaroqli — joylash navbatiga, brak — karantin joyiga → sabab → hujjat (QT-…).
import { useRef, useState } from "react";

import { beep, hap, toast } from "@/erp/kit/env";
import { dnum, num, un } from "@/erp/kit/fmt";
import { Loaded, MainButton, useLoad } from "@/erp/kit/ui";
import { api, post } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import { EPS, type ReturnRes, type Sale, type SaleLine } from "@/erp/warehouse/lib";
import { ScanBar, useScanMsg, useScanner } from "@/erp/warehouse/scan-bar";

import { RetDoneView, RetFindView, RetSaleView, type RetLine } from "./ui";

const REASONS = ["Noto'g'ri tovar yoki o'lcham", "Nuqson (brak)", "Ortiqcha yuborilgan", "Mijoz voz kechdi", "Boshqa"];

export function Returns({ onBack }: { onBack: () => void }) {
  const [sale, setSale] = useState<Sale | null>(null);
  const [done, setDone] = useState<ReturnRes | null>(null);
  if (done) return <RetDoneView r={done} onBack={onBack} />;
  if (sale) return <SaleRet sale={sale} onBack={() => setSale(null)} onDone={setDone} />;
  return <Find onPick={setSale} onBack={onBack} />;
}

function Find({ onPick, onBack }: { onPick: (s: Sale) => void; onBack: () => void }) {
  const [q, setQ] = useState("");
  const st = useLoad(() => api<Sale[]>(`/app/api/erp/sales?q=${encodeURIComponent(q)}`), [q]);
  const m = useScanMsg();
  const sc = useScanner(async (code) => {
    const rs = await api<Sale[]>(`/app/api/erp/sales?q=${encodeURIComponent(code)}`);
    if (rs.length === 1) {
      beep(true);
      return onPick(rs[0]);
    }
    setQ(code);
    beep(rs.length > 0);
    m.say(rs.length > 0, rs.length ? `${rs.length} ta jo'natish topildi` : "Jo'natish topilmadi", code);
  }, m);
  return (
    <Loaded st={st}>
      {(rs) => (
        <RetFindView
          bar={<ScanBar sc={sc} ph="Birlik QR, jo'natish raqami yoki mijoz" />}
          q={q}
          rs={rs}
          onClear={() => setQ("")}
          onPick={onPick}
          onBack={onBack}
        />
      )}
    </Loaded>
  );
}

function SaleRet({ sale, onBack, onDone }: { sale: Sale; onBack: () => void; onDone: (r: ReturnRes) => void }) {
  const { wide, stores, whName, choose, ask } = useWh();
  const [wh, setWh] = useState(stores.some((x) => x.id === sale.warehouse_id) ? sale.warehouse_id : stores[0]?.id);
  const [sel, setSelS] = useState<RetLine[]>([]);
  const ref = useRef(sel);
  const setSel = (x: RetLine[]) => {
    ref.current = x;
    setSelS(x);
  };
  const left = (l: SaleLine) => Math.max(0, l.qty - l.returned);

  /** qatorni belgilash: miqdor (o'lchamli/kodli birlik — butun) va holati */
  const take = async (l: SaleLine) => {
    const max = left(l);
    if (max <= EPS) return toast("Bu qator to'liq qaytarilgan", "bad");
    let q = max;
    if (!l.batch_id && max > 1) {
      const v = await ask(l.name, { label: `Nechta qaytdi? (ko'pi bilan ${num(max, 3)} ${un(l.unit)})`, value: String(max), ok: "Keyingi" });
      if (v === null) return;
      q = Number(dnum(v));
      if (!(q > 0) || q > max + EPS) return toast(`Ko'pi bilan ${num(max, 3)}`, "bad");
    }
    const g = await choose<"ok" | "defect">(`${l.name} — holati`, [
      { value: "ok", label: "Yaroqli", sub: "Qayta sotiladi — joylash navbatiga", icon: "check", color: "green" },
      { value: "defect", label: "Brak / shikastlangan", sub: "Karantin joyiga — tekshiruvdan keyin qaror", icon: "alert", color: "red" },
    ]);
    if (!g) return;
    setSel([...ref.current.filter((x) => x.line !== l.line), { line: l.line, name: l.name, code: l.code, unit: l.unit, qty: q, grade: g }]);
    hap.ok();
  };

  const m = useScanMsg();
  const sc = useScanner(async (code) => {
    const l = sale.lines.find((x) => x.code?.toLowerCase() === code.trim().toLowerCase());
    if (!l) {
      beep(false);
      return m.say(false, "Bu birlik shu jo'natishda yo'q", code);
    }
    beep(true);
    await take(l);
  }, m);

  const submit = async () => {
    const why = await choose("Qaytarish sababi", REASONS.map((x) => ({ value: x, label: x })));
    if (!why) return;
    const note = await ask("Izoh", { label: why === "Boshqa" ? "Sababni yozing (majburiy)" : "Qo'shimcha izoh (ixtiyoriy)", ok: "Qabul qilish" });
    if (note === null || (why === "Boshqa" && !note.trim())) return;
    try {
      const r = await post<ReturnRes>("/app/api/erp/returns", {
        sale_id: sale.id,
        warehouse_id: wh,
        reason: note.trim() ? `${why}: ${note.trim()}` : why,
        lines: ref.current.map((x) => ({ line: x.line, qty: String(x.qty), grade: x.grade })),
      });
      beep(true);
      onDone(r);
    } catch (e) {
      beep(false);
      m.say(false, (e as Error).message);
    }
  };

  return (
    <>
      <RetSaleView
        wide={wide}
        sale={sale}
        bar={<ScanBar sc={sc} ph="Qaytgan birlik QR'ini skanerlang" />}
        wh={whName(wh)}
        sel={sel}
        left={left}
        onWh={async () => {
          const w = await choose("Qaysi omborga qaytadi", stores.map((x) => ({ value: x.id, label: x.name })));
          if (w) setWh(w);
        }}
        onLine={(l) => void take(l)}
        onRemove={(line) => setSel(ref.current.filter((x) => x.line !== line))}
        onBack={onBack}
      />
      {sel.length ? <MainButton text={`Qaytarishni qabul qilish · ${sel.length}`} onClick={submit} /> : null}
    </>
  );
}
