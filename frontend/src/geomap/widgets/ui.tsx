// Ko'rsatkichlar paneli (faqat ko'rinish): mijozlar, savdo, qarz, bitimlar; 1C jami (rahbariyat), holat / viloyat /
// mas'ul bo'yicha taqsimot (bosilsa — filtr).
import { Bars, Empty, Section, Stat } from "@/geomap/kit";
import { money, num, STATUS_COLOR, STATUS_LABEL } from "@/geomap/lib/fields";
import type { Summary } from "@/geomap/lib/stats";

export type Totals = { sales_12m: number; sales_docs: number; debt: number; debtors: number; debt_as_of: string | null };

export function WidgetsView({ s, tot, regionName, full, onPickRegion, onPickOwner }: {
  s: Summary; tot: Totals | null; regionName: (id: string) => string; full: boolean; onPickRegion: (id: string) => void; onPickOwner: (name: string) => void;
}) {
  const asOf = tot?.debt_as_of ? `${tot.debt_as_of.slice(8, 10)}.${tot.debt_as_of.slice(5, 7)} ${tot.debt_as_of.slice(11, 16)}` : "";
  return (
    <div className="gm-panel-body">
      <div className="gm-stats">
        <Stat label="Mijozlar" value={num(s.n)} sub={`${num(s.located)} tasi xaritada`} />
        <Stat label="Savdo (12 oy)" value={money(s.sales)} sub="so'm; xaritadagi mijozlar, 1C" />
        {full && <Stat label="Qarz" value={money(s.debt)} sub={`so'm; xaritadagi mijozlar, 1C${asOf ? ` (${asOf} holatiga)` : ""}; ${num(s.overdue)} tasida muddati o'tgan`} />}
        <Stat label="Ochiq bitimlar" value={num(s.deals)} sub="Bitrix, sotuv voronkasi" />
      </div>
      {full && tot && (
        <p className="gm-muted small">
          Jami 1C (xaritaga tushmagan kontragentlar bilan): savdo {money(tot.sales_12m)} so&apos;m ({num(tot.sales_docs)} hujjat, 12 oy);
          qarz {money(tot.debt)} so&apos;m ({num(tot.debtors)} kontragent{asOf ? `, ${asOf} holatiga` : ""}).
        </p>
      )}
      {s.approx > 0 && <p className="gm-muted small">{num(s.approx)} ta mijozning joyi taxminiy — tuman markazi yoki viloyat markazida. Manzil aniqlashtirilgan sari kamayadi.</p>}

      {s.n === 0 && <Empty>Filtrga mos mijoz yo&apos;q — ko&apos;rsatkichlar bo&apos;sh.</Empty>}

      <Section title="Holat bo'yicha">
        <Bars fmt={num} rows={s.byStatus.map(([k, n]) => ({ label: STATUS_LABEL[k] ?? k, value: n, color: STATUS_COLOR[k] }))} />
      </Section>
      <Section title="Viloyatlar (savdo)">
        <div className="gm-table">
          {s.byRegion.slice(0, 16).map(([k, n, sales]) => (
            <button type="button" key={k} disabled={k === "—"} title={k === "—" ? undefined : "Shu viloyat bo'yicha filtrlash"} onClick={() => onPickRegion(k)}>
              <span>{k === "—" ? "Noma'lum" : regionName(k)}</span>
              <em>{num(n)}</em>
              <b>{money(sales)}</b>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Mas'ullar (savdo)" open={false}>
        <div className="gm-table">
          {s.byOwner.slice(0, 25).map(([k, n, sales]) => (
            <button type="button" key={k} disabled={k === "—"} title={k === "—" ? undefined : "Shu mas'ul bo'yicha qidirish"} onClick={() => onPickOwner(k)}>
              <span>{k === "—" ? "Biriktirilmagan" : k}</span>
              <em>{num(n)}</em>
              <b>{money(sales)}</b>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
