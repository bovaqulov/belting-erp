// Buyurtma oynasi — yig'ish: holat bir qatorda, tovar (katta rasm, artikul, shtrixkod, yig'ildi/kerak), skaner maydoni
// va progress (noto'g'ri tovar — qizil signal). Amallar: kanal asosiy amali (Uzum tasdiqlash, Ozon "yig'ildi", WB postavkaga),
// stiker, qaytadan; bekor qilish — alohida, pastda (adashib bosilmasin).
import { useRef, useState } from "react";

import { beep, confirm, etg, scanQR, toast } from "@/erp/kit/env";
import { num } from "@/erp/kit/fmt";
import { Icon, Sheet } from "@/erp/kit/ui";
import { api, P, post } from "@/erp/marketplace/api";
import { useMk } from "@/erp/marketplace/context";
import { CHN, isActive, leftText, STG, STG_ST, type Order, type Supply } from "@/erp/marketplace/lib";
import { esc, printWin } from "@/erp/marketplace/print";
import { Photo } from "@/erp/marketplace/thumb";

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
  const need = o.need || o.lines.reduce((a, l) => a + (Number(l.qty) || 1), 0);
  const meta = [o.supply_id, o.ext_status, o.number && `ERP ${o.number}`].filter(Boolean).join(" · ");
  // kanalning asosiy amali (bitta, ko'zga tashlanadigan)
  const primary =
    ch === "uzum" && (o.ext_status ?? "").toUpperCase() === "CREATED"
      ? { t: "Uzum'da tasdiqlash", icon: "check", tip: "Muddatgacha — aks holda bekor + jarima", fn: uzumConfirm }
      : ch === "wb" && o.stage === "new"
        ? { t: "Postavkaga qo'shish", icon: "truck", tip: "", fn: toSupply }
        : ch === "ozon" && o.stage === "new"
          ? { t: "Yig'ildi — Ozon'ga bildirish", icon: "check", tip: "Keyin etiketka beriladi", fn: ozonShip }
          : null;
  return (
    <Sheet title={`${CHN[ch]} · ${o.ext_id}`} onClose={onClose}>
      {/* holat — bitta qator */}
      <div className="mx-4 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-hint">
        <span className={`st ${STG_ST[o.stage]}`}>{STG[o.stage]}</span>
        {o.deadline && act ? <span className={(o.left_min ?? 0) < 60 ? "font-semibold text-danger" : ""}>{leftText(o.left_min)}</span> : null}
        {meta ? <span className="code min-w-0 truncate">{meta}</span> : null}
      </div>

      {/* tovar(lar): rasm — oynaning yarmi, yonida nom, artikul, shtrixkod, yig'ildi/kerak */}
      {o.lines.map((l, i) => {
        const full = picked[i] >= l.qty;
        return (
          <div key={i} className="mx-4 mb-2 grid grid-cols-2 items-start gap-3 rounded-xl bg-sec p-3">
            <Photo src={l.photo} />
            <div className="flex min-w-0 flex-col gap-1.5 self-stretch">
              <div className="text-[15px] leading-snug font-medium">{l.title || l.key}</div>
              {l.vendor_code ? <div className="code text-sm">{l.vendor_code}</div> : null}
              {l.width_mm ? <div className="text-sm text-sub">{num(l.width_mm)} mm</div> : null}
              <div className="text-[13px] break-all">
                {(l.codes ?? []).length ? <span className="code mut">{(l.codes ?? []).join(", ")}</span> : <span className="text-danger">shtrixkod yo&apos;q</span>}
              </div>
              <span className={`code mt-auto text-3xl font-bold tabular-nums ${full ? "text-ok" : ""}`} aria-label={`yig'ildi ${picked[i]} / ${l.qty}`}>
                {full ? "✓ " : ""}
                {picked[i]}/{l.qty}
              </span>
            </div>
          </div>
        );
      })}

      {/* skanerlash — asosiy ish */}
      {scanning ? (
        <div className="mx-4 mt-3">
          <div className="flex items-center gap-2">
            <input
              ref={inp}
              className={`inp h-12 min-w-0 flex-1 font-code !text-lg tracking-[.5px] ${bad ? "border-danger text-danger" : ""}`}
              placeholder="Shtrixkodni skanerlang"
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
            {etg() ? (
              <button type="button" className="b h-12 w-12 !px-0" aria-label="Kamera bilan skanerlash" onClick={() => scanQR((v) => void scan(String(v).trim()))}>
                <Icon n="scan" />
              </button>
            ) : null}
            <span className="flex-none text-sm text-hint tabular-nums">
              {pickedAll}/{need}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden>
            <div className="h-full rounded-full bg-st-done transition-[width]" style={{ width: `${need ? Math.min(100, (pickedAll / need) * 100) : 0}%` }} />
          </div>
          {bad ? (
            <div className="mt-2 rounded-[10px] bg-danger/12 px-3 py-2.5 text-sm font-semibold text-danger" role="alert">
              {bad}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* amallar: asosiy — to'liq kenglikda; qolganlari — bitta qator */}
      {act ? (
        <div className="mx-4 mt-4 flex flex-col gap-2">
          {primary ? (
            <button type="button" className="b pri h-11 w-full" title={primary.tip || undefined} onClick={primary.fn}>
              <Icon n={primary.icon} /> {primary.t}
            </button>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="b flex-1" onClick={label}>
              <Icon n="printer" /> Stiker 58×40
            </button>
            {o.need && pickedAll ? (
              <button type="button" className="b flex-1" onClick={reset}>
                <Icon n="refresh" /> Qaytadan skanerlash
              </button>
            ) : null}
          </div>
          {/* xavfli amal — alohida, kichik, adashib bosilmasin */}
          <button type="button" className="mt-2 cursor-pointer self-center border-0 bg-transparent p-2 text-sm text-danger coarse:min-h-11" onClick={cancel}>
            Buyurtmani bekor qilish
          </button>
        </div>
      ) : null}
    </Sheet>
  );
}
