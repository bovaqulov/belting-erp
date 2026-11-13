import { money, num } from "@/geomap/lib/fields";
import { SEQ } from "@/geomap/lib/stats";
import type { ColorBy, Layers, Metric, Style } from "@/geomap/lib/types";

import { Field, Section, Seg, Toggle } from "@/geomap/kit";

const METRICS: { v: Metric; label: string }[] = [
  { v: "count", label: "Soni" },
  { v: "sales", label: "Savdo" },
  { v: "debt", label: "Qarz" },
  { v: "deals", label: "Bitimlar" },
];

export const COLOR_BY: { v: ColorBy; label: string }[] = [
  { v: "status", label: "Holat" },
  { v: "owner", label: "Mas'ul" },
  { v: "region", label: "Viloyat" },
  { v: "territory", label: "Hudud" },
  { v: "tag", label: "Teg" },
  { v: "type", label: "Turi" },
  { v: "q", label: "Joy aniqligi" },
  { v: "sales", label: "Savdo (gradient)" },
  { v: "debt", label: "Qarz (gradient)" },
  { v: "none", label: "Bir xil" },
];

export function Legend({ items, scaleBreaks, fmt }: { items?: { label: string; color: string; n: number }[]; scaleBreaks?: number[]; fmt?: (n: number) => string }) {
  if (scaleBreaks && scaleBreaks.length) {
    const f = fmt ?? money;
    return (
      <div className="gm-legend scale">
        {SEQ.slice(0, scaleBreaks.length + 1).map((c, i) => (
          <span key={c}>
            <i style={{ background: c }} />
            {i === 0 ? `≤ ${f(scaleBreaks[0])}` : i === scaleBreaks.length ? `> ${f(scaleBreaks[i - 1])}` : `${f(scaleBreaks[i - 1])}–${f(scaleBreaks[i])}`}
          </span>
        ))}
      </div>
    );
  }
  if (!items?.length) return null;
  return (
    <div className="gm-legend">
      {items.slice(0, 14).map((l, i) => (
        <span key={`${i}:${l.label}`} title={l.label}>
          <i style={{ background: l.color }} />
          <span className="gm-legend-t">{l.label}</span>
          <em>{num(l.n)}</em>
        </span>
      ))}
      {items.length > 14 && <span className="gm-muted">+{items.length - 14}</span>}
    </div>
  );
}

