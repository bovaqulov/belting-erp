// Kichik UI elementlari (bitta joyda — panellar bir xil ko'rinsin).
import { useState, type ReactNode } from "react";

export function Section({ title, children, right, open: init = true }: { title: string; children: ReactNode; right?: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(init);
  return (
    <section className="gm-sec">
      <header>
        <button type="button" className="gm-sec-t" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className={open ? "gm-caret open" : "gm-caret"} aria-hidden>›</span>
          {title}
        </button>
        {right}
      </header>
      {open && <div className="gm-sec-b">{children}</div>}
    </section>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, small }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div className={small ? "gm-seg small" : "gm-seg"} role="radiogroup">
      {options.map((o) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={o.v === value} className={o.v === value ? "on" : ""} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="gm-toggle">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="gm-switch" aria-hidden />
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export function Chips({ options, value, onChange, max = 60 }: { options: { v: string; label: string; n?: number; color?: string }[]; value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const [q, setQ] = useState("");
  const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase())).slice(0, max);
  return (
    <div className="gm-chips">
      {options.length > 12 && <input className="gm-input small" placeholder="Qidirish…" value={q} onChange={(e) => setQ(e.target.value)} />}
      <div className="gm-chips-list">
        {shown.map((o) => {
          const on = value.includes(o.v);
          return (
            <button key={o.v} type="button" aria-pressed={on} className={on ? "gm-chip on" : "gm-chip"} onClick={() => onChange(on ? value.filter((x) => x !== o.v) : [...value, o.v])}>
              {o.color && <i style={{ background: o.color }} />}
              {o.label}
              {o.n !== undefined && <em>{o.n}</em>}
            </button>
          );
        })}
        {q && !shown.length && <span className="gm-muted small">Topilmadi</span>}
      </div>
    </div>
  );
}

/** `label` — faqat belgi (×, ↶) ko'rsatadigan tugmalar uchun ekran o'quvchi nomi. */
export function Btn({ children, onClick, kind = "plain", disabled, title, label, type = "button" }: { children: ReactNode; onClick?: () => void; kind?: "plain" | "primary" | "danger" | "ghost"; disabled?: boolean; title?: string; label?: string; type?: "button" | "submit" }) {
  return (
    <button type={type} className={`gm-btn ${kind}`} onClick={onClick} disabled={disabled} title={title ?? label} aria-label={label}>
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="gm-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="gm-stat">
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function Bars({ rows, fmt }: { rows: { label: string; value: number; color?: string; sub?: string }[]; fmt: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="gm-bars">
      {rows.map((r, i) => (
        <div key={`${i}:${r.label}`} className="gm-bar">
          <span title={r.label}>{r.label}</span>
          <div>
            <i style={{ width: `${(100 * r.value) / max}%`, background: r.color }} />
          </div>
          <b>{fmt(r.value)}</b>
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="gm-empty">{children}</p>;
}

/** Kichik aylanuvchi ko'rsatkich (uzoq so'rov ketayotganda). */
export function Spin() {
  return <span className="gm-spin small" aria-hidden />;
}
