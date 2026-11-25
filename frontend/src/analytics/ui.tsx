// Analitika (faqat ko'rinish): davr tanlovi; savdo — asosiy raqamlar (oldingi davr bilan), kunlik ustunlar, sotuvchilar,
// lidlar manbasi; ombor — qoldiq, qiymat, aniqlik, kam qoldiq; marketplace — kanal va bosqich bo'yicha buyurtmalar.
import type { ReactNode } from "react";

import s from "@/shared/ui/panel/styles";
import { Icon, SectionHeader, Sq } from "@/shared/ui/panel/ui";

import { bucket, delta, money, num, PERIODS, SOURCE_LABEL, STAGE_LABEL, type Analytics, type Period } from "./analytics.lib";

const OK = "#31b545";
const WARN = "#e8961f";
const BAD = "#ec3942";

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="min-w-0 rounded-xl bg-sec px-3 py-3">
      <div className="truncate text-[13px] text-hint">{label}</div>
      <div className="num mt-0.5 truncate text-[22px] leading-tight font-semibold">{value}</div>
      {sub ? (
        <div className={`mt-0.5 truncate text-xs ${tone === "up" ? "text-st-done" : tone === "down" ? "text-st-bad" : "text-hint"}`}>{sub}</div>
      ) : null}
    </div>
  );
}

const GRID = "mx-4 mt-2 grid grid-cols-2 gap-2 min-[768px]:grid-cols-4";

function Row({ icon, color, t, sub, val }: { icon: string; color: string; t: string; sub?: string; val: ReactNode }) {
  return (
    <div className={s.item}>
      <Sq icon={icon} color={color} />
      <div className={s.main}>
        <div className={s.t}>{t}</div>
        {sub ? <div className={s.s}>{sub}</div> : null}
      </div>
      <span className={`${s.val} num`}>{val}</span>
    </div>
  );
}

