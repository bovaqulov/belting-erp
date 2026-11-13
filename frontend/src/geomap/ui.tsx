// GeoMap karkasi (faqat ko'rinish): yuklanish / xato ekranlari; yon panel (brend, tablar, panellar — slot), xarita (slot),
// tepa panel (qidiruv, soni, lasso, hammasini ko'rsatish), bo'sh / mos kelmadi, legendalar, asbob paneli, ish holati,
// tanlov paneli (marshrut, teg, mas'ul), mijoz kartasi (slot), toast.
import type { ReactNode } from "react";

import { Btn, Spin } from "@/geomap/kit";
import { num } from "@/geomap/lib/fields";
import type { Owner } from "@/geomap/lib/types";
import { Legend } from "@/geomap/style";

export type Tab = "filter" | "style" | "terr" | "route" | "stats" | "share";
export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "filter", label: "Filtr", icon: "⚲" },
  { id: "style", label: "Ko'rinish", icon: "◐" },
  { id: "stats", label: "Ko'rsatkich", icon: "▤" },
  { id: "terr", label: "Hududlar", icon: "⬡" },
  { id: "route", label: "Marshrut", icon: "↝" },
  { id: "share", label: "Ulashish", icon: "⤴" },
];

export const GeoSplash = () => (
  <div className="gm-splash">
    <div className="gm-spin" />
    GeoMap yuklanmoqda…
  </div>
);

export const GeoError = ({ msg, onRetry }: { msg: string; onRetry: () => void }) => (
  <div className="gm-splash">
    <p className="gm-err">{msg}</p>
    <Btn onClick={onRetry}>Qayta urinish</Btn>
  </div>
);

type BulkUi = { action: "tag" | "owner"; value: string } | null;

