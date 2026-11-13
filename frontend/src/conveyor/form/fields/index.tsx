"use client";
// Lenta formasi maydonlari — Lenta holatiga bog'langan: qiymat S dan har chizishda yoziladi (fokusdagisidan tashqari — eski
// syncForm), o'zgarish L.onField / L.onX / L.set ga. Ko'rinish atomlari — ./ui.
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

import { c, Icon } from "@/conveyor/kit";
import { num } from "@/conveyor/lib/format";
import { COND, fieldText, segParse, segValue, xText, type CondKey, type IssueMarks } from "@/conveyor/lib/logic";
import type { LentaState } from "@/conveyor/lib/types";
import { useLenta } from "@/conveyor/model";
import { openPicker } from "@/conveyor/picker";

import { FieldMsgView, Label, NumShell, Seg } from "./ui";

export { FRo, Label, Seg } from "./ui";

/** Enter (telefonda "Tayyor") — maydondan chiqadi: klaviatura yopiladi, qiymat formatlanadi */
export const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.currentTarget.blur();
};

/** fokusda bo'lmasa — qiymatni yozadi (eski syncForm) */
export function useSynced(ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>, text: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el !== document.activeElement && el.value !== text) el.value = text;
  });
}

export const fieldCls = (m: IssueMarks, k: string) => (m.fields[k] || []).join(" ");

/** Maydonga tegishli xato / ogohlantirish matni — maydonning o'zi ostida (rangli hoshiya nimani anglatishi shu yerda yoziladi;
 *  mobil tartibda umumiy ro'yxat chizma ustida, forma esa pastda). */
export function FieldMsg({ k }: { k: string }) {
  const L = useLenta();
  const list = (L.LAST.issues || []).filter((i) => i.field === k);
  return <FieldMsgView k={k} list={list.map((i) => ({ error: i.level === "error", text: L.LANG === "ru" ? i.ru || i.message : i.message }))} />;
}

export function FNum({ k, label, unit = "mm", hint = "", m }: { k: string; label: string; unit?: string; hint?: string; m: IssueMarks }) {
  const L = useLenta();
  const ref = useRef<HTMLInputElement>(null);
  useSynced(ref, fieldText(k, "num", L.S as LentaState));
  return (
    <NumShell f={k} label={label} unit={unit} hint={hint} cls={fieldCls(m, k)} msg={<FieldMsg k={k} />}>
      <input
        ref={ref}
        data-k={k}
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        aria-label={`${label}, ${unit}`}
        onInput={(e) => L.onField(k, num(e.currentTarget.value))}
        onKeyDown={blurOnEnter}
      />
    </NumShell>
  );
}

export function FX({ x, label, unit = "mm", hint = "" }: { x: string; label: string; unit?: string; hint?: string }) {
  const L = useLenta();
  const ref = useRef<HTMLInputElement>(null);
  useSynced(ref, xText(x, L.S as LentaState));
  // eski: "change" hodisasi (fokusdan chiqqanda / Enter) — React onChange esa har harfda
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => L.onX(x, num(el.value));
    el.addEventListener("change", on);
    return () => el.removeEventListener("change", on);
  }, [L, x]);
  return (
    <NumShell f={x} label={label} unit={unit} hint={hint} msg={<FieldMsg k={x} />}>
      <input ref={ref} data-x={x} inputMode="decimal" autoComplete="off" enterKeyHint="done" aria-label={`${label}, ${unit}`} onKeyDown={blurOnEnter} />
    </NumShell>
  );
}

export function FTxt({ k, label, ph = "", mode = "text", m }: { k: string; label: string; ph?: string; mode?: "text" | "tel"; m: IssueMarks }) {
  const L = useLenta();
  const ref = useRef<HTMLInputElement>(null);
  useSynced(ref, fieldText(k, "str", L.S as LentaState));
  return (
    <div className={c("field col", fieldCls(m, k))}>
      <label>{label}</label>
      <input
        ref={ref}
        className={c("wide")}
        data-k={k}
        placeholder={ph}
        inputMode={mode}
        autoComplete="off"
        enterKeyHint="done"
        aria-label={label}
        onInput={(e) => L.onField(k, e.currentTarget.value)}
        onKeyDown={blurOnEnter}
      />
      <FieldMsg k={k} />
    </div>
  );
}

export function Sw({ k, label }: { k: string; label: string }) {
  const L = useLenta();
  return (
    <input
      type="checkbox"
      role="switch"
      className={c("sw")}
      data-k={k}
      aria-label={label}
      checked={!!(L.S as LentaState)[k]}
      onChange={(e) => L.onField(k, e.currentTarget.checked)}
    />
  );
}

export function FSw({ k, label, hint = "", m }: { k: string; label: string; hint?: string; m: IssueMarks }) {
  return (
    <div className={c("field", fieldCls(m, k))}>
      <Label label={label} hint={hint} />
      <Sw k={k} label={label} />
      <FieldMsg k={k} />
    </div>
  );
}

export function FPick({ k, label, m }: { k: string; label: string; m: IssueMarks }) {
  const L = useLenta();
  return (
    <div className={c("field", fieldCls(m, k))} data-f={k}>
      <label style={{ flex: "none", maxWidth: "40%" }}>{label}</label>
      <button className={c("pick")} data-pick={k} aria-haspopup="dialog" aria-label={`${label}: ${((L.S as LentaState)[k] as string) || "—"}`} onClick={() => openPicker(L, k)}>
        <span>{((L.S as LentaState)[k] as string) || "—"}</span>
        <Icon name="chevrons-up-down" />
      </button>
      <FieldMsg k={k} />
    </div>
  );
}

/** S[k] ga bog'langan segment */
export function FSeg({ k, label, opts }: { k: string; label: string; opts: [string, string][] }) {
  const L = useLenta();
  return <Seg seg={k} label={label} opts={opts} value={segValue(k, L.S as LentaState)} onPick={(v) => L.onField(k, segParse(k, v))} />;
}

/** eski wrap(cond, html) — data-if: shart bajarilmasa .hide */
export function Wrap({ cond, children }: { cond: CondKey; children: ReactNode }) {
  const L = useLenta();
  return <div className={COND[cond](L.S as LentaState) ? undefined : c("hide")}>{children}</div>;
}