function Bars({ days }: { days: Analytics["sales"]["by_day"] }) {
  const b = bucket(days);
  const max = Math.max(1, ...b.map((x) => x.sum));
  return (
    <div className="mx-4 rounded-xl bg-sec px-3 pt-3 pb-2" role="img" aria-label="Savdo kunlar bo'yicha">
      <div className="flex h-28 items-end gap-[3px]">
        {b.map((x) => (
          <div key={x.label} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${x.label}: ${num(x.sum)} so'm`}>
            <div className="rounded-t-[3px] bg-link" style={{ height: `${x.sum ? Math.max(4, (x.sum / max) * 100) : 0}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-hint">
        <span>{b[0]?.label}</span>
        <span>{b[b.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export function AnalyticsView({ d, err, period, onPeriod }: { d: Analytics | null; err: string; period: Period; onPeriod: (p: Period) => void }) {
  const seg = (
    <div className={s.toolbar}>
      <div className={s.seg} style={{ flex: 1 }} role="group" aria-label="Davr">
        {PERIODS.map(([p, label]) => (
          <button key={p} type="button" className={p === period ? s.on : ""} aria-pressed={p === period} onClick={() => onPeriod(p)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
  if (err) return <>{seg}<div className={s.err}>{err}</div></>;
  if (!d) return <>{seg}<div className={s.empty}>Yuklanmoqda…</div></>;
  const sa = d.sales;
  const dl = delta(sa.delta_pct);
  const w = d.warehouse;
  const m = d.marketplace;
  const sources = Object.entries(sa.lead_sources).sort((a, b) => b[1] - a[1]);
  return (
    <>
      {seg}
      <SectionHeader>Savdo · CRM</SectionHeader>
      <div className={GRID}>
        <Stat label="Sotuv, so'm" value={money(sa.won_sum)} sub={dl ? `${dl.text} oldingi davrga` : "oldingi davrda sotuv yo'q"} tone={dl ? (dl.up ? "up" : "down") : undefined} />
        <Stat label="Bitimlar (yutilgan)" value={num(sa.won_n)} sub={sa.won_n ? `o'rtacha ${money(sa.avg)} so'm` : undefined} />
        <Stat label="Lidlar" value={num(sa.leads_n)} sub={sa.conv_pct === null ? undefined : `${String(sa.conv_pct).replace(".", ",")}% bitimga aylandi`} />
        <Stat label="Ochiq voronka, so'm" value={money(sa.open_sum)} sub={`${num(sa.open_n)} ta bitim`} />
      </div>
      <SectionHeader>Sotuv kunlar bo&apos;yicha</SectionHeader>
      {sa.won_sum ? <Bars days={sa.by_day} /> : <div className={s.empty}>Bu davrda sotuv yo&apos;q.</div>}
      <SectionHeader>Sotuvchilar</SectionHeader>
      {sa.sellers.length ? (
        <div className={s.list}>
          {sa.sellers.map((x, i) => (
            <Row key={x.tg_id ?? `n${i}`} icon="user" color={i === 0 ? OK : "#8e8e93"} t={x.name} sub={`${num(x.n)} ta sotuv`} val={`${money(x.sum)} so'm`} />
          ))}
        </div>
      ) : (
        <div className={s.empty}>Bu davrda sotuv yo&apos;q.</div>
      )}
      <SectionHeader>Lidlar manbasi</SectionHeader>
      <div className={s.list}>
        {sources.length ? (
          sources.map(([k, n]) => <Row key={k} icon="inbox" color="#3e88f7" t={SOURCE_LABEL[k] ?? k} val={num(n)} />)
        ) : (
          <div className={s.empty}>Bu davrda lid yo&apos;q.</div>
        )}
        <Row icon="user-plus" color={OK} t="Yangi mijozlar" val={num(sa.customers_new)} />
        <Row icon="x" color={BAD} t="Yo'qotilgan bitimlar" val={num(sa.deals_lost)} />
      </div>

      <SectionHeader>Ombor</SectionHeader>
      <div className={GRID}>
        <Stat label="Qoldiq qiymati, so'm" value={w.value === null ? "—" : money(w.value)} sub={`${num(w.items)} tovar · ${num(w.units)} birlik`} />
        <Stat label="Kam qoldiq" value={num(w.low_n)} sub="minimal qoldiqdan kam" tone={w.low_n ? "down" : undefined} />
        <Stat label="Sanash aniqligi" value={w.accuracy === null ? "—" : `${String(w.accuracy).replace(".", ",")}%`} sub="oxirgi 30 kun" tone={w.accuracy !== null && w.accuracy < 95 ? "down" : undefined} />
        <Stat label="Yig'ish navbati" value={num(w.picks)} sub={w.no_loc ? `${num(w.no_loc)} birlik joysiz` : undefined} />
      </div>
      {w.low.length ? (
        <div className={`${s.list} mt-2`}>
          {w.low.map((x) => (
            <Row key={x.name} icon="triangle-alert" color={WARN} t={x.name} sub={`minimal ${num(x.min_qty)} ${x.unit}`} val={`${String(x.qty).replace(".", ",")} ${x.unit}`} />
          ))}
        </div>
      ) : null}

      <SectionHeader>Marketplace</SectionHeader>
      <div className={GRID}>
        <Stat label="Buyurtmalar" value={num(m.orders_n)} sub="davr ichida" />
        <Stat label="Faol" value={num(m.active_n)} sub="yangi va yig'ishda" />
        <Stat label="Muddati o'tgan" value={num(m.overdue_n)} sub="faol buyurtmalardan" tone={m.overdue_n ? "down" : undefined} />
        <Stat label="Bekor" value={num(m.by_stage.cancelled ?? 0)} sub="davr ichida" />
      </div>
      <div className={`${s.list} mt-2`}>
        {Object.entries(m.by_channel).map(([k, n]) => (
          <Row key={k} icon="store" color="#8e4ec6" t={m.channel_names[k] ?? k} val={num(n)} />
        ))}
        {Object.entries(m.by_stage)
          .filter(([, n]) => n)
          .map(([k, n]) => (
            <Row key={k} icon="package" color="#8e8e93" t={STAGE_LABEL[k] ?? k} val={num(n)} />
          ))}
      </div>
      <p className="mx-4 mt-3 mb-8 text-xs text-hint">
        <Icon name="info" /> {d.period.from.split("-").reverse().join(".")} – {d.period.to.split("-").reverse().join(".")} · raqamlar CRM, Ombor va Marketplace bo&apos;limlaridagi bilan bir xil.
      </p>
    </>
  );
}
