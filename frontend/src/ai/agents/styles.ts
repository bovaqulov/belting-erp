// Agent oynasi va muharriri: ikonka/rang tanlash, vosita qatori, huquqlar, jadval holati — Tailwind utility sinflari.
// Holat belgisi: cx(a.st, a.new | a.work | a.done | a.bad | a.off).
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const a = {
  picker: "grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-2 px-4 py-3",
  /** ikonka tugmasi; tanlangani — rang (--c) foni */
  pick: `grid aspect-square min-h-11 w-full cursor-pointer place-items-center rounded-[10px] border-0 bg-[rgba(127,127,127,.12)] p-0 text-fg aria-pressed:bg-(--c,var(--btn)) aria-pressed:text-white [&_svg]:size-5 ${FOCUS}`,
  /** rang doirasi; tanlanganida — belgi */
  swatch: `grid aspect-square min-h-11 w-full cursor-pointer place-items-center rounded-full border-0 bg-(--c) p-0 text-white aria-[pressed=false]:[&_svg]:hidden [&_svg]:size-[18px] ${FOCUS}`,
  tool: "!items-start",
  desc: "mt-0.5 text-[13px] leading-[1.35] whitespace-normal text-sub",
  risky: "text-danger",
  code: "font-mono",
  persona: "block min-h-[140px] !px-4 !py-3 leading-[1.45]",
  errs: "mx-4 mt-3.5 rounded-[10px] bg-danger/12 px-3.5 py-2.5 text-sm leading-[1.4] text-danger [&_p]:m-0 [&_p+p]:mt-1",
  /** huquqlar: soha yorlig'i (nom + izoh) */
  scLabel: "flex !min-w-32 flex-col leading-[1.25] [&_small]:text-xs [&_small]:text-hint [&_small]:opacity-85",
  chipsIn: "flex flex-wrap gap-1.5 px-4 py-3",
  /** yoqib-o'chiriladigan chip (bo'lim, hafta kuni) */
  toggle: `inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-[18px] border border-line bg-transparent px-3 py-1.5 text-sm text-fg aria-pressed:border-btn aria-pressed:bg-btn aria-pressed:text-btn-fg [&_svg]:size-3.5 ${FOCUS}`,
  st: "inline-flex flex-none items-center gap-[5px] rounded-md px-2 py-0.5 text-xs font-semibold before:size-1.5 before:rounded-full before:bg-current before:content-['']",
  new: "bg-[rgba(62,136,247,.14)] text-[#3e88f7]",
  work: "bg-[rgba(232,150,31,.14)] text-[#e8961f]",
  done: "bg-ok/14 text-ok",
  bad: "bg-danger/14 text-danger",
  off: "bg-[rgba(127,127,127,.14)] text-hint",
  /** hafta kunlari — teng kenglikdagi tugmalar */
  days: "flex gap-1.5 px-4 py-2.5 [&>button]:min-w-0 [&>button]:flex-1 [&>button]:justify-center [&>button]:px-0",
  kindTag: "text-[11px] text-hint",
} as const;

export default a as typeof a & Record<string, string | undefined>;
