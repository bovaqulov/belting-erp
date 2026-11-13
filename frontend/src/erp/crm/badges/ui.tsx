// Bitim belgilari (faqat ko'rinish): mas'ul avatari, keyingi vazifa, teglar.
import { dt } from "@/erp/kit/fmt";
import { hue, initials, isLate, type Deal } from "@/erp/crm/lib";

/** Avatar: bosh harflar, ismga bog'liq doimiy rang */
export const AvaView = ({ name }: { name: string }) => (
  <span className="ava" style={{ background: hue(name) }} title={name} aria-hidden="true">
    {initials(name)}
  </span>
);

export function TaskBadge({ d }: { d: Deal }) {
  return d.next_task ? (
    <span className={`tsk ${isLate(d.next_task) ? "late" : ""}`}>⏰ {dt(d.next_task)}</span>
  ) : (
    <span className="tsk none" title="Rejalashtirilgan ish yo'q">
      vazifa yo&apos;q
    </span>
  );
}

export const Tags = ({ d }: { d: Deal }) => (
  <>
    {(d.tags || []).map((t) => (
      <span key={t} className="tag2">
        {t}
      </span>
    ))}
  </>
);
