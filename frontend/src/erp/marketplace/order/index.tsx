// Buyurtma oynasi — yig'ish: tovar qatorlari (skanerlangan/kerak), skaner maydoni (noto'g'ri tovar — qizil signal),
// kanal amallari: Uzum tasdiqlash, Ozon "yig'ildi", WB postavkaga qo'shish, stiker, qaytadan, bekor qilish.
import { useRef, useState } from "react";

import { beep, confirm, etg, scanQR, toast } from "@/erp/kit/env";
import { num } from "@/erp/kit/fmt";
import { List, Row, Sf, Sh, Sheet } from "@/erp/kit/ui";
import { api, P, post } from "@/erp/marketplace/api";
import { useMk } from "@/erp/marketplace/context";
import { CHN, isActive, leftText, STG, STG_ST, type Order, type Supply } from "@/erp/marketplace/lib";
import { esc, printWin } from "@/erp/marketplace/print";

type ScanRes = { ok: boolean; line: number; picked: number; need: number; done: boolean };

export function OrderSheet({ o, onClose, onChanged }: { o: Order; onClose: () => void; onChanged: () => void }) {
  const { choose, ask, touched } = useMk();
  const [picked, setPicked] = useState(() => o.lines.map((_, i) => o.picked.filter((p) => p.line === i).length));
  const [bad, setBad] = useState("");
  const inp = useRef<HTMLInputElement>(null);
  const act = isActive(o.stage);
  const scanning = act && o.need > 0 && !o.assembled_at;
  const ch = o.channel;

  const changed = () => {
    touched();
    onChanged();
  };
  const run = (fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  const scan = async (code: string) => {
    if (!code) return;
    try {
      const r = await post<ScanRes>(`${P}/orders/${ch}/${encodeURIComponent(o.ext_id)}/scan`, { code });
      beep(true);
      setBad("");
      setPicked((p) => p.map((v, i) => (i === r.line ? v + 1 : v)));
      if (r.done) {
        toast("Buyurtma yig'ildi ✓");
        changed();
        onClose();
      }
    } catch (e) {
      beep(false);
      setBad((e as Error).message);
    }
    if (inp.current) {
      inp.current.value = "";
      inp.current.focus();
    }
  };

  const toSupply = run(async () => {
    const ss = await api<Supply[]>(`${P}/wb/supplies`);
    if (!ss.length) return toast("Ochiq postavka yo'q — avval yarating", "bad");
    const sid = ss.length === 1 ? ss[0].id : await choose("Qaysi postavka?", ss.map((x) => ({ value: x.id, label: x.name || x.id, sub: x.id })));
    if (!sid) return;
    await post(`${P}/wb/supplies/${encodeURIComponent(sid)}/add`, { orders: [o.ext_id] });
    toast("Postavkaga qo'shildi");
    changed();
    onClose();
  });
  const label = run(async () => {
    if (ch === "wb") {
      toast("Stiker tayyorlanmoqda…", "info");
      const r = await post<{ stickers: { file: string }[] }>(`${P}/wb/stickers`, { orders: [o.ext_id] });
      printWin("Stiker", r.stickers.map((x) => `<div class="st"><img src="data:image/png;base64,${esc(x.file)}"></div>`).join(""), true);
      return;
    }
    // Ozon/Uzum — PDF/PNG fayl (backend /label); demo'da kanal yo'q
    await api(`${P}/orders/${ch}/${encodeURIComponent(o.ext_id)}/label`);
  });
  const reset = run(async () => {
    await post(`${P}/orders/${ch}/${encodeURIComponent(o.ext_id)}/reset`);
    toast("Skanerlash qaytadan boshlandi");
    setPicked(o.lines.map(() => 0));
    changed();
  });
  const cancel = run(async () => {
    const why = await ask("Bekor qilish sababi", { placeholder: "masalan: tovar tugagan", ok: "Davom etish" });
    if (why === null) return;
    if (!(await confirm(`${CHN[ch]}: ${o.ext_id} bekor qilinsinmi? Reytingga ta'sir qiladi, qaytarib bo'lmaydi.`))) return;
    await post(`${P}/orders/${ch}/${encodeURIComponent(o.ext_id)}/cancel`, { reason: why });
    toast("Bekor qilindi");
    changed();
    onClose();
  });
  const uzumConfirm = run(async () => {
    await post(`${P}/orders/uzum/${encodeURIComponent(o.ext_id)}/confirm`);
    toast("Uzum'da tasdiqlandi");
    changed();
    onClose();
  });
  const ozonShip = run(async () => {
    const r = await post<{ note?: string }>(`${P}/orders/ozon/${encodeURIComponent(o.ext_id)}/ship`);
    toast(r.note || "Ozon'ga bildirildi");
    changed();
    onClose();
  });

  const pickedAll = picked.reduce((a, b) => a + b, 0);
  return (
    <Sheet title={`${CHN[ch]} · ${o.ext_id}`} onClose={onClose}>
      <List>
        {o.lines.map((l, i) => (
          <Row
            key={i}
            icon="package"
            color="orange"
            t={l.title || l.key}
            tcls="wrap2"
            s={
              <>
                {l.vendor_code ? <span className="code mut">{l.vendor_code}</span> : null}
                {l.width_mm ? ` · ${num(l.width_mm)} mm` : ""}
                {` · ${(l.codes ?? []).join(", ") || "shtrixkod yo'q"}`}
              </>
            }
            val={
              <span className={`code ${picked[i] >= l.qty ? "text-ok" : ""}`}>
                {picked[i]}/{l.qty}
              </span>
            }
          />
        ))}
      </List>
      <Sh t="Holat" />
      <List>
        <Row
          t={<span className={`st ${STG_ST[o.stage]}`}>{STG[o.stage]}</span>}
          s={[o.ext_status, o.supply_id, o.number && `ERP ${o.number}`, o.deadline && act ? leftText(o.left_min) : null].filter(Boolean).join(" · ")}
        />
      </List>
      {scanning ? (
        <>
          <Sh t="Skanerlash" r={`${pickedAll}/${o.need}`} />
          <div className="list">
            <div className="field col">
              <input
                ref={inp}
                className={`font-code !text-lg tracking-[.5px] ${bad ? "text-danger" : ""}`}
                placeholder="Skaner bilan o'qing yoki kiriting"
                autoComplete="off"
                enterKeyHint="go"
                aria-label="Shtrixkod"
                aria-invalid={!!bad}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void scan(e.currentTarget.value.trim());
                  }
                }}
              />
            </div>
          </div>
          {bad ? (
            <div className="mx-4 mt-2 rounded-[10px] bg-danger/12 px-3 py-2.5 text-sm font-semibold text-danger" role="alert">
              {bad}
            </div>
          ) : (
            <Sf>Har qadoqni skanerlang — tizim kutilgan tovar bilan solishtiradi. Noto&apos;g&apos;ri tovar — qizil signal.</Sf>
          )}
        </>
      ) : null}
      <div style={{ height: 14 }} />
      <List>
        {scanning && etg() ? <Row icon="scan" color="blue" t="Kamera bilan skanerlash" tap onClick={() => scanQR((v) => void scan(String(v).trim()))} /> : null}
        {ch === "uzum" && (o.ext_status ?? "").toUpperCase() === "CREATED" ? (
          <Row icon="check" color="green" t="Uzum'da tasdiqlash" s="Muddatgacha — aks holda bekor + jarima" tap onClick={uzumConfirm} />
        ) : null}
        {ch === "wb" && o.stage === "new" ? <Row icon="truck" color="purple" t="Postavkaga qo'shish" tap onClick={toSupply} /> : null}
        {ch === "ozon" && o.stage === "new" ? <Row icon="check" color="green" t="Yig'ildi — Ozon'ga bildirish" s="Keyin etiketka beriladi" tap onClick={ozonShip} /> : null}
        {act ? <Row icon="printer" color="purple" t="Stiker / etiketka (58×40)" tap onClick={label} /> : null}
        {act && o.need && pickedAll ? <Row icon="refresh" color="gray" t="Skanerlashni qaytadan boshlash" tap onClick={reset} /> : null}
        {act ? <Row icon="trash" color="red" t="Buyurtmani bekor qilish" tcls="danger" s="Reytingga ta'sir qiladi" tap onClick={cancel} /> : null}
      </List>
    </Sheet>
  );
}

