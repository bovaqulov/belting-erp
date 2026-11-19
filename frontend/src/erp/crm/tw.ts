// CRM ko'rinish konstantalari (Tailwind utility sinflari) — erp_crm.html uslubidan. Telefon — max-md (<768px),
// planshet — max-[900px], qo'lqop/sensor — coarse: (bosish maydoni ≥44px). Bir martalik uslub — joyida, JSX'da.

/** Sahifa: butun ekran, ichida aylanadigan qismlar (kanban, jadval, panel) */
export const ROOT = "flex h-screen h-dvh flex-col overflow-hidden bg-page text-sm coarse:[&_.ck]:size-[26px]";
/** Bo'sh joy (qatorni o'ngga suradi) */
export const SP = "flex-1";
/** Ikkinchi darajali matn (soni, izoh) */
export const SUM = "text-[13px] text-hint";
/** Kichik izoh (12px) */
export const SMALL = "text-xs text-hint";
/** Asosiy maydon: sarlavha ostidagi qolgan balandlik */
export const MAIN = "relative flex min-h-0 flex-1 flex-col [&>.empty]:flex-none [&>.skel]:flex-none";

// ---------------------------------------------------------------- sarlavha va asboblar paneli
/** Sarlavha; ostida ikkinchi qator (HDR2, data-hdr2) bo'lmasa — pastki chiziq */
export const HDR =
  "flex-none bg-sec px-5 pt-2 max-md:px-3 max-md:pt-1.5 [&:not(:has(+[data-hdr2]))]:border-b [&:not(:has(+[data-hdr2]))]:border-sep [&:not(:has(+[data-hdr2]))]:pb-2";
export const HDR2 = "flex-none border-b border-sep bg-sec px-5 max-md:px-3";
export const HROW = "flex min-w-0 items-center gap-2.5 max-md:gap-1.5";
export const SCROLL_X = "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
/** Asboblar paneli: qidiruv, filtrlar, ko'rinish; `in` — panel ichida (tepasiz) */
export const TB = "flex min-w-0 flex-wrap items-center gap-2 pt-2 pb-2.5 max-md:gap-1.5";
export const TB_IN = `${TB} !pt-0 max-md:[&>.grp]:w-full max-md:[&>.grp_.b]:flex-[1_0_auto] max-md:[&>.sel]:flex-[1_1_160px]`;
/** Qidiruv maydoni (ikonka ichida) */
export const SRCH =
  "relative min-w-0 max-md:flex-[1_1_160px] [&_svg.i]:pointer-events-none [&_svg.i]:absolute [&_svg.i]:top-1/2 [&_svg.i]:left-[9px] [&_svg.i]:size-[18px] [&_svg.i]:-translate-y-1/2 [&_svg.i]:text-hint [&_.inp]:w-[300px] [&_.inp]:pl-8 max-[900px]:[&_.inp]:w-[220px] max-md:[&_.inp]:w-full";

// ---------------------------------------------------------------- jadval (kompyuter) → kartochkalar (telefon)
export const PANE = "min-h-0 flex-1 overflow-auto px-5 pt-3.5 pb-10 max-md:px-3 max-md:pt-2.5 max-md:pb-24";
/** Jadval: kompyuterda — yopishqoq sarlavha; telefonda — har qator kartochka, katak nomi data-l dan */
export const RT = [
  "w-full border-separate border-spacing-0 rounded-[10px] bg-sec",
  "[&_th]:sticky [&_th]:-top-3.5 [&_th]:z-1 [&_th]:border-b [&_th]:border-sep [&_th]:bg-sec [&_th]:px-2.5 [&_th]:py-[9px] [&_th]:text-left [&_th]:text-[12.5px] [&_th]:font-semibold [&_th]:whitespace-nowrap [&_th]:text-hint [&_th]:select-none",
  "[&_th:first-child]:rounded-tl-[10px] [&_th:last-child]:rounded-tr-[10px]",
  "[&_td]:border-b [&_td]:border-sep [&_td]:px-2.5 [&_td]:py-2 [&_td]:align-middle",
  "max-md:block max-md:bg-transparent max-md:[&_tbody]:block max-md:[&_thead]:hidden",
  "max-md:[&_tr]:relative max-md:[&_tr]:mb-2 max-md:[&_tr]:block max-md:[&_tr]:rounded-xl max-md:[&_tr]:bg-sec max-md:[&_tr]:px-3.5 max-md:[&_tr]:py-2.5",
  "max-md:[&_td]:flex max-md:[&_td]:min-w-0 max-md:[&_td]:items-center max-md:[&_td]:justify-between max-md:[&_td]:gap-3 max-md:[&_td]:border-0 max-md:[&_td]:px-0 max-md:[&_td]:py-[3px] max-md:[&_td]:text-right max-md:[&_td:empty]:hidden",
  "max-md:[&_td[data-l]]:before:flex-none max-md:[&_td[data-l]]:before:text-left max-md:[&_td[data-l]]:before:text-[12.5px] max-md:[&_td[data-l]]:before:text-hint max-md:[&_td[data-l]]:before:content-[attr(data-l)]",
].join(" ");
/** Raqam katagi */
export const TN = "text-right whitespace-nowrap tabular-nums max-md:whitespace-normal";
/** Kartochkaning sarlavha katagi (telefon) */
export const TTL = "max-md:!block max-md:pr-10 max-md:!text-left max-md:text-[15px]";
/** Belgilash katagi (telefonda — o'ng yuqori burchakda) */
export const TCK = "max-md:absolute max-md:top-1 max-md:right-2 max-md:size-11 max-md:!justify-center max-md:!p-0 max-md:[&+td]:pr-12";
/** Amallar katagi */
export const TACTS = "whitespace-nowrap [&_.b+.b]:ml-1.5 max-md:!justify-end max-md:flex-wrap max-md:!pt-2";
/** Bosiladigan qator; tanlangan */
export const TR = "cursor-pointer hover:[&>td]:bg-fill max-md:hover:[&>td]:bg-transparent";
export const TR_SEL = "[&>td]:bg-link/9 max-md:[&>td]:bg-transparent max-md:shadow-[inset_0_0_0_2px_var(--link)]";
/** Yakuniy qator */
export const TOT = "[&>td]:border-b-0";

