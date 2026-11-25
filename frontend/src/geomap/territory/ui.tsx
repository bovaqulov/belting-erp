// Hududlar paneli (faqat ko'rinish): eng yaqin mijozlar, hudud yaratish (chizish / radius / import), avtomatik muvozanatli
// hududlar (oldindan ko'rish, mas'ul, saqlash), hududlar ro'yxati (rang, mas'ul, o'chirish), asboblar (izoxron, yaqinlar, OSM).
import { useEffect, useRef, useState } from "react";

import { Btn, Chips, Empty, Field, Section, Seg, Toggle } from "@/geomap/kit";
import { km, money, num } from "@/geomap/lib/fields";
import type { Meta, Owner, Territory } from "@/geomap/lib/types";

import type { AutoT, Nearby, Prospect, Tool } from "./territory.lib";

export interface Props {
  full: boolean;
  territories: Territory[];
  owners: Owner[];
  meta: Meta | null;
  filteredIds: string[];
  tool: Tool | null;
  setTool: (t: Tool | null) => void;
  drawn: GeoJSON.Polygon | null;
  clearDrawn: () => void;
  radiusKm: number;
  setRadiusKm: (n: number) => void;
  onPreview: (fc: GeoJSON.FeatureCollection | null) => void;
  /** withRecords=false — faqat hududlar (rang/mas'ul o'zgarganda 4300 yozuv qayta yuklanmasin) */
  onReload: (withRecords?: boolean) => Promise<void>;
  onFocus: (g: GeoJSON.Geometry) => void;
  onToast: (s: string, err?: boolean) => void;
  prospects: Prospect[];
  clearProspects: () => void;
  nearby: Nearby[];
  clearNearby: () => void;
  onRecord: (id: string) => void;
  onFocusPoint: (lng: number, lat: number) => void;
  isoMinutes: number[];
  setIsoMinutes: (m: number[]) => void;
  clearIso: () => void;
  hasIso: boolean;
  prosRadius: number;
  setProsRadius: (n: number) => void;
}

export type AutoOpts = { count: number; balance: "count" | "sales"; base: "district" | "hex"; onlyFiltered: boolean; regions: string[] };

/** Rang tanlagich: sudrash paytida har qadamda emas, to'xtagandan keyin bir marta saqlanadi. */
function ColorInput({ value, onCommit }: { value: string; onCommit: (c: string) => void }) {
  const [v, setV] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <input type="color" value={v} aria-label="Hudud rangi" title="Hudud rangi" onChange={(e) => {
      const c = e.target.value;
      setV(c);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onCommit(c), 600);
    }} />
  );
}

