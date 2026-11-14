// Kunlik hisobot formasi (eski report.html uslubi) — Tailwind utility sinflari. Ranglar — umumiy tokenlar (--bg2, --border).
const r = {
  main: "mx-auto max-w-[520px] px-4 pt-4 pb-[calc(24px+env(safe-area-inset-bottom))]",
  h1: "m-0 text-[19px] font-bold [overflow-wrap:anywhere]",
  hint: "mt-0.5 mb-3.5 text-[13px] text-hint",
  label: "mt-3 mb-[5px] block text-sm",
  input:
    "w-full rounded-xl border border-edge bg-bg2 px-3 py-[11px] text-base text-fg outline-none focus:border-btn [textarea&]:block [textarea&]:min-h-[90px] [textarea&]:resize-y",
  money: "mt-[3px] min-h-[15px] text-xs text-hint",
  button: "mt-[18px] w-full cursor-pointer rounded-xl border-0 bg-btn p-[13px] text-base font-semibold text-btn-fg disabled:cursor-default disabled:opacity-60",
  ferr: "mt-3.5 rounded-xl bg-danger/12 px-3 py-2.5 text-sm text-danger [overflow-wrap:anywhere]",
  retry: "mx-auto mt-3.5 block cursor-pointer rounded-full border border-edge bg-bg2 px-4 py-2 text-sm text-btn",
  msg: "py-[30px] text-center text-hint",
  /** xato xabari (msg bilan birga) */
  err: "!text-danger",
  nav: "mb-3.5 flex flex-wrap gap-2 [&_a]:rounded-full [&_a]:border [&_a]:border-edge [&_a]:bg-bg2 [&_a]:px-3.5 [&_a]:py-[9px] [&_a]:text-[13px] [&_a]:text-btn [&_a]:no-underline",
} as const;

export default r;
