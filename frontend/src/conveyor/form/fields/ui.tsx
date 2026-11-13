// Forma atomlari (faqat ko'rinish): yorliq (+izoh), son maydoni qobig'i (yorliq, maydon, birlik, xabar), segment tanlovi,
// faqat-o'qish qatori, maydon xabarlari.
import type { ReactNode } from "react";

import { c } from "@/conveyor/kit";
import { hapticSelect } from "@/shared/telegram/telegram";

export function Label({ label, hint }: { label: string; hint?: string }) {
  return (
    <label>
      {label}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

/** son maydoni qobig'i: yorliq (+izoh), maydon, birlik, xabar (FNum, FX) */
export function NumShell({ f, label, unit, hint, cls, msg, children }: { f: string; label: string; unit: string; hint: string; cls?: string; msg?: ReactNode; children: ReactNode }) {
  return (
    <div className={c("field", cls)} data-f={f}>
      <Label label={label} hint={hint} />
      {children}
      <span className={c("u")}>{unit}</span>
      {msg}
    </div>
  );
}

/** Maydonga tegishli xato / ogohlantirish matnlari — maydonning o'zi ostida */
export function FieldMsgView({ k, list }: { k: string; list: { error: boolean; text: string }[] }) {
  if (!list.length) return null;
  return (
    <>
      {list.map((i, n) => (
        <div key={n} className={c("fmsg", i.error && "e")} data-msg={k}>
          {i.text}
        </div>
      ))}
    </>
  );
}

/** segment tanlovi: value — joriy variant, onPick — tanlanganda (haptic shu yerda — bosishga javob) */
export function Seg({ seg, label, opts, value, onPick }: { seg: string; label: string; opts: [string, string][]; value: string; onPick: (v: string) => void }) {
  return (
    <div className={c("field col")}>
      <label>{label}</label>
      <div className={c("seg")} data-seg={seg} role="group" aria-label={label}>
        {opts.map(([v, l]) => (
          <button
            key={v}
            data-v={v}
            aria-pressed={value === v}
            className={value === v ? c("on") : undefined}
            onClick={() => {
              onPick(v);
              hapticSelect();
            }}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FRo({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <div className={c("field")}>
      <label>{label}</label>
      <span className={c("ro")} id={id}>
        {value}
      </span>
    </div>
  );
}
