// Accounting ko'rinish konstantalari (Tailwind utility sinflari) — bir nechta qismda takrorlanadiganlari.

/** Filtr qatori: telefonda ustma-ust, kompyuterda bir qatorda; balandlik 40px (telefonda 44px) */
export const FILT =
  "mx-4 mt-2.5 flex flex-wrap items-center gap-2 [&_.search]:!m-0 [&_.search]:!h-10 [&_.search]:flex-[1_1_260px] [&_.sel]:!h-10 [&_.sel]:flex-[1_1_140px] [&_.b.pri]:!h-10 [&_.b.pri]:flex-none max-[599px]:[&_.b.pri]:flex-[1_1_100%] coarse:[&_.search]:!h-11 coarse:[&_.sel]:!h-11 coarse:[&_.b.pri]:!h-11";
/** Ro'yxat ustidagi soni ("12 ta tovar") */
export const CNT = "sf !pt-2.5 pb-1.5 tabular-nums";
/** Formada ikki ustunli maydonlar (List cls) */
export const TWO =
  "grid grid-cols-2 [&>.field+.field]:before:!hidden [&>.field:nth-child(n+3)]:border-t [&>.field:nth-child(n+3)]:border-sep [&>.field:nth-child(odd)]:border-r [&>.field:nth-child(odd)]:border-sep";
/** Tovar turi nishoni rangi */
export const KIND_CLS: Record<string, string> = { material: "text-st-work", product: "text-st-done", goods: "text-st-new" };
