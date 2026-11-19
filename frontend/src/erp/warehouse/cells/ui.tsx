// Ombor xaritasi (faqat ko'rinish): bitta sahifada binolar → tanlangan binoning xonalari → tanlangan xonaning stellajlari →
// tanlangan stellajning qator × qavat to'ri (har qator — ustun, qavatlari yuqoridan pastga). Amallar — narsaning o'zida: plitkada ⋯ (tahrirlash, PDF, o'chirish),
// tablar yonida ⋯ (ombor), punktir plitka — qo'shish. Joy bosilsa — tafsilot (kompyuterda o'ngda, telefonda ro'yxat o'rnida).
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Modal } from "@/erp/kit/modal";
import { C, Icon, Loaded, Seg, Sf } from "@/erp/kit/ui";
import { Btns, Split } from "@/erp/warehouse/common";
import { bldCode, blkCode, cellCode, cellPos, floorLetter, MAX_FLOORS, MAX_ROWS, rackCode, type Cell, type CellKind, type Purpose, type RackRow, type Warehouse, type WhKind } from "@/erp/warehouse/lib";

type St = { data: unknown; err: string; net: boolean; reload: () => Promise<void> };
/** Plitka: bino yoki xona (yoki «biriktirilmagan» guruhi); `menu` — ⋯ tugmasi (tahrirlash, PDF, o'chirish) */
export type Box = {
  key: string;
  code?: string;
  t: string;
  s: string;
  units: number;
  dim?: boolean;
  /** ochiq (ichi ostida ko'rinyapti) */
  on?: boolean;
  /** to'lganlik: band joylar / jami joylar */
  fill?: { used: number; total: number };
  onClick: () => void;
  menu?: () => void;
};
export type Modals = "store" | "bld" | "blk" | "rack" | "wiz" | null;
/** Joylar to'ri: stellaj qatorlari (yoki biriktirilmagan joylar) */
export type Grid = {
  title: string;
  sub?: string;
  rows: RackRow<Cell>[];
  rowTitle?: (row: string) => string;
  rowMenu?: boolean;
  /** stellaj bo'lsa — old tomondan chizma (qator × qavat), aks holda — kod bo'yicha ustunlar */
  rack?: { code: string; rows: number; floors: number; capacity?: number | null; cells: Cell[] };
};

const BOX =
  "flex h-full min-h-[112px] w-full cursor-pointer flex-col rounded-[14px] border-0 bg-sec p-3.5 text-left text-inherit [font:inherit] hover:shadow-[inset_0_0_0_1px_var(--link)] active:opacity-75";
/** ⋯ tugmasi: telefonda bosish maydoni ≥44px */
const MORE =
  "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent text-sub [font:inherit] hover:bg-fill active:opacity-75 coarse:size-11";
/** Bo'lim sarlavhasi: katta nom, soni va o'ngda yashil «+» (qo'shish) */
function Head({ t, count, add, onAdd }: { t: string; count?: ReactNode; add?: string; onAdd?: () => void }) {
  return (
    <div className="mx-4 mt-6 mb-3 flex min-h-11 items-center gap-3">
      <h2 className="m-0 flex min-w-0 flex-1 items-baseline gap-2 text-[20px] leading-tight font-bold">
        <span className="truncate">{t}</span>
        {count ? <span className="num shrink-0 text-[15px] font-semibold text-hint">{count}</span> : null}
      </h2>
      {add && onAdd ? (
        <button
          type="button"
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 text-white shadow-[0_3px_10px_-3px_rgba(52,199,89,.7)] hover:brightness-110 active:scale-95 coarse:size-11 [&_svg.i]:size-[22px]"
          style={{ background: C.green }}
          aria-label={add}
          title={add}
          onClick={onAdd}
        >
          <Icon n="plus" />
        </button>
      ) : null}
    </div>
  );
}