export function GeoView({
  cls, total, shown, synced, syncedLabel, sheet, onSheetToggle, tab, onTab, filterRules, stopCount, note, pending, panes, map,
  search, onSearch, toolKind, onLasso, onFitAll, noData, onRefresh, noMatch, onClearFilter,
  choroOn, choroRegion, choroCount, choro, hexOn, hexCount, hex,
  toolHint, draftLen, radiusCenter, onFinish, onUndoPoint, onContinueRadius, onCancelTool, work,
  selCount, bulkUi, bulkBusy, owners, full, onBulkUi, onBulkValue, onApplyBulk, onSelRoute, onSelClear, card, toast,
}: {
  cls: string; total: number; shown: number; synced: string | null; syncedLabel: string; sheet: boolean; onSheetToggle: () => void;
  tab: Tab; onTab: (t: Tab) => void; filterRules: number; stopCount: number; note: string | null; pending: number;
  /** tab → panel (konteyner; hali ochilmagan tab — null) */
  panes: Record<Tab, ReactNode | null>;
  map: ReactNode;
  search: string; onSearch: (v: string) => void; toolKind: string | null; onLasso: () => void; onFitAll: () => void;
  noData: boolean; onRefresh: () => void; noMatch: boolean; onClearFilter: () => void;
  choroOn: boolean; choroRegion: boolean; choroCount: boolean; choro: { br: number[] } | null;
  hexOn: boolean; hexCount: boolean; hex: { br: number[] } | null;
  toolHint: string; draftLen: number; radiusCenter: boolean; onFinish: () => void; onUndoPoint: () => void; onContinueRadius: () => void; onCancelTool: () => void;
  work: string | null; selCount: number; bulkUi: BulkUi; bulkBusy: boolean; owners: Owner[]; full: boolean;
  onBulkUi: (b: BulkUi) => void; onBulkValue: (v: string) => void; onApplyBulk: () => void; onSelRoute: () => void; onSelClear: () => void;
  card: ReactNode; toast: { text: string; err?: boolean } | null;
}) {
  return (
    <div className={cls}>
      <aside className="gm-side">
        <div className="gm-brand">
          <b>GeoMap</b>
          <span className="gm-muted small" title={synced ? `Ma'lumot yangilangan: ${synced.replace("T", " ")}` : ""}>{num(total)} mijoz{syncedLabel && ` · yangilandi ${syncedLabel}`}</span>
          <button type="button" className="gm-sheet-toggle" onClick={onSheetToggle} aria-expanded={sheet} aria-label={sheet ? "Panelni yig'ish" : "Panelni ochish"}>{sheet ? "▾" : "▴"}</button>
        </div>
        <nav className="gm-tabs" role="tablist" aria-label="Bo'limlar">
          {TABS.map((t) => (
            <button key={t.id} id={`gm-tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id} aria-controls={`gm-pane-${t.id}`} className={tab === t.id ? "on" : ""}
              onClick={() => onTab(t.id)}>
              <span aria-hidden>{t.icon}</span>
              {t.label}
              {t.id === "filter" && filterRules > 0 && <em>{filterRules}</em>}
              {t.id === "route" && stopCount > 0 && <em>{stopCount}</em>}
            </button>
          ))}
        </nav>
        {note && <p className="gm-note">{note}</p>}
        {pending > 0 && <p className="gm-note">{pending} ta tashrif internet kelishini kutmoqda</p>}
        <div className="gm-panel">
          {TABS.map((t) =>
            panes[t.id] ? (
              <div key={t.id} id={`gm-pane-${t.id}`} role="tabpanel" aria-labelledby={`gm-tab-${t.id}`} className="gm-pane" hidden={tab !== t.id}>
                {panes[t.id]}
              </div>
            ) : null,
          )}
        </div>
      </aside>

      <main className="gm-main">
        {map}

        <div className="gm-topbar">
          <input className="gm-input gm-search-top" type="search" placeholder="Qidirish…" aria-label="Mijozlarni qidirish" value={search} onChange={(e) => onSearch(e.target.value)} />
          <span className="gm-pill" title="Filtrga mos / jami mijozlar">{num(shown)} / {num(total)}</span>
          <button type="button" className={toolKind === "lasso" ? "gm-pill btn on" : "gm-pill btn"} aria-pressed={toolKind === "lasso"} onClick={onLasso} title="Xaritada o'rab tanlash (lasso)">◌ Tanlash</button>
          <button type="button" className="gm-pill btn" onClick={onFitAll} title="Filtrlangan mijozlarni to'liq ko'rsatish" aria-label="Filtrlangan mijozlarni to'liq ko'rsatish">⤢</button>
        </div>

        {noData && (
          <div className="gm-toolbar" role="status">
            <span>{note ?? "Xaritada ko'rsatiladigan mijoz yo'q"}</span>
            <Btn onClick={onRefresh}>Yangilash</Btn>
          </div>
        )}
        {noMatch && (
          <div className="gm-toolbar" role="status">
            <span>Filtrga mos mijoz topilmadi</span>
            <Btn kind="primary" onClick={onClearFilter}>Filtrni tozalash</Btn>
          </div>
        )}

        {choroOn && (
          <div className="gm-float-legend">
            <b>{choroRegion ? "Viloyatlar" : "Tumanlar"}</b>
            {!choro ? <span className="gm-muted">Chegaralar yuklanmoqda…</span> : choro.br.length ? <Legend scaleBreaks={choro.br} fmt={choroCount ? num : undefined} /> : <span className="gm-muted">Ma&apos;lumot yo&apos;q</span>}
          </div>
        )}
        {hexOn && hex && !choroOn && (
          <div className="gm-float-legend">
            <b>Kataklar</b>
            {hex.br.length ? <Legend scaleBreaks={hex.br} fmt={hexCount ? num : undefined} /> : <span className="gm-muted">Ma&apos;lumot yo&apos;q</span>}
          </div>
        )}

        {toolKind && (
          <div className="gm-toolbar">
            <span>{toolHint}</span>
            {(toolKind === "draw" || toolKind === "lasso") && draftLen >= 3 && <Btn kind="primary" onClick={onFinish}>Tugatish</Btn>}
            {(toolKind === "draw" || toolKind === "lasso") && draftLen > 0 && <Btn onClick={onUndoPoint} label="Oxirgi nuqtani olib tashlash">↶</Btn>}
            {toolKind === "radius" && radiusCenter && <Btn kind="primary" onClick={onContinueRadius}>Davom etish</Btn>}
            <Btn kind="ghost" onClick={onCancelTool}>Bekor</Btn>
          </div>
        )}
        {work && !toolKind && (
          <div className="gm-toolbar" role="status">
            <Spin />
            <span>{work}</span>
          </div>
        )}

        {selCount > 0 && !toolKind && !work && (
          bulkUi ? (
            <form className="gm-selbar" onSubmit={(e) => { e.preventDefault(); onApplyBulk(); }}>
              <b>{num(selCount)} ta:</b>
              {bulkUi.action === "tag" ? (
                <input className="gm-input" maxLength={60} placeholder="Teg (bo'sh — olib tashlash)" aria-label="Teg" value={bulkUi.value} onChange={(e) => onBulkValue(e.target.value)} />
              ) : (
                <select className="gm-input" aria-label="Yangi mas'ul" value={bulkUi.value} onChange={(e) => onBulkValue(e.target.value)}>
                  <option value="">Yangi mas&apos;ulni tanlang</option>
                  {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
              <Btn kind="primary" type="submit" disabled={bulkBusy || (bulkUi.action === "owner" && !bulkUi.value)}>{bulkBusy ? "Saqlanmoqda…" : "Qo'llash"}</Btn>
              <Btn kind="ghost" disabled={bulkBusy} onClick={() => onBulkUi(null)}>Bekor</Btn>
            </form>
          ) : (
            <div className="gm-selbar">
              <b>{num(selCount)} ta tanlandi</b>
              <Btn onClick={onSelRoute}>Marshrutga</Btn>
              <Btn onClick={() => onBulkUi({ action: "tag", value: "" })}>Teg</Btn>
              {full && <Btn onClick={() => onBulkUi({ action: "owner", value: "" })}>Mas&apos;ul</Btn>}
              <Btn kind="ghost" onClick={onSelClear} label="Tanlovni bekor qilish">×</Btn>
            </div>
          )
        )}

        {card}

        {toast && <div className={toast.err ? "gm-toast err" : "gm-toast"} role="status">{toast.text}</div>}
      </main>
    </div>
  );
}
