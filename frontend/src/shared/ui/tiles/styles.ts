// Bo'lim/modul kartochkalari to'ri (bosh sahifa, ERP bosh sahifasi, Accounting hub) — Tailwind utility sinflari.
// Kartochka rangi — --c (style bilan). Hali ko'chirilmagan modul: card + soon (bosilmaydi, "Tez orada" belgisi).
const t = {
  grid: "mx-4 mt-4 grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 min-[560px]:gap-4",
  card: "tl-card flex min-w-0 flex-col overflow-hidden rounded-2xl bg-sec text-inherit no-underline transition-transform duration-[120ms] active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus reduce:transition-none",
  /** hali ko'chirilmagan modul */
  soon: "cursor-default [&_.tl-art]:relative [&_.tl-art_svg]:opacity-70 [&_.tl-art_svg]:saturate-[.45]",
  art: "tl-art grid h-[104px] place-items-center bg-[color-mix(in_srgb,var(--c)_14%,var(--sec))] text-(--c) min-[560px]:h-[124px] [&_svg]:h-[84%] [&_svg]:w-[78%] [&_svg]:max-w-[168px]",
  body: "min-w-0 px-3 pt-2.5 pb-3.5",
  title: "flex items-center gap-1.5 text-base leading-[1.25] font-semibold [&_span]:min-w-0 [&_span]:truncate",
  sub: "mt-1 line-clamp-3 text-[13px] leading-[1.35] text-sub",
  /** "Tez orada" belgisi */
  badge: "absolute top-2 right-2 rounded-full bg-sub/16 px-[7px] py-1 text-[11px] leading-none font-semibold text-sub",
  /** rasm ichidagi "qog'oz" (kartochka foni rangida) */
  paper: "fill-sec",
  paperStroke: "stroke-sec",
} as const;

export default t;