export function TerritoryView({
  p, name, owner, doing, auto, preview,
  onName, onOwner, onSave, onImport, onAuto, onDoPreview, onPreviewOwner, onSaveAuto, onCancelPreview, onPatch, onDelete,
}: {
  p: Props; name: string; owner: string; doing: string | null; auto: AutoOpts; preview: { items: AutoT[]; used: number; skipped: number } | null;
  onName: (v: string) => void; onOwner: (v: string) => void; onSave: () => void; onImport: (f: File) => void; onAuto: (a: AutoOpts) => void;
  onDoPreview: () => void; onPreviewOwner: (i: number, owner: string | undefined) => void; onSaveAuto: (replace: boolean) => void;
  onCancelPreview: () => void; onPatch: (id: number, body: Record<string, unknown>) => void; onDelete: (t: Territory) => void;
}) {
  const busy = doing !== null;
  const ownerName = (id: string | null) => p.owners.find((o) => o.id === id)?.name ?? "—";
  const hasAuto = p.territories.some((t) => t.kind === "auto");
  const active = p.tool?.kind;
  const groups = new Map<string, Territory[]>();
  for (const t of p.territories) {
    const g = t.grp || (t.kind === "radius" ? "Radiuslar" : t.kind === "import" ? "Import" : "Chizilgan");
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }

  const newProspects = p.prospects.filter((x) => !x.known);

  return (
    <div className="gm-panel-body">
      {p.nearby.length > 0 && (
        <Section title={`Eng yaqin mijozlar (${p.nearby.length})`} right={<button type="button" className="gm-x" onClick={p.clearNearby} aria-label="Ro'yxatni yopish">×</button>}>
          {p.nearby.map((n) => (
            <button type="button" key={n.id} className="gm-list-item" onClick={() => p.onRecord(n.id)}>
              <span>{n.name}</span>
              <em>{km(n.dist)}</em>
            </button>
          ))}
        </Section>
      )}

      {p.full && (
        <Section title="Hudud yaratish">
          <div className="gm-row wrap">
            <Btn kind={active === "draw" ? "primary" : "plain"} onClick={() => p.setTool(active === "draw" ? null : { kind: "draw" })}>✏️ Chizish</Btn>
            <Btn kind={active === "radius" ? "primary" : "plain"} onClick={() => p.setTool(active === "radius" ? null : { kind: "radius" })}>◎ Radius</Btn>
            <label className={busy ? "gm-btn plain disabled" : "gm-btn plain"} title="GeoJSON, KML, GPX yoki Shapefile (.zip)">
              {doing === "import" ? "Import qilinmoqda…" : "⤓ Import"}
              <input type="file" hidden disabled={busy} accept=".geojson,.json,.kml,.gpx,.zip" onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = ""; // shu faylni qayta tanlash mumkin bo'lsin
                if (f) onImport(f);
              }} />
            </label>
          </div>
          {active === "draw" && !p.drawn && <p className="gm-hint">Xaritada nuqtalarni bosing; tugatish uchun «Tugatish» tugmasi yoki oxirgi nuqtani ikki marta bosing.</p>}
          {active === "radius" && (
            <>
              <p className="gm-hint">{p.tool?.kind === "radius" && p.tool.center ? "Markaz tanlandi." : "Xaritada markazni bosing."}</p>
              <Field label={`Radius: ${p.radiusKm} km`}>
                <input type="range" min={1} max={100} value={p.radiusKm} onChange={(e) => p.setRadiusKm(Number(e.target.value))} />
              </Field>
            </>
          )}
          {(p.drawn || (p.tool?.kind === "radius" && p.tool.center)) && (
            <div className="gm-form">
              <input className="gm-input" placeholder="Hudud nomi" aria-label="Hudud nomi" maxLength={80} value={name} onChange={(e) => onName(e.target.value)} />
              <select className="gm-input" aria-label="Mas'ul" value={owner} onChange={(e) => onOwner(e.target.value)}>
                <option value="">Mas&apos;ul biriktirilmagan</option>
                {p.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <div className="gm-row">
                <Btn kind="primary" disabled={busy} onClick={onSave}>{doing === "save" ? "Saqlanmoqda…" : "Saqlash"}</Btn>
                <Btn kind="ghost" disabled={busy} onClick={() => { p.clearDrawn(); p.setTool(null); }}>Bekor qilish</Btn>
              </div>
            </div>
          )}
        </Section>
      )}

      {p.full && (
        <Section title="Avtomatik muvozanatli hududlar" open={false}>
          <Field label={`Hududlar soni: ${auto.count}`}>
            <input type="range" min={2} max={30} value={auto.count} onChange={(e) => onAuto({ ...auto, count: Number(e.target.value) })} />
          </Field>
          <Field label="Teng taqsimlash">
            <Seg small value={auto.balance} onChange={(v) => onAuto({ ...auto, balance: v })} options={[{ v: "count", label: "Mijozlar soni" }, { v: "sales", label: "Savdo hajmi" }]} />
          </Field>
          <Field label="Asos">
            <Seg small value={auto.base} onChange={(v) => onAuto({ ...auto, base: v })} options={[{ v: "hex", label: "Kataklar (aniqroq)" }, { v: "district", label: "Tumanlar" }]} />
          </Field>
          <Toggle on={auto.onlyFiltered} onChange={(v) => onAuto({ ...auto, onlyFiltered: v })} label={`Faqat filtrlangan (${num(p.filteredIds.length)})`} />
          {p.meta && (
            <Field label="Viloyatlar (bo'sh — hammasi)">
              <Chips options={p.meta.regions.map((r) => ({ v: r.id, label: r.name }))} value={auto.regions} onChange={(v) => onAuto({ ...auto, regions: v })} />
            </Field>
          )}
          <Btn kind="primary" disabled={busy} onClick={onDoPreview}>{doing === "preview" ? "Hisoblanmoqda…" : "Oldindan ko'rish"}</Btn>
          {preview && !preview.items.length && <Empty>Bu tanlov bo&apos;yicha hudud tuzib bo&apos;lmadi — joylashuvi aniq mijozlar yetarli emas. Filtr yoki viloyatlarni kengaytiring.</Empty>}
          {preview && preview.items.length > 0 && (
            <div className="gm-preview">
              {preview.items.map((t, i) => (
                <div key={i} className="gm-trow">
                  <i style={{ background: t.color }} />
                  <span title={t.name}>{t.name}</span>
                  <em>{auto.balance === "sales" ? money(t.total) : num(t.total)}</em>
                  <b className={Math.abs(t.pct - 100) <= 10 ? "ok" : "warn"}>{t.pct}%</b>
                  <select className="gm-input small" aria-label={`${t.name} mas'uli`} value={t.owner ?? ""} onChange={(e) => onPreviewOwner(i, e.target.value || undefined)}>
                    <option value="">mas&apos;ulsiz</option>
                    {p.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              ))}
              <p className="gm-muted small">
                {num(preview.used)} ta mijoz hisobga olindi{preview.skipped > 0 && `; ${num(preview.skipped)} tasining joyi aniq emas — qatnashmadi`}.
                % — o&apos;rtachaga nisbatan (100% = teng).
              </p>
              <div className="gm-row wrap">
                <Btn kind="primary" disabled={busy} onClick={() => onSaveAuto(true)}>{doing === "auto-replace" ? "Saqlanmoqda…" : hasAuto ? "Saqlash (avvalgi avto hududlar o'rniga)" : "Saqlash"}</Btn>
                {hasAuto && <Btn disabled={busy} onClick={() => onSaveAuto(false)}>{doing === "auto-add" ? "Saqlanmoqda…" : "Qo'shib saqlash"}</Btn>}
                <Btn kind="ghost" disabled={busy} onClick={onCancelPreview}>Bekor</Btn>
              </div>
            </div>
          )}
        </Section>
      )}

      <Section title={`Hududlar (${p.territories.length})`}>
        {!p.territories.length && <Empty>{p.full ? "Hali hudud yo'q — chizing, radius qo'ying yoki avtomatik yarating." : "Sizga biriktirilgan hudud yo'q."}</Empty>}
        {[...groups.entries()].map(([g, ts]) => (
          <div key={g} className="gm-tgroup">
            <h4>{g}</h4>
            {ts.map((t) => (
              <div key={t.id} className="gm-trow">
                {p.full ? (
                  <ColorInput value={t.color} onCommit={(c) => onPatch(t.id, { color: c })} />
                ) : (
                  <i style={{ background: t.color }} />
                )}
                <button type="button" className="gm-link" title={`${t.name} — xaritada ko'rsatish`} onClick={() => p.onFocus(t.geometry)}>{t.name}</button>
                <em title="Mijozlar soni">{num(t.n)}</em>
                {p.full && <b title="Savdo (12 oy), so'm">{money(t.sales)}</b>}
                {p.full ? (
                  <select className="gm-input small" aria-label={`${t.name} mas'uli`} disabled={busy} value={t.owner ?? ""} onChange={(e) => onPatch(t.id, { owner: e.target.value || null })}>
                    <option value="">mas&apos;ulsiz</option>
                    {p.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                ) : (
                  <span className="gm-muted small">{ownerName(t.owner)}</span>
                )}
                {p.full && <button type="button" className="gm-x" disabled={busy} onClick={() => onDelete(t)} aria-label={`${t.name} hududini o'chirish`}>×</button>}
              </div>
            ))}
          </div>
        ))}
      </Section>

      {/* natija kelganda bo'lim ochiq holda qayta yaratiladi (aks holda ro'yxat yopiq bo'lim ichida ko'rinmay qoladi) */}
      <Section key={`tools:${newProspects.length > 0}:${p.hasIso}`} title="Asboblar" open={newProspects.length > 0 || p.hasIso}>
        <div className="gm-tool">
          <div className="gm-row between">
            <b>Mashinada yetib borish zonasi</b>
            <Btn kind={active === "iso" ? "primary" : "plain"} disabled={!p.isoMinutes.length} onClick={() => p.setTool(active === "iso" ? null : { kind: "iso" })}>Nuqtani tanlash</Btn>
          </div>
          <Chips options={[5, 10, 15, 20, 30, 45, 60].map((m) => ({ v: String(m), label: `${m} daq` }))} value={p.isoMinutes.map(String)}
            onChange={(v) => {
              if (v.length > 4) return p.onToast("Ko'pi bilan 4 ta vaqt tanlanadi", true);
              p.setIsoMinutes(v.map(Number).sort((a, b) => a - b));
            }} />
          {p.hasIso && <Btn kind="ghost" onClick={p.clearIso}>Zonani olib tashlash</Btn>}
        </div>
        <div className="gm-tool">
          <div className="gm-row between">
            <b>Yaqin atrofdagi mijozlar</b>
            <Btn kind={active === "nearby" ? "primary" : "plain"} onClick={() => p.setTool(active === "nearby" ? null : { kind: "nearby" })}>Nuqtani tanlash</Btn>
          </div>
          <p className="gm-muted small">Bosilgan nuqtaga eng yaqin 20 ta mijoz (filtr hisobga olinadi) — ro&apos;yxat shu panelning tepasida chiqadi.</p>
        </div>
        <div className="gm-tool">
          <div className="gm-row between">
            <b>Yangi mijozlar (OSM)</b>
            <Btn kind={active === "prospects" ? "primary" : "plain"} onClick={() => p.setTool(active === "prospects" ? null : { kind: "prospects" })}>Nuqtani tanlash</Btn>
          </div>
          <Field label={`Radius: ${p.prosRadius} km`}>
            <input type="range" min={1} max={30} value={p.prosRadius} onChange={(e) => p.setProsRadius(Number(e.target.value))} />
          </Field>
          <p className="gm-muted small">OpenStreetMap&apos;dagi zavod, sex, ustaxona va savdo nuqtalari. To&apos;q sariq — bizda yo&apos;q, kulrang — bazada bor.</p>
          {p.prospects.length > 0 && (
            <div className="gm-row between">
              <span className="gm-muted small">{newProspects.length} ta yangi{newProspects.length > 60 && " (birinchi 60 tasi)"}, {p.prospects.length - newProspects.length} tasi bazada bor</span>
              <Btn kind="ghost" onClick={p.clearProspects}>Tozalash</Btn>
            </div>
          )}
          {newProspects.slice(0, 60).map((x) => (
            <button type="button" key={x.osm} className="gm-list-item" onClick={() => p.onFocusPoint(x.lng, x.lat)}>
              <span>{x.name}</span>
              <em>{x.kind}</em>
              {(x.phone || x.address) && <small>{[x.phone, x.address].filter(Boolean).join(" · ")}</small>}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
