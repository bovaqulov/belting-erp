// Bitim belgilari (faqat ko'rinish): mas'ul avatari, keyingi vazifa, teglar.
import { dt } from "@/erp/kit/fmt";
import { hue, initials, isLate, type Deal } from "@/erp/crm/lib";

const TSK = "whitespace-nowrap rounded-md px-1.5 py-px tabular-nums";

/** Avatar: bosh harflar, ismga bog'liq doimiy rang */
export const AvaView = ({ name }: { name: string }) => (
  <span className="inline-grid size-[22px] flex-none place-items-center rounded-full align-middle text-[10px] font-semibold text-white" style={{ background: hue(name) }} title={name} aria-hidden="true">
    {initials(name)}
  </span>
);

export function TaskBadge({ d }: { d: Deal }) {
  return d.next_task ? (
    <span className={`${TSK} ${isLate(d.next_task) ? "bg-danger/15 text-danger" : "bg-fill text-hint"}`}>⏰ {dt(d.next_task)}</span>
  ) : (
    <span className={`${TSK} bg-warn/15 text-warn`} title="Rejalashtirilgan ish yo'q">
      vazifa yo&apos;q
    </span>
  );
}

export const Tags = ({ d }: { d: Deal }) => (
  <>
    {(d.tags || []).map((t) => (
      <span key={t} className="ml-1 inline-block rounded-md bg-link/14 px-1.5 text-[11px] text-link">
        {t}
      </span>
    ))}
  </>
);
