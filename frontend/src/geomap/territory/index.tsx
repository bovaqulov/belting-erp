"use client";
// Hududlar: chizilgan / radius hududni saqlash, avtomatik muvozanatli hududlar (/territories/auto/preview → save, almashtirish
// tasdiq bilan), fayldan import, rang/mas'ul (faqat hududlar qayta yuklanadi), o'chirish. Bir vaqtda bitta amal (doing).
import { useState } from "react";

import { api } from "@/geomap/lib/api";
import { num } from "@/geomap/lib/fields";
import { confirmDo } from "@/geomap/lib/tg";
import type { Territory } from "@/geomap/lib/types";

import { fileToGeoJSON, type AutoT } from "./territory.lib";
import { TerritoryView, type AutoOpts, type Props } from "./ui";

export type { Nearby, Prospect, Tool } from "./territory.lib";

export default function TerritoryPanel(p: Props) {
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [doing, setDoing] = useState<string | null>(null); // qaysi amal ketmoqda (tugma yozuvi shunga qarab)
  const [auto, setAuto] = useState<AutoOpts>({
    count: 4, balance: "count", base: "hex", onlyFiltered: false, regions: [],
  });
  const [preview, setPreview] = useState<{ items: AutoT[]; used: number; skipped: number } | null>(null);

  const run = async (what: string, fn: () => Promise<void>) => {
    if (doing !== null) return; // ikki marta yuborilmasin
    setDoing(what);
    try {
      await fn();
    } catch (e) {
      p.onToast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setDoing(null);
    }
  };

  const saveDrawn = () => run("save", async () => {
    if (!p.drawn) return;
    await api("/territories", { body: { kind: "draw", name: name || undefined, geometry: p.drawn, owner: owner || null } });
    setName("");
    p.clearDrawn();
    await p.onReload();
    p.onToast("Hudud saqlandi");
  });
  const saveRadius = () => run("save", async () => {
    const c = p.tool?.kind === "radius" ? p.tool.center : undefined;
    if (!c) return;
    await api("/territories", { body: { kind: "radius", name: name || `${p.radiusKm} km radius`, center: { lng: c[0], lat: c[1] }, radius: p.radiusKm * 1000, owner: owner || null } });
    setName("");
    p.setTool(null);
    await p.onReload();
    p.onToast("Radius saqlandi");
  });
  const doPreview = () => run("preview", async () => {
    const res = await api<{ territories: AutoT[]; used: number; skipped: number }>("/territories/auto/preview", {
      body: { count: auto.count, balance: auto.balance, base: auto.base, regions: auto.regions, ids: auto.onlyFiltered ? p.filteredIds : undefined },
    });
    setPreview({ items: res.territories, used: res.used, skipped: res.skipped });
    if (!res.territories.length) {
      p.onPreview(null);
      return;
    }
    p.onPreview({ type: "FeatureCollection", features: res.territories.map((t) => ({ type: "Feature", properties: { name: `${t.name} · ${t.pct}%`, color: t.color }, geometry: t.geometry })) });
  });
  const hasAuto = p.territories.some((t) => t.kind === "auto");
  const saveAuto = async (replace: boolean) => {
    if (!preview) return;
    if (replace && hasAuto && !(await confirmDo("Avvalgi avtomatik hududlarning hammasi o'chiriladi va yangisi bilan almashtiriladi. Davom etasizmi?"))) return;
    await run(replace ? "auto-replace" : "auto-add", () => saveAutoNow(replace));
  };
  const saveAutoNow = async (replace: boolean) => {
    if (!preview) return;
    await api("/territories/auto/save", { body: { territories: preview.items, replace, balance: auto.balance, base: auto.base } });
    setPreview(null);
    p.onPreview(null);
    await p.onReload();
    p.onToast("Avtomatik hududlar saqlandi");
  };
  const importFile = (f: File) => run("import", async () => {
    const fc = await fileToGeoJSON(f);
    const r = await api<{ created: number }>("/import", { body: { geojson: fc, name: f.name.replace(/\.[^.]+$/, "") } });
    await p.onReload();
    p.onToast(r.created ? `${r.created} ta hudud import qilindi` : "Faylda poligon topilmadi", !r.created);
  });
  const patchT = (id: number, body: Record<string, unknown>) => run("patch", async () => {
    await api(`/territories/${id}`, { body });
    await p.onReload(false); // rang/mas'ul — mijozlarning hududga tegishliligi o'zgarmaydi
  });
  const delT = async (t: Territory) => {
    if (!(await confirmDo(`"${t.name}" hududi o'chirilsinmi? Undagi ${num(t.n)} ta mijoz hududsiz qoladi.`))) return;
    await run("delete", async () => {
      await api(`/territories/${t.id}`, { method: "DELETE" });
      await p.onReload();
      p.onToast("Hudud o'chirildi");
    });
  };

  return (
    <TerritoryView
      p={p}
      name={name}
      owner={owner}
      doing={doing}
      auto={auto}
      preview={preview}
      onName={setName}
      onOwner={setOwner}
      onSave={() => void (p.drawn ? saveDrawn() : saveRadius())}
      onImport={(f) => void importFile(f)}
      onAuto={setAuto}
      onDoPreview={() => void doPreview()}
      onPreviewOwner={(i, o) => preview && setPreview({ ...preview, items: preview.items.map((x, j) => (j === i ? { ...x, owner: o } : x)) })}
      onSaveAuto={(replace) => void saveAuto(replace)}
      onCancelPreview={() => {
        setPreview(null);
        p.onPreview(null);
      }}
      onPatch={(id, body) => void patchT(id, body)}
      onDelete={(t) => void delT(t)}
    />
  );
}
