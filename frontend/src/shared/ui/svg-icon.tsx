// Lucide ikonka chizuvchisi (butun loyiha): [teg, atributlar] ro'yxati → <svg>. To'plam — @/shared/icons/lucide.
import { createElement } from "react";

export type IconEl = [tag: string, attrs: Record<string, string>];
export type IconSet = Record<string, IconEl[]>;

/** noma'lum nom → fallback (panel "folder", lenta "info", ERP "file"); hidden — bezak ikonka (aria-hidden) */
export function SvgIcon({ set, name, fallback, className, hidden }: { set: IconSet; name: string; fallback: string; className?: string; hidden?: boolean }) {
  const els = set[name] || set[fallback];
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={hidden || undefined}
    >
      {els.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** DOM'ga satr sifatida (React'dan tashqari: toast) — o'sha to'plamdan, atributlar ekranlangan */
export function svgMarkup(els: IconEl[], className = ""): string {
  const inner = els.map(([tag, a]) => `<${tag}${Object.entries(a).map(([k, v]) => ` ${k}="${esc(v)}"`).join("")}/>`).join("");
  return `<svg class="${esc(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