// ---------------------------------------------------------------- belgilar
export const PILL = "inline-flex items-center gap-[5px] whitespace-nowrap rounded-[10px] bg-fill px-2 py-0.5 text-xs [&_i]:inline-block [&_i]:size-2 [&_i]:rounded-full";
export const WHO = "inline-flex items-center gap-1.5";
/** Harakatsizlik (kun): sariq; `bad` — qizil */
export const idle = (bad: boolean) => (bad ? "font-semibold text-danger" : "text-warn");
/** Matn tugmasi (kompyuterda havola kabi) */
export const LINKB = "cursor-pointer border-0 bg-transparent p-2 text-link coarse:min-h-11";
/** Yopish (×) tugmasi */
export const X = "grid min-h-[34px] min-w-[34px] cursor-pointer place-items-center rounded-md border-0 bg-transparent p-1.5 text-hint hover:bg-fill coarse:min-h-11 coarse:min-w-11 [&_svg.i]:size-[22px]";
/** Qoldiq belgisi: bor / yo'q */
export const stk = (ok: boolean | null) => `text-[11.5px] ${ok === null ? "" : ok ? "text-ok" : "text-danger"}`;

// ---------------------------------------------------------------- bitim paneli
export const BOX = "mb-3.5 rounded-[10px] bg-sec";
export const BOX_H = "m-0 flex justify-between px-3.5 pt-[11px] pb-1.5 text-xs tracking-[.02em] text-hint uppercase";
/** Maydon qatori: chapda nom, o'ngda tahrirlanadigan qiymat (ramkasiz, hover/fokusda ramka) */
export const FR = [
  "grid min-h-[34px] grid-cols-[110px_minmax(0,1fr)] items-center gap-2 px-3.5 py-1.5 max-md:grid-cols-[104px_minmax(0,1fr)] max-md:px-3 max-md:py-1",
  "[&>span]:text-[13px] [&>span]:text-hint",
  "[&_:is(input:not(.ck),select,textarea)]:w-full [&_:is(input:not(.ck),select,textarea)]:rounded-md [&_:is(input:not(.ck),select,textarea)]:border [&_:is(input:not(.ck),select,textarea)]:border-transparent [&_:is(input:not(.ck),select,textarea)]:bg-transparent [&_:is(input:not(.ck),select,textarea)]:px-[7px] [&_:is(input:not(.ck),select,textarea)]:py-[5px] [&_:is(input:not(.ck),select,textarea)]:text-fg [&_:is(input:not(.ck),select,textarea)]:outline-none [&_:is(input:not(.ck),select,textarea)]:[font:inherit]",
  "[&_:is(input:not(.ck),select,textarea):hover]:border-sep [&_:is(input:not(.ck),select,textarea):focus]:border-link [&_:is(input:not(.ck),select,textarea):focus]:bg-page",
  "[&_textarea]:min-h-14 [&_textarea]:resize-y max-md:[&_:is(input:not(.ck),select)]:min-h-11",
].join(" ");
export const FR_TOP = "!items-start [&>span]:pt-1.5";
/** Bog'liq yozuv qatori (kontakt, kompaniya) */
export const DLR = "flex min-h-11 items-center gap-2 border-t border-sep px-3.5 py-[7px] [&_.m]:min-w-0 [&_.m]:flex-1";
export const DLR_TAP = "cursor-pointer hover:bg-fill";
export const BTNROW = "flex flex-wrap gap-2 px-3.5 pt-2.5 pb-3";