/** To'lganlik chizig'i: band / jami (foiz) — rang 90%+ — to'q sariq */
function Fill({ used, total }: { used: number; total: number }) {
  const pct = total ? Math.round((used / total) * 100) : 0;
  return (
    <span className="mt-2 flex items-center gap-2" title={`${used} / ${total} joy band`}>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-fill" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="To'lganlik">
        <span className={`block h-full rounded-full ${pct >= 90 ? "bg-[#f09a37]" : "bg-st-done"}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="num shrink-0 text-xs text-hint">{pct}%</span>
    </span>
  );
}

function Boxes({ items }: { items: Box[] }) {
  return (
    <div className="mx-4 grid grid-cols-2 gap-2.5 min-[560px]:grid-cols-3 min-[1180px]:grid-cols-4">
      {items.map((b) => (
        <div key={b.key} className="relative">
          <button
            type="button"
            aria-expanded={b.on === undefined ? undefined : b.on}
            className={`${BOX} ${b.dim && !b.on ? "opacity-70" : ""} ${b.on ? "shadow-[inset_0_0_0_2px_var(--link)]" : ""}`}
            onClick={b.onClick}
          >
            <span className="flex items-start justify-between gap-2">
              {b.code ? <span className="code text-[26px] leading-none font-bold">{b.code}</span> : <Icon n="layers" />}
              <span className="text-right">
                <span className="num block text-[21px] leading-none font-bold">{b.units}</span>
                <small className="text-xs text-hint">birlik</small>
              </span>
            </span>
            <span className={`mt-auto min-w-0 pt-3 ${b.menu ? "pr-9 coarse:pr-11" : ""}`}>
              <span className="block truncate font-semibold">{b.t}</span>
              <span className="block truncate text-[13px] text-hint">{b.s}</span>
              {b.fill && b.fill.total ? <Fill used={b.fill.used} total={b.fill.total} /> : null}
            </span>
          </button>
          {b.menu ? (
            <button type="button" className={`${MORE} absolute right-1.5 bottom-1.5`} aria-label={`${b.t}: amallar`} onClick={b.menu}>
              <Icon n="more-horizontal" />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Stellaj old tomondan (elevation): ko'k ustunlar orasida qatorlar (chapdan o'ngga), to'q sariq tokchalarda qavatlar
 * (1-qavat — pastda). Katak: band — yashil, bo'sh — kulrang, tanlangan — ko'k; xarakteristikada bor, lekin yaratilmagan — punktir. */
function Elevation({ rack, sel, onSel }: { rack: NonNullable<Grid["rack"]>; sel: Cell | null; onSel: (c: Cell) => void }) {
  const at = new Map<string, Cell>();
  let rows = rack.rows;
  let floors = rack.floors;
  for (const c of rack.cells) {
    // qator va qavat — joyning o'z maydonlaridan (kodda qavat harf: …-03-C); eski joylarda — koddan
    const pos = c.row && c.floor ? null : cellPos(c.code);
    const q = c.row ?? Number(pos?.row.split("-").pop());
    const floor = c.floor ?? pos?.floor;
    if (!floor || !q) continue;
    at.set(`${q}-${floor}`, c);
    rows = Math.max(rows, q);
    floors = Math.max(floors, floor);
  }
  const qs = Array.from({ length: rows }, (_, i) => i + 1);
  const fs = Array.from({ length: floors }, (_, i) => floors - i);
  const selRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [sel?.id]);
  // har doim ekran kengligiga sig'adi (aylanmaydi): qatorlar ko'p bo'lsa — ustunlar va kataklar ingichkalashadi
  const dense = rows > 8;
  const UP = `${dense ? "border-l-[3px]" : "border-l-[5px]"} border-[#3557d6]`; // ustun (ko'k)
  return (
    <div className="mx-4">
      <div className="rounded-[14px] bg-sec p-2 pb-2 min-[560px]:p-3">
        <div className="grid w-full" style={{ gridTemplateColumns: `20px repeat(${rows}, minmax(0, 1fr)) ${dense ? 3 : 5}px` }}>
          {/* qator sarlavhalari */}
          <span />
          {qs.map((q) => (
            <span key={`h${q}`} className="min-w-0 pb-1.5 text-center" title={`${q}-qator`}>
              <span className={`num block font-bold ${dense ? "text-[11px]" : "text-[15px]"}`}>{String(q).padStart(2, "0")}</span>
              {dense ? null : <span className="block truncate text-[11px] text-hint">qator</span>}
            </span>
          ))}
          <span />
          {fs.map((f) => (
            <div key={`f${f}`} className="contents">
              <span className="code flex items-center justify-end pr-1 text-[13px] font-bold text-sub" title={`${f}-qavat`} aria-hidden="true">
                {floorLetter(f)}
              </span>
              {qs.map((q) => {
                const c = at.get(`${q}-${f}`);
                const on = !!c && sel?.id === c.id;
                return (
                  <div key={`${q}-${f}`} className={`${UP} min-w-0 border-b-[4px] border-b-[#f07a2b] ${dense ? "px-px" : "px-1"} pt-1 pb-1`}>
                    {c ? (
                      <button
                        ref={on ? selRef : undefined}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${c.code}: ${c.units} birlik${c.status === "blocked" ? ", bloklangan" : c.status === "quarantine" ? ", karantin" : ""}`}
                        title={`${c.code}${c.status === "blocked" ? " · bloklangan" : c.status === "quarantine" ? " · karantin" : ""}`}
                        className={`flex h-11 w-full cursor-pointer items-center justify-center rounded-md border-0 [font:inherit] ${
                          on
                            ? "bg-link text-btn-fg"
                            : c.status === "blocked"
                              ? "bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,#eb4d3d_30%,var(--page))_0_6px,var(--page)_6px_12px)] text-[#eb4d3d] hover:shadow-[inset_0_0_0_1px_var(--link)]"
                              : rack.capacity && c.units >= rack.capacity
                                ? "bg-[color-mix(in_srgb,#f09a37_30%,var(--page))] text-fg hover:shadow-[inset_0_0_0_1px_var(--link)]"
                              : c.status === "quarantine"
                                ? "bg-[color-mix(in_srgb,#a65ff0_30%,var(--page))] text-fg hover:shadow-[inset_0_0_0_1px_var(--link)]"
                                : c.units
                                  ? "bg-[color-mix(in_srgb,var(--st-done)_28%,var(--page))] text-fg hover:shadow-[inset_0_0_0_1px_var(--link)]"
                                  : "bg-page text-hint hover:shadow-[inset_0_0_0_1px_var(--link)]"
                        }`}
                        onClick={() => onSel(c)}
                      >
                        <span className={`num font-bold ${dense ? "text-[11px]" : "text-[15px]"}`}>
                          {rack.capacity && !dense ? (c.units ? `${c.units}/${rack.capacity}` : "·") : c.units || "·"}
                        </span>
                      </button>
                    ) : (
                      <span className="block h-11 rounded-md border border-dashed border-sep" title={`${cellCode(rack.code, q, f)} — yaratilmagan`} />
                    )}
                  </div>
                );
              })}
              <span className={UP} />
            </div>
          ))}
          {/* pol */}
          <span />
          <span className="h-1.5 rounded-b-sm bg-sep" style={{ gridColumn: `2 / span ${rows + 1}` }} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-hint" aria-label="Izoh">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-[color-mix(in_srgb,var(--st-done)_28%,var(--page))]" /> band
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-sep bg-page" /> bo&apos;sh
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-link" /> tanlangan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-[color-mix(in_srgb,#a65ff0_30%,var(--page))]" /> karantin
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,#eb4d3d_45%,var(--page))_0_3px,var(--page)_3px_6px)]" /> bloklangan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-dashed border-sep" /> yaratilmagan
        </span>
        <span>
          · kod: <span className="code">{cellCode(rack.code, 3, 3)}</span> = {rack.code}, 03-qator, C qavat (A — pastki)
        </span>
      </div>
    </div>
  );
}

/** Joy kodi bo'yicha qidirish (yoki skaner): topilsa — xarita o'sha joyni ochadi */
function Find({ onFind }: { onFind: (code: string) => boolean }) {
  const [q, setQ] = useState("");
  return (
    <form
      className="mx-4 mt-3 flex items-center gap-2 rounded-[12px] bg-sec px-3 focus-within:shadow-[inset_0_0_0_1px_var(--link)]"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim() && onFind(q.trim())) setQ("");
      }}
    >
      <Icon n="search" cls="shrink-0 text-hint" />
      <input
        className="h-11 min-w-0 flex-1 border-0 bg-transparent text-fg outline-none [font:inherit] placeholder:text-hint"
        value={q}
        placeholder="Kod yoki skaner: AO1-A-01-03-C, AO1-A-01, AO1-A…"
        aria-label="Kod bo'yicha qidirish"
        autoCapitalize="characters"
        enterKeyHint="search"
        onChange={(e) => setQ(e.target.value)}
      />
      {q ? (
        <button type="submit" className="btn plain shrink-0">
          Topish
        </button>
      ) : null}
    </form>
  );
}

/** Stellajlar: har stellaj — ustun, qavatlari (joylar) yuqoridan pastga; katak — qavat va birliklar soni */
function Racks({
  rows,
  sel,
  onSel,
  rowTitle,
  onRowMenu,
}: {
  rows: RackRow<Cell>[];
  sel: Cell | null;
  onSel: (c: Cell) => void;
  /** ustun sarlavhasi: stellajda — «3-qator», aks holda — kod */
  rowTitle?: (row: string) => string;
  /** ustun ⋯ (biriktirilmagan joylar): PDF, o'chirish */
  onRowMenu?: (r: RackRow<Cell>) => void;
}) {
  return (
    <div className="mx-4 grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2.5">
      {rows.map((r) => (
        <div key={r.row} className="rounded-[14px] bg-sec p-2">
          <div className="flex items-center gap-1 pb-1.5 pl-1">
            <span className="min-w-0 flex-1">
              <span className={`block text-[17px] leading-tight font-bold ${rowTitle ? "" : "code"}`}>{rowTitle ? rowTitle(r.row) : r.row}</span>
              <span className="block truncate text-xs text-hint">
                <span className="num">{r.floors.filter((f) => f.floor !== null).length}</span> qavat
              </span>
              <span className={`block truncate text-xs ${r.units ? "text-st-done" : "text-hint"}`}>
                <span className="num">{r.units}</span> birlik
              </span>
            </span>
            {onRowMenu ? (
              <button type="button" className={`${MORE} -mr-0.5`} aria-label={`${r.row}: amallar`} onClick={() => onRowMenu(r)}>
                <Icon n="more-horizontal" />
              </button>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            {r.floors.map(({ floor, cell }) => {
              const on = sel?.id === cell.id;
              return (
                <button
                  key={cell.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${cell.code}: ${cell.units} birlik`}
                  className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border-0 px-2.5 text-left [font:inherit] ${
                    on
                      ? "bg-link text-btn-fg"
                      : cell.units
                        ? "bg-[color-mix(in_srgb,var(--st-done)_16%,var(--page))] text-fg hover:shadow-[inset_0_0_0_1px_var(--link)]"
                        : "bg-page text-sub hover:shadow-[inset_0_0_0_1px_var(--link)]"
                  }`}
                  onClick={() => onSel(cell)}
                >
                  <span className="min-w-0 truncate text-[13px]">{floor == null ? <span className="code">{cell.code}</span> : `${floor}-qavat`}</span>
                  <span className="num text-[15px] font-bold">{cell.units || "·"}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export const PURPOSES: [Purpose, string][] = [
  ["storage", "Saqlash"],
  ["receiving", "Qabul"],
  ["shipping", "Jo'natish"],
  ["quarantine", "Karantin"],
  ["production", "Sex"],
  ["returns", "Qaytarish"],
];
export const CELL_KINDS: [CellKind, string][] = [
  ["shelf", "Tokcha"],
  ["roll", "Rulon"],
  ["pallet", "Poddon"],
  ["bin", "Quti"],
  ["floor", "Pol"],
];
/** Tanlov chiplari (ko'p tanlov): bosilsa yoqiladi/o'chadi */
function Chips({ all, cur, onChange }: { all: string[]; cur: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {all.map((g) => {
        const on = cur.includes(g);
        return (
          <button
            key={g}
            type="button"
            aria-pressed={on}
            className={`min-h-9 cursor-pointer rounded-full border px-3 text-[13px] [font:inherit] coarse:min-h-11 ${on ? "border-link bg-link text-btn-fg" : "border-sep bg-transparent text-fg hover:bg-fill"}`}
            onClick={() => onChange(on ? cur.filter((x) => x !== g) : [...cur, g])}
          >
            {g}
          </button>
        );
      })}
    </div>
  );
}

const KINDS: [WhKind, string][] = [
  ["store", "Ombor"],
  ["shop", "Do'kon"],
  ["production", "Sex"],
];
const int = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);
/** Oynadagi «natija kodi» satri */
const Preview = ({ ok, children, bad }: { ok: boolean; children: ReactNode; bad: string }) => (
  <p className={`mt-2.5 mb-0 text-[13px] ${ok ? "text-hint" : "text-danger"}`} aria-live="polite">
    {ok ? children : bad}
  </p>
);

function StoreModal({ store, onCancel, onSubmit }: { store: Warehouse; onCancel: () => void; onSubmit: (name: string, kind: WhKind, code: string) => void }) {
  const [n, setN] = useState(store.name);
  const [k, setK] = useState<WhKind>(store.kind);
  const [c, setC] = useState(store.code ?? "");
  const code = c.trim().toUpperCase();
  const ok = !!n.trim() && /^[A-Z]{2,3}$/.test(code);
  return (
    <Modal
      title="Omborni tahrirlash"
      ok="Saqlash"
      onClose={onCancel}
      onOk={() => {
        if (ok) onSubmit(n.trim(), k, code);
        return false;
      }}
    >
      <label className="l" htmlFor="s-n">
        Ombor nomi
      </label>
      <input id="s-n" className="inp w-full" value={n} maxLength={120} onChange={(e) => setN(e.target.value)} autoFocus />
      <label className="l" htmlFor="s-c">
        Ombor kodi (2–3 lotin harfi)
      </label>
      <input id="s-c" className="inp code w-full uppercase" value={c} maxLength={3} placeholder="AO" onChange={(e) => setC(e.target.value)} />
      <span className="l">Turi</span>
      <Seg<WhKind> items={KINDS} cur={k} onPick={setK} />
      <Preview ok={/^[A-Z]{2,3}$/.test(code)} bad="Kod — 2–3 lotin harfi, masalan AO">
        Joy kodlari shu bilan boshlanadi: <span className="code">{code}1-A-01-01-A</span>
        {code !== (store.code ?? "") ? " — o'zgarsa, barcha joy kodlari yangilanadi (yorliqlarni qayta chop eting)." : "."}
      </Preview>
    </Modal>
  );
}

export type BldForm = { whCode: string; next: number; init?: { number: number; name: string } };
function BuildingModal({ form, onCancel, onSubmit }: { form: BldForm; onCancel: () => void; onSubmit: (number: number, name: string) => void }) {
  const [num, setNum] = useState(String(form.init?.number ?? form.next));
  const [n, setN] = useState(form.init?.name ?? "");
  const k = int(num);
  const ok = Number.isInteger(k) && k >= 1 && k <= 99;
  return (
    <Modal
      title={form.init ? "Binoni tahrirlash" : "Bino qo'shish"}
      ok={form.init ? "Saqlash" : "Qo'shish"}
      onClose={onCancel}
      onOk={() => {
        if (ok) onSubmit(k, n.trim());
        return false;
      }}
    >
      <div className="grid grid-cols-[96px_1fr] gap-2.5">
        <div>
          <label className="l" htmlFor="b-num">
            Raqami
          </label>
          <input id="b-num" className="inp w-full" inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} autoFocus={!form.init} />
        </div>
        <div>
          <label className="l" htmlFor="b-n">
            Nomi
          </label>
          <input id="b-n" className="inp w-full" value={n} maxLength={120} placeholder={ok ? `${k}-bino` : "masalan, Sovuq ombor"} onChange={(e) => setN(e.target.value)} autoFocus={!!form.init} />
        </div>
      </div>
      <Preview ok={ok} bad="Raqam — 1 dan 99 gacha">
        Bino kodi: <span className="code">{bldCode(form.whCode, k)}</span> · joylar <span className="code">{bldCode(form.whCode, k)}-A-01-01-A</span> …
      </Preview>
    </Modal>
  );
}

export type BlkForm = { bldCode: string; building: string; groups: string[]; init?: { code: string; name: string; purpose: Purpose; groups: string[] } };
export type BlkData = { code: string; name: string; purpose: Purpose; groups: string[] };
function BlockModal({ form, onCancel, onSubmit }: { form: BlkForm; onCancel: () => void; onSubmit: (d: BlkData) => void }) {
  const [c, setC] = useState(form.init?.code ?? "");
  const [n, setN] = useState(form.init?.name ?? "");
  const [pp, setPp] = useState<Purpose>(form.init?.purpose ?? "storage");
  const [gs, setGs] = useState<string[]>(form.init?.groups ?? []);
  const code = c.trim().toUpperCase();
  const ok = /^[A-Z]{1,2}$/.test(code);
  return (
    <Modal
      title={form.init ? `${form.init.code} xona — tahrirlash` : `Xona qo'shish — ${form.building}`}
      ok={form.init ? "Saqlash" : "Qo'shish"}
      onClose={onCancel}
      onOk={() => {
        if (ok) onSubmit({ code, name: n.trim(), purpose: pp, groups: gs });
        return false;
      }}
    >
      <div className="grid grid-cols-[96px_1fr] gap-2.5">
        <div>
          <label className="l" htmlFor="k-c">
            Harfi
          </label>
          <input id="k-c" className="inp code w-full uppercase" value={c} maxLength={2} placeholder="A" onChange={(e) => setC(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="l" htmlFor="k-n">
            Nomi (ixtiyoriy)
          </label>
          <input id="k-n" className="inp w-full" value={n} maxLength={120} placeholder="masalan, Konveyer lentalar" onChange={(e) => setN(e.target.value)} />
        </div>
      </div>
      <span className="l">Vazifasi</span>
      <Seg<Purpose> items={PURPOSES} cur={pp} onPick={setPp} />
      {pp === "storage" && form.groups.length ? (
        <>
          <span className="l">Qaysi tovarlar uchun (joylashtirish tavsiyasi)</span>
          <Chips all={form.groups} cur={gs} onChange={setGs} />
        </>
      ) : null}
      <Preview ok={ok} bad="Harfi — 1–2 lotin harfi (A yoki AB)">
        {pp !== "storage" ? `${PURPOSES.find((x) => x[0] === pp)?.[1]} xonasi — joylashtirish tavsiyasida qatnashmaydi. ` : null}
        Xona kodi: <span className="code">{blkCode(form.bldCode, code)}</span> · joylar <span className="code">{blkCode(form.bldCode, code)}-01-01-A</span> …
        {form.init && code !== form.init.code ? " — ichidagi joy kodlari yangilanadi (yorliqlarni qayta chop eting)." : " Harf bino ichida yagona."}
      </Preview>
    </Modal>
  );
}

export type RackForm = { title: string; prefix: string; next: number; init?: { rows: number; floors: number; name: string; cell_kind: CellKind; capacity: number | null; max_width_mm: number | null } };
export type RackData = { rows: number; floors: number; name: string; count: number; cell_kind: CellKind; capacity: number | null; max_width_mm: number | null };
/** Stellaj: qatorlar × qavatlar (yangi — bir nechta bir yo'la; tahrir — xarakteristika) */
function RackModal({ form, onCancel, onSubmit }: { form: RackForm; onCancel: () => void; onSubmit: (d: RackData) => void }) {
  const [rw, setRw] = useState(String(form.init?.rows ?? 4));
  const [fl, setFl] = useState(String(form.init?.floors ?? 7));
  const [cnt, setCnt] = useState("1");
  const [nm, setNm] = useState(form.init?.name ?? "");
  const [kind, setKind] = useState<CellKind>(form.init?.cell_kind ?? "shelf");
  const [cap, setCap] = useState(form.init?.capacity ? String(form.init.capacity) : "");
  const [mw, setMw] = useState(form.init?.max_width_mm ? String(form.init.max_width_mm) : "");
  const r = int(rw);
  const f = int(fl);
  const k = form.init ? 1 : int(cnt);
  const capN = cap.trim() ? int(cap) : null;
  const mwN = mw.trim() ? int(mw) : null;
  const ok =
    r >= 1 && r <= MAX_ROWS && f >= 1 && f <= MAX_FLOORS && k >= 1 && k <= 20 && (capN === null || (capN >= 1 && capN <= 999)) && (mwN === null || (mwN >= 1 && mwN <= 10000));
  const first = rackCode(form.prefix, form.next);
  const last = rackCode(form.prefix, form.next + (k || 1) - 1);
  return (
    <Modal
      title={form.title}
      ok={form.init ? "Saqlash" : "Qo'shish"}
      onClose={onCancel}
      onOk={() => {
        if (ok) onSubmit({ rows: r, floors: f, name: nm.trim(), count: k, cell_kind: kind, capacity: capN, max_width_mm: mwN });
        return false;
      }}
    >
      <div className={`grid gap-2.5 ${form.init ? "grid-cols-2" : "grid-cols-3"}`}>
        {form.init ? null : (
          <div>
            <label className="l" htmlFor="r-cnt">
              Stellajlar
            </label>
            <input id="r-cnt" className="inp w-full" inputMode="numeric" value={cnt} onChange={(e) => setCnt(e.target.value)} />
          </div>
        )}
        <div>
          <label className="l" htmlFor="r-rows">
            Qatorlar
          </label>
          <input id="r-rows" className="inp w-full" inputMode="numeric" value={rw} onChange={(e) => setRw(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="l" htmlFor="r-floors">
            Qavatlar
          </label>
          <input id="r-floors" className="inp w-full" inputMode="numeric" value={fl} onChange={(e) => setFl(e.target.value)} />
        </div>
      </div>
      <label className="l" htmlFor="r-name">
        Nomi (ixtiyoriy)
      </label>
      <input id="r-name" className="inp w-full" value={nm} maxLength={120} placeholder="masalan, Devor yonida" onChange={(e) => setNm(e.target.value)} />
      <span className="l">Joy turi</span>
      <Seg<CellKind> items={CELL_KINDS} cur={kind} onPick={setKind} />
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="l" htmlFor="r-cap">
            Sig&apos;imi (birlik/joy)
          </label>
          <input id="r-cap" className="inp w-full" inputMode="numeric" value={cap} placeholder="cheklanmagan" onChange={(e) => setCap(e.target.value)} />
        </div>
        <div>
          <label className="l" htmlFor="r-mw">
            Eng katta eni, mm
          </label>
          <input id="r-mw" className="inp w-full" inputMode="numeric" value={mw} placeholder="cheklanmagan" onChange={(e) => setMw(e.target.value)} />
        </div>
      </div>
      <Preview ok={ok} bad={`Stellajlar 1–20, qatorlar 1–${MAX_ROWS}, qavatlar 1–${MAX_FLOORS} (A…${floorLetter(MAX_FLOORS)}), sig'im 1–999, eni 1–10000 mm`}>
        {k > 1 ? (
          <>
            {k} stellaj: <span className="code">{first}</span> … <span className="code">{last}</span>, har biri{" "}
          </>
        ) : (
          <>
            <span className="code">{form.init ? form.prefix : first}</span>:{" "}
          </>
        )}
        {r} qator × {f} qavat = {r * f} joy — <span className="code">{cellCode(form.init ? form.prefix : first, 1, 1)}</span> …{" "}
        <span className="code">{cellCode(form.init ? form.prefix : first, r, f)}</span> (qavat A — eng past)
        {form.init ? ". Kamaysa — ortiqcha bo'sh joylar o'chadi; birlik bor joy bo'lsa, o'zgarmaydi." : null}
      </Preview>
    </Modal>
  );
}

export type WizForm = {
  whCode: string;
  buildings: { id: number; number: number; name: string }[];
  nextBld: number;
  /** mavjud xona keyingi stellaj raqami (bino id, harf) — yangi xonada 1 */
  nextRack: (buildingId: number, code: string) => number;
};
export type WizData = { building_id?: number; building_name?: string; building_number?: number; block_code: string; block_name: string; racks: number; rows: number; floors: number };
/** Tuzilma ustasi: bino → xona → N stellaj (qator × qavat) — bir oynada */
function WizardModal({ form, onCancel, onSubmit }: { form: WizForm; onCancel: () => void; onSubmit: (d: WizData) => void }) {
  const [bld, setBld] = useState(String(form.buildings[0]?.id ?? "new"));
  const [bnum, setBnum] = useState(String(form.nextBld));
  const [bname, setBname] = useState("");
  const [xc, setXc] = useState("A");
  const [xn, setXn] = useState("");
  const [cnt, setCnt] = useState("1");
  const [rw, setRw] = useState("4");
  const [fl, setFl] = useState("7");
  const isNew = bld === "new";
  const b = form.buildings.find((x) => String(x.id) === bld);
  const num = isNew ? int(bnum) : (b?.number ?? NaN);
  const code = xc.trim().toUpperCase();
  const [k, r, f] = [int(cnt), int(rw), int(fl)];
  const ok = num >= 1 && num <= 99 && /^[A-Z]{1,2}$/.test(code) && k >= 1 && k <= 20 && r >= 1 && r <= MAX_ROWS && f >= 1 && f <= MAX_FLOORS;
  const xona = blkCode(bldCode(form.whCode, num), code);
  const r0 = isNew ? 1 : form.nextRack(Number(bld), code);
  return (
    <Modal
      title="Tuzilma ustasi"
      ok="Yaratish"
      onClose={onCancel}
      onOk={() => {
        if (ok)
          onSubmit({
            ...(isNew ? { building_number: num, building_name: bname.trim() } : { building_id: Number(bld) }),
            block_code: code,
            block_name: xn.trim(),
            racks: k,
            rows: r,
            floors: f,
          });
        return false;
      }}
    >
      <span className="l">1. Bino</span>
      <Seg<string> items={[...form.buildings.map((x): [string, string] => [String(x.id), `${bldCode(form.whCode, x.number)} · ${x.name}`]), ["new", "+ Yangi bino"]]} cur={bld} onPick={setBld} />
      {isNew ? (
        <div className="grid grid-cols-[96px_1fr] gap-2.5">
          <div>
            <label className="l" htmlFor="w-bn">
              Raqami
            </label>
            <input id="w-bn" className="inp w-full" inputMode="numeric" value={bnum} onChange={(e) => setBnum(e.target.value)} />
          </div>
          <div>
            <label className="l" htmlFor="w-bname">
              Nomi
            </label>
            <input id="w-bname" className="inp w-full" value={bname} maxLength={120} placeholder={`${num || 1}-bino`} onChange={(e) => setBname(e.target.value)} />
          </div>
        </div>
      ) : null}
      <span className="l">2. Xona (bor bo&apos;lsa — unga qo&apos;shiladi)</span>
      <div className="grid grid-cols-[96px_1fr] gap-2.5">
        <input className="inp code w-full uppercase" aria-label="Xona harfi" value={xc} maxLength={2} onChange={(e) => setXc(e.target.value)} />
        <input className="inp w-full" aria-label="Xona nomi" value={xn} maxLength={120} placeholder="Nomi (ixtiyoriy)" onChange={(e) => setXn(e.target.value)} />
      </div>
      <span className="l">3. Stellajlar</span>
      <div className="grid grid-cols-3 gap-2.5">
        <input className="inp w-full" aria-label="Stellajlar soni" inputMode="numeric" value={cnt} onChange={(e) => setCnt(e.target.value)} />
        <input className="inp w-full" aria-label="Qatorlar" inputMode="numeric" value={rw} onChange={(e) => setRw(e.target.value)} />
        <input className="inp w-full" aria-label="Qavatlar" inputMode="numeric" value={fl} onChange={(e) => setFl(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-2.5 text-center text-xs text-hint">
        <span>stellaj</span>
        <span>qator</span>
        <span>qavat</span>
      </div>
      <Preview ok={ok} bad="Ma'lumotni tekshiring: bino 1–99, xona 1–2 harf, stellaj 1–20, qator 1–99, qavat 1–24">
        <span className="code">{rackCode(xona, r0)}</span>
        {k > 1 ? (
          <>
            {" "}
            … <span className="code">{rackCode(xona, r0 + k - 1)}</span>
          </>
        ) : null}
        : {k} × {r} qator × {f} qavat = <b>{k * r * f} joy</b> — <span className="code">{cellCode(rackCode(xona, r0), 1, 1)}</span> …
        {r0 > 1 ? ` (${xona} da ${r0 - 1} stellaj bor — davomidan)` : null}
      </Preview>
    </Modal>
  );
}

export function CellsView({
  wide,
  st,
  stores,
  wh,
  store,
  back,
  bldBoxes,
  blkBoxes,
  rackBoxes,
  grid,
  buildingName,
  blockCode,
  forms,
  sel,
  modal,
  detail,
  onWh,
  onSel,
  onModal,
  onStoreMenu,
  onFind,
  onRowMenu,
  onBld,
  onBlk,
  onRack,
  onWiz,
  onEditStore,
}: {
  wide: boolean;
  st: St;
  stores: Warehouse[];
  wh: number | undefined;
  /** tanlangan ombor (tahrirlash oynasi uchun) */
  store: Warehouse | null;
  /** telefonda joy tafsilotidan qaytish tugmasi matni */
  back: string;
  bldBoxes: Box[];
  /** tanlangan binoning xonalari (bino tanlanmagan — null) */
  blkBoxes: Box[] | null;
  /** tanlangan xonaning stellajlari (xona tanlanmagan — null) */
  rackBoxes: Box[] | null;
  /** tanlangan stellajning (yoki biriktirilmagan joylarning) to'ri */
  grid: Grid | null;
  buildingName: string | null;
  /** tanlangan xona harfi (stellaj qo'shish mumkin) */
  blockCode: string | null;
  /** oynalar ma'lumoti: bino, xona, stellaj (yangi yoki tahrir), tuzilma ustasi */
  forms: { bld: BldForm | null; blk: BlkForm | null; rack: RackForm | null; wiz: WizForm | null };
  sel: Cell | null;
  modal: Modals;
  detail: ReactNode;
  onWh: (id: number) => void;
  onSel: (c: Cell | null) => void;
  onModal: (m: Modals) => void;
  onStoreMenu: () => void;
  /** joy kodi bo'yicha qidirish: topildi — true */
  onFind: (code: string) => boolean;
  onRowMenu: (r: RackRow<Cell>) => void;
  onBld: (number: number, name: string) => void;
  onBlk: (d: BlkData) => void;
  onRack: (d: RackData) => void;
  onWiz: (d: WizData) => void;
  onEditStore: (name: string, kind: WhKind, code: string) => void;
}) {
  const close = () => onModal(null);
  const modalEl =
    modal === "store" && store ? (
      <StoreModal store={store} onCancel={close} onSubmit={onEditStore} />
    ) : modal === "bld" && forms.bld ? (
      <BuildingModal form={forms.bld} onCancel={close} onSubmit={onBld} />
    ) : modal === "blk" && forms.blk ? (
      <BlockModal form={forms.blk} onCancel={close} onSubmit={onBlk} />
    ) : modal === "rack" && forms.rack ? (
      <RackModal form={forms.rack} onCancel={close} onSubmit={onRack} />
    ) : modal === "wiz" && forms.wiz ? (
      <WizardModal form={forms.wiz} onCancel={close} onSubmit={onWiz} />
    ) : null;

  if (!wide && detail)
    return (
      <>
        <Btns>
          <button className="btn plain" onClick={() => onSel(null)}>
            <Icon n="back" /> {back}
          </button>
        </Btns>
        {detail}
        {modalEl}
      </>
    );

  const main = (
    <Loaded st={st}>
      {() => (
        <>
          <Find onFind={onFind} />
          <Head t="Binolar" count={bldBoxes.filter((b) => !b.dim).length || undefined} add="Bino qo'shish" onAdd={() => onModal("bld")} />
          <Boxes items={bldBoxes} />
          {!bldBoxes.length ? <Sf>Avval omborning binolarini qo&apos;shing, keyin binoga xonalar (A, B …), xonaga stellajlar (qator × qavat).</Sf> : null}
          {blkBoxes ? (
            <section aria-label={`${buildingName ?? "Binoga biriktirilmagan"} — xonalar`}>
              <Head
                t={`Xonalar — ${buildingName ?? "binoga biriktirilmagan"}`}
                count={blkBoxes.filter((b) => !b.dim).length || undefined}
                add={buildingName ? "Xona qo'shish" : undefined}
                onAdd={() => onModal("blk")}
              />
              <Boxes items={blkBoxes} />
              {!blkBoxes.length ? <Sf>Xona — binodagi xona yoki zona (masalan A — konveyer lentalar). Joy kodlari xona harfi bilan boshlanadi.</Sf> : null}
            </section>
          ) : null}
          {rackBoxes ? (
            <section aria-label={`${blockCode ?? "Xonaga biriktirilmagan"} — stellajlar`}>
              <Head
                t={`Stellajlar — ${blockCode ? `${blockCode} xona` : "xonaga biriktirilmagan"}`}
                count={rackBoxes.filter((b) => !b.dim).length || undefined}
                add={blockCode ? "Stellaj qo'shish" : undefined}
                onAdd={() => onModal("rack")}
              />
              <Boxes items={rackBoxes} />
              {!rackBoxes.length ? <Sf>Stellaj — qatorlar × qavatlar (masalan 4 × 7 = 28 joy). Joy kodi: xona-stellaj-qator-qavat, masalan A-1-03-2.</Sf> : null}
            </section>
          ) : null}
          {grid ? (
            <section aria-label={`${grid.title} — joylar`}>
              <Head t={grid.title} count={grid.sub} />
              {grid.rack ? (
                <Elevation rack={grid.rack} sel={sel} onSel={(c) => onSel(c)} />
              ) : grid.rows.length ? (
                <Racks rows={grid.rows} sel={sel} onSel={onSel} rowTitle={grid.rowTitle} onRowMenu={grid.rowMenu ? onRowMenu : undefined} />
              ) : (
                <Sf>Bu yerda joy yo&apos;q.</Sf>
              )}
            </section>
          ) : null}
        </>
      )}
    </Loaded>
  );

  // ombor tablari va ombor amallari (⋯) — bir qatorda, yopishqoq
  const tabs = stores.length ? (
    <div className="sticky top-0 z-15 flex items-center bg-page [:root:has(#topbar:not(.hidden))_&]:top-[52px]">
      <div className="min-w-0 flex-1">
        <Seg<string> items={stores.map((x) => [String(x.id), x.name])} cur={String(wh ?? "")} onPick={(k) => onWh(Number(k))} />
      </div>
      {store ? (
        <button type="button" className={`${MORE} mr-3 -ml-2`} aria-label={`«${store.name}» omborining amallari`} onClick={onStoreMenu}>
          <Icon n="more-horizontal" />
        </button>
      ) : null}
    </div>
  ) : null;
  return (
    <>
      {tabs}
      {wide && detail ? <Split wide kind="r" left={main} right={detail} /> : main}
      {modalEl}
    </>
  );
}
