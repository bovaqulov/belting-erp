"use client";
// Skaner (ma'lumot): rulon/bo'lak QR, joy yorlig'i, tovar shtrixkodi yoki 1C kodi → kartochka. Topilmasa va matn bo'lsa
// (2+ harf) — nom bo'yicha qidiruv. 1C kodi ikki bazada bo'lsa — tanlov.
import { useState } from "react";

import { beep } from "@/erp/kit/env";
import { api } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import type { ItemHit, ScanRes } from "@/erp/warehouse/lib";
import { CellCard, ItemCard, UnitCard, type ItemRef } from "@/erp/warehouse/lookup";
import { ScanBar, useScanMsg, useScanner } from "@/erp/warehouse/scan-bar";

import { LookupView, type Out } from "./ui";

export function LookupScan() {
  const { wide, choose } = useWh();
  const [out, setOut] = useState<{ o: Out; n: number }>({ o: null, n: 0 });
  const show = (o: Out) => setOut((p) => ({ o, n: p.n + 1 }));

  const m = useScanMsg();
  const sc = useScanner(async (code) => {
    const r = await api<ScanRes>(`/app/api/erp/scan?code=${encodeURIComponent(code)}`);
    if (r.type === "unknown" && code.length >= 2 && !/^\d+$/.test(code)) {
      const rs = await api<ItemHit[]>(`/app/api/erp/items?q=${encodeURIComponent(code)}`);
      if (rs.length) {
        beep(true);
        m.say(null, `«${code}» bo'yicha ${rs.length} ta tovar`);
        return show({ k: "list", rs });
      }
    }
    if (r.type === "unknown") {
      beep(false);
      m.say(false, "Kod topilmadi", code);
      return show(null);
    }
    beep(true);
    if (r.type === "unit") {
      m.say(true, r.name);
      return show({ k: "unit", u: r });
    }
    if (r.type === "item") {
      m.say(true, r.name);
      return show({ k: "item", it: r });
    }
    if (r.type === "cell") {
      m.say(true, `Joy ${r.code}`);
      return show({ k: "cell", c: r });
    }
    if (r.type === "choice") {
      m.say(null, "Bu 1C kodi ikki bazada", code);
      const i = await choose(
        "Bu 1C kodi ikki bazada",
        r.options.map((o, k) => ({ value: k, label: o.name, sub: `${o.base} bazasi${o.char ? " · " + o.char : ""}` })),
      );
      if (i !== null) show({ k: "item", it: { ...r.options[i], legacy: r.options[i].base } });
      return;
    }
    m.say(true, r.number);
    show({ k: "doc", number: r.number });
  }, m);

  const card = (o: Out) =>
    !o ? null : o.k === "unit" ? (
      <UnitCard u={o.u} />
    ) : o.k === "item" ? (
      <ItemCard it={o.it} />
    ) : o.k === "cell" ? (
      <CellCard c={o.c} />
    ) : null;

  return (
    <LookupView
      wide={wide}
      out={out.o}
      outKey={out.n}
      bar={<ScanBar sc={sc} ph="Kodni skanerlang yoki yozing" />}
      card={card(out.o)}
      onItem={(it: ItemRef) => show({ k: "item", it })}
    />
  );
}
