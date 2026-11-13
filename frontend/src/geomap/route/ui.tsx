// Marshrut paneli (faqat ko'rinish): to'xtash joylari (filtrlanganlar / tanlanganlar, boshlanish nuqtasi, qaytish),
// eng qisqa tartib, natija (masofa, vaqt, Yandex / Google / CSV / chop etish / saqlash), saqlangan marshrutlar.
import { Btn, Empty, Section, Toggle } from "@/geomap/kit";
import { duration, km, num } from "@/geomap/lib/fields";

import { MAX_STOPS, type RouteResult, type Saved, type Stop } from "./route.lib";

export function RouteView({
  stops, start, picking, result, roundtrip, busy, locating, saved, saveName, saving, tgApp, filteredCount, selectionCount,
  addFiltered, addSelection, pickStart, onRecord, onClear, onMyLocation, onClearStart, onRoundtrip, onRemoveStop, onOptimize,
  onYandex, onGoogle, onCsv, onSaveName, onSave, onLoadSaved, onRemoveSaved,
}: {
  stops: Stop[]; start: [number, number] | null; picking: boolean; result: RouteResult | null; roundtrip: boolean; busy: boolean;
  locating: boolean; saved: Saved[] | null; saveName: string | null; saving: boolean; tgApp: boolean; filteredCount: number; selectionCount: number;
  addFiltered: () => void; addSelection: () => void; pickStart: () => void; onRecord: (id: string) => void; onClear: () => void;
  onMyLocation: () => void; onClearStart: () => void; onRoundtrip: (v: boolean) => void; onRemoveStop: (id: string) => void; onOptimize: () => void;
  onYandex: () => void; onGoogle: () => void; onCsv: () => void; onSaveName: (v: string | null) => void; onSave: () => void;
  onLoadSaved: (r: Saved) => void; onRemoveSaved: (r: Saved) => void;
}) {
  return (
    <div className="gm-panel-body">
      <Section title={`To'xtash joylari (${stops.length}/${MAX_STOPS})`}>
        <div className="gm-row wrap">
          <Btn onClick={addFiltered} disabled={!filteredCount} title={filteredCount > MAX_STOPS ? `Filtrda ${num(filteredCount)} ta — faqat birinchi ${MAX_STOPS} tasi qo'shiladi` : undefined}>+ Filtrlanganlar ({num(filteredCount)})</Btn>
          {selectionCount > 0 && <Btn onClick={addSelection}>+ Tanlanganlar ({num(selectionCount)})</Btn>}
          {stops.length > 0 && <Btn kind="ghost" onClick={onClear}>Tozalash</Btn>}
        </div>
        <div className="gm-row wrap">
          <span className="gm-muted small">Boshlanish:</span>
          <Btn onClick={onMyLocation} disabled={locating}>{locating ? "Aniqlanmoqda…" : "📍 Mening joyim"}</Btn>
          <Btn kind={picking ? "primary" : "plain"} onClick={pickStart}>Xaritadan</Btn>
          {start && <Btn kind="ghost" onClick={onClearStart} label="Boshlanish nuqtasini olib tashlash">×</Btn>}
        </div>
        <p className="gm-muted small">{start ? "Boshlanish nuqtasi belgilandi (xaritada «S»)." : "Boshlanish nuqtasi yo'q — marshrut birinchi to'xtash joyidan boshlanadi."}</p>
        <Toggle on={roundtrip} onChange={onRoundtrip} label="Boshlanish joyiga qaytish" />
        {!stops.length && <Empty>Mijoz kartasidagi “Marshrutga” tugmasi, lasso tanlovi yoki filtr orqali qo&apos;shing.</Empty>}
        <ol className="gm-stops">
          {stops.map((s, i) => (
            <li key={s.id}>
              <span className="gm-num">{i + 1}</span>
              <button type="button" className="gm-link" title={s.name} onClick={() => onRecord(s.id)}>{s.name}</button>
              <button type="button" className="gm-x" aria-label={`${s.name} — ro'yxatdan olib tashlash`} onClick={() => onRemoveStop(s.id)}>×</button>
            </li>
          ))}
        </ol>
        <Btn kind="primary" disabled={busy || stops.length < (start ? 1 : 2)} onClick={onOptimize}>{busy ? "Hisoblanmoqda…" : "Eng qisqa tartibni topish"}</Btn>
        {stops.length > 0 && stops.length < (start ? 1 : 2) && <p className="gm-muted small">Kamida 2 ta to&apos;xtash joyi yoki boshlanish nuqtasi kerak.</p>}
      </Section>

      {result && (
        <Section title="Natija">
          <p className="gm-result"><b>{km(result.distance_m)}</b> · {duration(result.duration_s)} {result.engine !== "osrm" && <span className="gm-muted">(taxminiy)</span>}</p>
          <div className="gm-row wrap">
            <Btn onClick={onYandex}>Yandex Maps</Btn>
            <Btn onClick={onGoogle}>Google Maps</Btn>
            <Btn onClick={onCsv}>CSV</Btn>
            {!tgApp && <Btn onClick={() => window.print()}>Chop etish</Btn>}
            {saveName === null && <Btn kind="primary" onClick={() => onSaveName(`Marshrut ${new Date().toLocaleDateString("ru-RU")}`)}>Saqlash</Btn>}
          </div>
          {saveName !== null && (
            <form className="gm-row" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
              <input className="gm-input" aria-label="Marshrut nomi" placeholder="Marshrut nomi" maxLength={80} value={saveName} onChange={(e) => onSaveName(e.target.value)} />
              <Btn kind="primary" type="submit" disabled={saving}>{saving ? "Saqlanmoqda…" : "Saqlash"}</Btn>
              <Btn kind="ghost" disabled={saving} onClick={() => onSaveName(null)}>Bekor</Btn>
            </form>
          )}
        </Section>
      )}

      <Section title={`Saqlangan marshrutlar${saved ? ` (${saved.length})` : ""}`} open={false}>
        {!saved && <Empty>Yuklanmoqda…</Empty>}
        {saved && !saved.length && <Empty>Hali saqlanmagan.</Empty>}
        {(saved ?? []).map((r) => (
          <div key={r.id} className="gm-trow">
            <button type="button" className="gm-link" title={`${r.name} — yuklash`} onClick={() => onLoadSaved(r)}>{r.name}</button>
            <em>{r.stops.length} nuqta</em>
            <b>{r.distance_m ? km(r.distance_m) : ""}</b>
            <button type="button" className="gm-x" aria-label={`${r.name} marshrutini o'chirish`} onClick={() => onRemoveSaved(r)}>×</button>
          </div>
        ))}
      </Section>
    </div>
  );
}