export default function StylePanel({ style, layers, onStyle, onLayers, legend, legendBreaks, full }: {
  style: Style; layers: Layers; onStyle: (s: Style) => void; onLayers: (l: Layers) => void;
  legend: { label: string; color: string; n: number }[]; legendBreaks?: number[]; full: boolean;
}) {
  const gradient = style.colorBy === "sales" || style.colorBy === "debt";
  const colorOpts = full ? COLOR_BY : COLOR_BY.filter((c) => c.v !== "debt");
  const sizeOpts: { v: Style["sizeBy"]; label: string }[] = [{ v: "none", label: "Bir xil" }, { v: "sales", label: "Savdo" }, { v: "debt", label: "Qarz" }, { v: "deals", label: "Bitim" }];
  const L = (patch: Partial<Layers>) => onLayers({ ...layers, ...patch });
  const metricOpts = full ? METRICS : METRICS.filter((m) => m.v !== "debt");
  return (
    <div className="gm-panel-body">
      <Section title="Nuqtalar">
        <Toggle on={layers.points} onChange={(v) => L({ points: v })} label="Nuqtalarni ko'rsatish" />
        <Field label="Rang">
          <select className="gm-input" value={style.colorBy} onChange={(e) => onStyle({ ...style, colorBy: e.target.value as ColorBy })}>
            {colorOpts.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Hajm">
          <Seg small value={style.sizeBy} onChange={(v) => onStyle({ ...style, sizeBy: v })} options={full ? sizeOpts : sizeOpts.filter((o) => o.v !== "debt")} />
        </Field>
        <Toggle on={style.cluster} onChange={(v) => onStyle({ ...style, cluster: v })} label="Klasterlash" hint="Yaqin nuqtalar zoomga qarab guruhlanadi" />
        <Toggle on={style.labels} onChange={(v) => onStyle({ ...style, labels: v })} label="Nomlarni ko'rsatish" />
        {gradient ? (
          legendBreaks?.length ? <Legend scaleBreaks={legendBreaks} /> : <p className="gm-muted small">Bu ko&apos;rsatkich bo&apos;yicha qiymat yo&apos;q — nuqtalar kulrang.</p>
        ) : (
          <Legend items={legend} />
        )}
        {gradient && !!legendBreaks?.length && <p className="gm-muted small">so&apos;m; kulrang — qiymat yo&apos;q.</p>}
        <p className="gm-muted small">Xira nuqta — joyi taxminiy (tuman yoki viloyat markazi).</p>
      </Section>

      <Section title="Issiqlik xaritasi" open={layers.heatmap.on}>
        <Toggle on={layers.heatmap.on} onChange={(v) => L({ heatmap: { ...layers.heatmap, on: v } })} label="Yoqish" hint="Zich joylar va qaynoq nuqtalar" />
        <Seg small value={layers.heatmap.metric} onChange={(v) => L({ heatmap: { ...layers.heatmap, metric: v } })} options={metricOpts} />
      </Section>

      <Section title="Olti burchaklar (H3)" open={layers.hex.on}>
        <Toggle on={layers.hex.on} onChange={(v) => L({ hex: { ...layers.hex, on: v } })} label="Yoqish" hint="Har katakdagi jami yoki o'rtacha" />
        <Field label="Katak o'lchami">
          <Seg small value={layers.hex.res} onChange={(v) => L({ hex: { ...layers.hex, res: v } })}
            options={[{ v: 5, label: "~250 km²" }, { v: 6, label: "~36 km²" }, { v: 7, label: "~5 km²" }, { v: 8, label: "~0.7 km²" }]} />
        </Field>
        <Seg small value={layers.hex.metric} onChange={(v) => L({ hex: { ...layers.hex, metric: v } })} options={metricOpts} />
        {layers.hex.metric !== "count" && (
          <Seg small value={layers.hex.agg} onChange={(v) => L({ hex: { ...layers.hex, agg: v } })} options={[{ v: "sum", label: "Jami" }, { v: "avg", label: "O'rtacha" }]} />
        )}
      </Section>

      <Section title="Hududlarni bo'yash" open={layers.choropleth.on}>
        <Toggle on={layers.choropleth.on} onChange={(v) => L({ choropleth: { ...layers.choropleth, on: v } })} label="Yoqish" hint="Viloyat yoki tuman ichidagi qiymat bo'yicha" />
        <Seg small value={layers.choropleth.level} onChange={(v) => L({ choropleth: { ...layers.choropleth, level: v } })} options={[{ v: "region", label: "Viloyat" }, { v: "district", label: "Tuman" }]} />
        <Seg small value={layers.choropleth.metric} onChange={(v) => L({ choropleth: { ...layers.choropleth, metric: v } })} options={metricOpts} />
        {layers.choropleth.metric !== "count" && (
          <Seg small value={layers.choropleth.agg} onChange={(v) => L({ choropleth: { ...layers.choropleth, agg: v } })} options={[{ v: "sum", label: "Jami" }, { v: "avg", label: "O'rtacha" }]} />
        )}
      </Section>

      <Section title="Geografik markaz" open={layers.center.on}>
        <Toggle on={layers.center.on} onChange={(v) => L({ center: { ...layers.center, on: v } })} label="Ko'rsatish" hint="Filtrlangan mijozlarning og'irlikli markazi (ombor/filial joyi uchun)" />
        <Seg small value={layers.center.metric} onChange={(v) => L({ center: { ...layers.center, metric: v } })} options={metricOpts} />
      </Section>

      <Section title="Xarita va qatlamlar" open={false}>
        <Field label="Asosiy xarita">
          <Seg small value={style.basemap} onChange={(v) => onStyle({ ...style, basemap: v })}
            options={[{ v: "liberty", label: "Ko'cha" }, { v: "positron", label: "Oqish" }, { v: "dark", label: "Qorong'i" }, { v: "satellite", label: "Sun'iy yo'ldosh" }]} />
        </Field>
        <Toggle on={layers.territories} onChange={(v) => L({ territories: v })} label="Hududlar" />
        <Toggle on={layers.boundaries} onChange={(v) => L({ boundaries: v })} label="Viloyat chegaralari" />
        <Toggle on={layers.tiles.on} onChange={(v) => L({ tiles: { ...layers.tiles, on: v } })} label="Tashqi qatlam (XYZ / WMS)" hint="Masalan, ArcGIS yoki WMS tile manzili" />
        {layers.tiles.on && (
          <>
            <input className="gm-input" type="url" inputMode="url" aria-label="Tashqi qatlam manzili" placeholder="https://…/{z}/{x}/{y}.png yoki WMS …&bbox={bbox-epsg-3857}" value={layers.tiles.url}
              onChange={(e) => L({ tiles: { ...layers.tiles, url: e.target.value.trim() } })} />
            <Field label={`Shaffoflik ${Math.round(layers.tiles.opacity * 100)}%`}>
              <input type="range" min={0.1} max={1} step={0.05} value={layers.tiles.opacity} onChange={(e) => L({ tiles: { ...layers.tiles, opacity: Number(e.target.value) } })} />
            </Field>
          </>
        )}
      </Section>
    </div>
  );
}
