"use client";
// Material sarfi: oddiy material — miqdor (mavjuddan oshmasin); lenta (m²) — bo'lak eni × uzunligi, qoldiq backend'da
// avtomatik hisoblanadi (300ms kechikish, eski javob kalit bilan tashlanadi); ishchi xato deb bilsa — qoldiqni o'lchab kiritadi.
import { useEffect, useState } from "react";

import { beep, post, toast } from "@/erp/kit/env";
import { dnum, num } from "@/erp/kit/fmt";
import { pos, type CutPreview, type Dim, type Take, type TakeBody } from "@/erp/workshop/lib";

import { TakeSheetView } from "./ui";

export function TakeSheet({
  t,
  extra = "",
  send,
  onClose,
}: {
  t: Take;
  extra?: string;
  send: (bid: number, body: TakeBody) => Promise<void>;
  onClose: () => void;
}) {
  const { u, have, p } = t;
  const wl = u.unit === "m2";
  const def = p
    ? Math.min(Number(p.left) || have, have)
    : u.unit === "dona"
      ? 1
      : have;
  const [q, setQ] = useState(String(def));
  const [w, setW] = useState(u.width_mm ? String(u.width_mm) : "");
  const [l, setL] = useState("");
  const [manual, setManual] = useState(false);
  const [rests, setRests] = useState<Dim[]>([]);
  // avtomatik qoldiq: o'lcham kiritilgach (300 ms) backend giliotina hisobi; eski javob yangisini bosmasin — kalit bilan
  const key = wl && pos(w) && pos(l) ? `${dnum(w)}x${dnum(l)}` : "";
  const [pv, setPv] = useState<{ key: string; r?: CutPreview; err?: string } | null>(null);
  useEffect(() => {
    if (!key) return;
    const [kw, kl] = key.split("x");
    const tm = setTimeout(() => {
      post<CutPreview>("/app/api/erp/shop/cut-preview", { batch_id: u.id, width_mm: kw, length_mm: kl }).then(
        (r) => setPv({ key, r }),
        (e: Error) => setPv({ key, err: e.message }),
      );
    }, 300);
    return () => clearTimeout(tm);
  }, [key, u.id]);
  const cur = pv && pv.key === key ? pv : null;

  const done = async () => {
    if (wl) {
      if (!key) {
        toast("Bo'lak eni va uzunligini (mm) kiriting", "bad");
        return false;
      }
      if (manual && rests.some((r) => !pos(r.width_mm) || !pos(r.length_mm))) {
        toast("Har qoldiqning eni va uzunligini kiriting", "bad");
        return false;
      }
      const d = { width_mm: dnum(w), length_mm: dnum(l) };
      const rs = rests.map((r) => ({ width_mm: dnum(r.width_mm), length_mm: dnum(r.length_mm) }));
      await send(u.id, manual ? { ...d, rests: rs } : d);
    } else {
      const v = dnum(q);
      if (!(Number(v) > 0) || Number(v) > have) {
        toast(`0 dan katta va ${num(have, 3)} dan oshmasin`, "bad");
        return false;
      }
      await send(u.id, { qty: v });
    }
    beep(true);
  };

  return (
    <TakeSheetView
      t={t}
      extra={extra}
      q={q}
      w={w}
      l={l}
      manual={manual}
      rests={rests}
      cur={cur}
      onQ={setQ}
      onW={setW}
      onL={setL}
      onManual={() => {
        const on = !manual;
        setManual(on);
        // o'lchashni avtomatik hisobdan boshlash qulay: ishchi faqat farqini tuzatadi
        if (on && !rests.length && cur?.r) setRests(cur.r.rests.map(({ width_mm, length_mm }) => ({ width_mm, length_mm })));
      }}
      onRests={setRests}
      onClose={onClose}
      onDone={done}
    />
  );
}
