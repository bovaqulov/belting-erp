// Panel UI to'plami (Jarvis, ERP bosh sahifasi, logistika) — admin.html uslubi, Tailwind utility sinflari bilan.
// Ishlatish: className={s.item}, cx(s.btn, s.sec). Har kalit = `pn-<kalit>` belgisi + utility'lar:
//  - mustaqil uslub (list, item, btn …) — o'z satrida;
//  - modifikator (on, sec, danger, tap, plain, sm, head, …) — faqat belgi; uslubni asosiy kalit beradi: [&.pn-on]:…
//  - ichki qism (t, s, off …) — faqat belgi; ota beradi: [&_.pn-t]:…
// Telefon — max-[641px] (≤640px).

const m = (k: string, u = "") => (u ? `pn-${k} ${u}` : `pn-${k}`);

/** fokus halqasi (ichkariga) */
const FOCUS = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";
/** havola rangidagi kulrang fon (tugma, chip) */
const GREY = "bg-[rgba(127,127,127,.14)]";

const s = {
  // ---------------------------------------------------------------- karkas
  wrap: m("wrap", "mx-auto max-w-[720px]"),
  /** ko'rish rejimi: o'zgartirish tugmalari yashirin */
  ro: m(
    "ro",
    "[&_#grebuild]:!hidden [&_#kadd]:!hidden [&_#kext]:!hidden [&_#save]:!hidden [&_.pn-danger]:!hidden [&_.pn-fab]:!hidden [&_.pn-irev]:!hidden [&_.pn-kdel]:!hidden [&_.pn-kno]:!hidden [&_.pn-kok]:!hidden [&_.pn-mdel]:!hidden [&_.pn-mini-btn]:!hidden [&_.pn-mno]:!hidden [&_.pn-mok]:!hidden [&_.pn-papprove]:!hidden [&_.pn-preject]:!hidden [&_.pn-tno]:!hidden [&_.pn-tok]:!hidden [&_[data-act]]:!hidden [&_button.pn-lnk]:!hidden [&_.pn-vplay_.pn-mini-btn]:!inline-flex",
  ),
  top: m(
    "top",
    "sticky top-0 z-10 border-b border-sep bg-sec/86 backdrop-blur-[14px] backdrop-saturate-180 max-[641px]:[&_.pn-tabs]:hidden",
  ),
  bar: m(
    "bar",
    "flex items-center gap-3 px-4 py-2.5 min-[641px]:pt-3 max-[641px]:gap-2 max-[641px]:pr-2.5 max-[641px]:[&_.pn-icon-btn+.pn-icon-btn]:-ml-1.5 [&_h1]:m-0 [&_h1]:text-base [&_h1]:leading-[1.2] [&_h1]:font-semibold [&_h1_.pn-brand]:mt-0.5 [&_h1_.pn-brand]:mb-1 [&_p]:mt-px [&_p]:mb-0 [&_p]:truncate [&_p]:text-[13px] [&_p]:text-hint",
  ),
  logo: m("logo", "grid size-[38px] flex-none place-items-center rounded-full bg-[linear-gradient(135deg,#6ab3f3,#5288c1)] text-white shadow-[0_2px_8px_rgba(82,136,193,.35)] [&_svg.i]:size-5"),
  /** firma logosi (public/brand) — niqob orqali: rangi matn rangidan */
  brand: m(
    "brand",
    "block aspect-[411/60] h-[22px] flex-none bg-fg [mask:url(/app/brand/belting-rezina.png)_center/contain_no-repeat] [-webkit-mask:url(/app/brand/belting-rezina.png)_center/contain_no-repeat]",
  ),
  sr: m("sr", "sr-only"),
  ttl: m("ttl", "min-w-0"),
  sp: m("sp", "flex-1"),
  "icon-btn": m(
    "icon-btn",
    `grid size-9 flex-none cursor-pointer place-items-center rounded-full border-0 bg-transparent text-link hover:bg-[rgba(127,127,127,.12)] active:scale-[.92] [&.pn-spin_svg]:animate-[spin_.7s_linear] ${FOCUS}`,
  ),
  tabs: m(
    "tabs",
    `flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_button]:relative [&_button]:flex [&_button]:flex-none [&_button]:cursor-pointer [&_button]:items-center [&_button]:gap-[7px] [&_button]:rounded-[10px] [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-3 [&_button]:py-[7px] [&_button]:text-sm [&_button]:font-medium [&_button]:text-hint [&_button]:transition-colors [&_button:hover]:bg-[rgba(127,127,127,.1)] [&_button:hover]:text-fg [&_button.pn-on]:bg-accent/14 [&_button.pn-on]:text-accent [&_button_svg.i]:size-[18px] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:-outline-offset-2 [&_button:focus-visible]:outline-accent`,
  ),
  dot: m(
    "dot",
    "absolute top-[3px] left-[22px] box-content h-4 min-w-4 rounded-lg border-2 border-sec bg-danger px-1 text-center text-[10px] leading-4 font-bold text-white",
  ),
  /** telefon: pastki tab-panel (Telegram ilovasi kabi) */
  bnav: m(
    "bnav",
    "hidden max-[641px]:fixed max-[641px]:inset-x-0 max-[641px]:bottom-0 max-[641px]:z-10 max-[641px]:flex max-[641px]:border-t max-[641px]:border-sep max-[641px]:bg-sec/90 max-[641px]:px-1 max-[641px]:pt-1.5 max-[641px]:pb-[calc(6px+env(safe-area-inset-bottom))] max-[641px]:backdrop-blur-[14px] max-[641px]:backdrop-saturate-180 [&_button]:relative [&_button]:flex [&_button]:flex-1 [&_button]:cursor-pointer [&_button]:flex-col [&_button]:items-center [&_button]:gap-[3px] [&_button]:border-0 [&_button]:bg-transparent [&_button]:py-1 [&_button]:text-[10.5px] [&_button]:font-medium [&_button]:text-hint [&_button.pn-on]:text-accent [&_button_svg.i]:size-6 [&_.pn-dot]:top-0 [&_.pn-dot]:left-[calc(50%+4px)] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:-outline-offset-2 [&_button:focus-visible]:outline-accent",
  ),

  // ---------------------------------------------------------------- ro'yxatlar (Telegram sozlamalari uslubi)
  sh: m("sh", "px-8 pt-[22px] pb-[7px] text-[13px] font-medium tracking-[.02em] text-head uppercase"),
  sf: m("sf", "px-8 pt-[7px] text-[13px] text-hint"),
  list: m(
    "list",
    "mx-4 overflow-hidden rounded-xl bg-sec [&>.pn-item+.pn-item]:before:absolute [&>.pn-item+.pn-item]:before:top-0 [&>.pn-item+.pn-item]:before:right-0 [&>.pn-item+.pn-item]:before:left-[60px] [&>.pn-item+.pn-item]:before:border-t [&>.pn-item+.pn-item]:before:border-sep [&>.pn-item+.pn-item]:before:content-[''] [&.pn-plain>.pn-item+.pn-item]:before:left-4 [&>.pn-field+.pn-field]:before:absolute [&>.pn-field+.pn-field]:before:top-0 [&>.pn-field+.pn-field]:before:right-0 [&>.pn-field+.pn-field]:before:left-4 [&>.pn-field+.pn-field]:before:border-t [&>.pn-field+.pn-field]:before:border-sep [&>.pn-field+.pn-field]:before:content-['']",
  ),
  plain: m("plain"),
  item: m(
    "item",
    `relative flex min-h-[46px] items-center gap-3.5 px-4 py-2 [&.pn-tap]:cursor-pointer [&.pn-tap]:active:bg-[rgba(127,127,127,.12)] [&_.pn-t]:truncate [&_.pn-s]:truncate [&_.pn-s]:text-[13px] [&_.pn-s]:text-sub ${FOCUS}`,
  ),
  tap: m("tap"),
  main: m("main", "min-w-0 flex-1"),
  t: m("t"),
  s: m("s"),
  val: m("val", "flex-none text-[15px] text-hint"),
  chev: m("chev", "pointer-events-none flex-none text-hint opacity-60"),
  sq: m("sq", "grid size-[30px] flex-none place-items-center rounded-lg text-white [&_svg.i]:size-[18px]"),
  av: m(
    "av",
    "relative grid size-10 flex-none place-items-center rounded-full text-[15px] font-semibold text-white [&.pn-sm]:size-[30px] [&.pn-sm]:text-xs",
  ),
  sm: m("sm"),
  crown: m(
    "crown",
    "absolute -right-1 -bottom-[3px] grid size-[18px] place-items-center rounded-full border-2 border-sec bg-gold text-white [&_svg.i]:size-2.5 [&_svg.i]:stroke-3",
  ),
  /** rol / holat nishoni; rangi — modifikator (head, admin, owner, rahbar, employee, pending, archived, superseded, blocked, rejected, active) */
  badge: m(
    "badge",
    "flex-none rounded-md px-2 py-0.5 text-xs font-medium [&.pn-active]:bg-ok/15 [&.pn-active]:text-ok [&.pn-admin]:bg-[rgba(106,179,243,.16)] [&.pn-admin]:text-link [&.pn-archived]:bg-[rgba(127,127,127,.14)] [&.pn-archived]:text-hint [&.pn-blocked]:bg-danger/14 [&.pn-blocked]:text-danger [&.pn-employee]:bg-[rgba(127,127,127,.14)] [&.pn-employee]:text-hint [&.pn-head]:bg-gold/16 [&.pn-head]:text-gold [&.pn-owner]:bg-[rgba(106,179,243,.16)] [&.pn-owner]:text-link [&.pn-pending]:bg-warn/16 [&.pn-pending]:text-warn [&.pn-rahbar]:bg-[rgba(94,129,244,.18)] [&.pn-rahbar]:text-[#8ea6ff] [&.pn-rejected]:bg-danger/14 [&.pn-rejected]:text-danger [&.pn-superseded]:bg-[rgba(127,127,127,.14)] [&.pn-superseded]:text-hint",
  ),
  head: m("head"),
  admin: m("admin"),
  owner: m("owner"),
  rahbar: m("rahbar"),
  employee: m("employee"),
  pending: m("pending"),
  archived: m("archived"),
  superseded: m("superseded"),
  blocked: m("blocked"),
  rejected: m("rejected"),
  active: m("active"),
  perms: m("perms", "mt-[3px] inline-flex gap-1.5 text-gold [&_svg.i]:size-3.5 [&_.pn-off]:text-hint [&_.pn-off]:opacity-35"),
  off: m("off"),

  // ---------------------------------------------------------------- tugmalar
  btn: m(
    "btn",
    `flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border-0 bg-btn p-3 font-semibold text-btn-fg disabled:cursor-default disabled:opacity-55 [&.pn-danger]:!bg-danger/14 [&.pn-danger]:!text-danger [&.pn-sec]:!bg-[rgba(127,127,127,.15)] [&.pn-sec]:!text-fg ${FOCUS}`,
  ),
  sec: m("sec"),
  danger: m("danger"),
  lnk: m("lnk", `cursor-pointer border-0 bg-transparent py-1.5 text-link disabled:cursor-default disabled:opacity-55 [&.pn-danger]:!text-danger ${FOCUS}`),
  "mini-btn": m(
    "mini-btn",
    `cursor-pointer rounded-lg border-0 bg-btn px-2.5 py-1.5 text-sm text-btn-fg disabled:cursor-default disabled:opacity-55 [&.pn-danger]:!bg-danger/14 [&.pn-danger]:!text-danger [&.pn-sec]:!bg-[rgba(127,127,127,.15)] [&.pn-sec]:!text-fg ${FOCUS}`,
  ),
  fab: m("fab", `grid size-10 flex-none cursor-pointer place-items-center rounded-full border-0 bg-btn text-btn-fg shadow-[0_4px_14px_rgba(0,0,0,.3)] ${FOCUS}`),
  actions: m("actions", "mx-4 mt-[18px] flex gap-2.5"),
  toolbar: m("toolbar", "mx-4 mt-4 flex items-center gap-2.5"),
  // ko'rish rejimida yashiriladigan amallar (belgi)
  kok: m("kok"),
  kno: m("kno"),
  kdel: m("kdel"),
  irev: m("irev"),
  papprove: m("papprove"),
  preject: m("preject"),

  // ---------------------------------------------------------------- audit: ovozli xabarlar
  vst: m(
    "vst",
    "ml-1.5 rounded-md px-[7px] py-px align-[1px] text-[11px] [&.pn-verr]:bg-danger/14 [&.pn-verr]:text-danger [&.pn-vok]:bg-ok/15 [&.pn-vok]:text-ok [&.pn-vwarn]:bg-warn/16 [&.pn-vwarn]:text-warn",
  ),
  vok: m("vok"),
  vwarn: m("vwarn"),
  verr: m("verr"),
  vrow: m("vrow"),
  vtext: m("vtext", "mt-1 mb-0.5 text-sm leading-[1.4] whitespace-normal"),
  vplay: m("vplay", "mt-1.5 [&_.pn-mini-btn_svg]:size-3.5"),
  vbtn: m("vbtn"),

  // ---------------------------------------------------------------- graph (mobil)
  gstats: m(
    "gstats",
    "mx-4 mt-3.5 grid grid-cols-4 gap-px overflow-hidden rounded-xl bg-line [&>div]:bg-sec [&>div]:px-1 [&>div]:py-2.5 [&>div]:text-center [&_b]:block [&_b]:text-lg [&_span]:text-xs [&_span]:text-hint",
  ),
  gcard: m("gcard", "mx-4 mt-3 flex flex-col overflow-hidden rounded-[14px] bg-sec [&.pn-full]:fixed [&.pn-full]:inset-0 [&.pn-full]:z-60 [&.pn-full]:m-0 [&.pn-full]:rounded-none [&.pn-full_.pn-gnet]:h-auto [&.pn-full_.pn-gnet]:flex-1"),
  full: m("full"),
  gtop: m("gtop", "flex items-center gap-2 p-2.5"),
  gsearch: m("gsearch", `flex min-w-0 flex-1 items-center gap-1.5 rounded-[10px] ${GREY} px-2.5 [&_input]:py-2 [&_svg]:size-4 [&_svg]:flex-none [&_svg]:text-hint`),
  gsel: m("gsel", `!w-auto max-w-[34%] rounded-[10px] ${GREY} !px-2.5 !py-2`),
  gbtn: m("gbtn", `grid size-[38px] flex-none place-items-center rounded-[10px] border-0 ${GREY} text-fg disabled:cursor-default disabled:opacity-55 [&_svg]:size-[18px] ${FOCUS}`),
  gnet: m("gnet", "h-[58vh] min-h-[340px] touch-none overscroll-contain bg-[radial-gradient(circle_at_50%_40%,rgba(82,136,193,.10),transparent_70%)]"),
  gload: m("gload", "grid h-full place-items-center text-sm text-hint"),
  glegend: m(
    "glegend",
    "flex touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain border-t border-line px-2.5 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] [scrollbar-width:none] before:w-1.5 before:flex-none before:content-[''] after:w-1.5 after:flex-none after:content-[''] [&::-webkit-scrollbar]:hidden",
  ),
  gchip: m(
    "gchip",
    `flex flex-none items-center gap-1.5 rounded-[14px] border-0 ${GREY} px-2.5 py-1.5 text-[13px] text-fg [&_em]:text-hint [&_em]:not-italic [&_i]:size-[9px] [&_i]:rounded-full [&.pn-on]:!bg-accent [&.pn-on]:!text-white [&.pn-on_em]:text-white/80 ${FOCUS}`,
  ),
  gmore: m("gmore", "flex items-center justify-between px-3 py-2 text-xs opacity-85"),
  chips: m("chips", "flex flex-wrap gap-1.5 px-4 pt-1 pb-2"),
  chip: m("chip", "cursor-pointer rounded-[14px] bg-sec px-[11px] py-[5px] text-[13px] active:opacity-70"),

  // ---------------------------------------------------------------- bilimlar daraxti
  ktree: m("ktree", "py-1"),
  knode: m(
    "knode",
    "[&>summary]:flex [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:gap-2 [&>summary]:px-3.5 [&>summary]:py-[9px] [&>summary]:font-medium [&>summary::-webkit-details-marker]:hidden [&>summary_svg]:size-[18px] [&>summary_svg]:flex-none [&>summary_svg]:text-accent [&[open]>summary_svg]:opacity-85 [&>summary_em]:ml-auto [&>summary_em]:text-[13px] [&>summary_em]:text-hint [&>summary_em]:not-italic",
  ),
  kkids: m("kkids", "ml-4 border-l border-hint/30"),
  kdept: m("kdept", "[&>summary]:font-semibold [&>summary_.pn-dot]:static [&>summary_.pn-dot]:size-2.5 [&>summary_.pn-dot]:min-w-0 [&>summary_.pn-dot]:flex-none [&>summary_.pn-dot]:rounded-full [&>summary_.pn-dot]:border-0 [&>summary_.pn-dot]:p-0"),
  kdoc: m(
    "kdoc",
    "flex min-h-10 items-center gap-2 py-0.5 pr-1 pl-3.5 [&>svg]:size-4 [&>svg]:flex-none [&>svg]:text-hint [&_.pn-kdel]:grid [&_.pn-kdel]:h-9 [&_.pn-kdel]:w-10 [&_.pn-kdel]:flex-none [&_.pn-kdel]:place-items-center [&_.pn-kdel]:p-0 [&_.pn-kdel_svg]:size-4",
  ),
  kt: m("kt", `min-w-0 flex-1 cursor-pointer py-[5px] [overflow-wrap:anywhere] ${FOCUS}`),
  kopen: m("kopen"),

  // ---------------------------------------------------------------- formalar
  field: m(
    "field",
    "relative flex min-h-[46px] items-center gap-3 px-4 py-2 [&_.pn-chev]:pointer-events-none [&_.pn-chev]:flex-none [&_.pn-chev]:text-hint [&_.pn-chev]:opacity-60 [&_label]:min-w-[92px] [&_label]:flex-none [&_label]:text-hint [&_label]:transition-colors [&:focus-within>label]:text-accent",
  ),
  chk: m(
    "chk",
    "m-0 grid size-[22px] flex-none cursor-pointer appearance-none place-items-center rounded-full border-2 border-hint checked:border-btn checked:bg-btn checked:after:h-[11px] checked:after:w-1.5 checked:after:translate-x-[-1px] checked:after:translate-y-[-1px] checked:after:rotate-45 checked:after:border-solid checked:after:border-btn-fg checked:after:[border-width:0_2.5px_2.5px_0] checked:after:content-['']",
  ),
  sw: m(
    "sw",
    "relative m-0 h-7 w-[46px] flex-none cursor-pointer appearance-none rounded-[14px] bg-[rgba(127,127,127,.35)] transition-colors checked:bg-ok after:absolute after:top-[3px] after:left-[3px] after:size-[22px] after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(0,0,0,.3)] after:transition-[left] after:content-[''] checked:after:left-[21px]",
  ),
  stats: m(
    "stats",
    "mx-4 mt-4 grid grid-cols-4 rounded-xl bg-sec [&_b]:block [&_b]:text-xl [&_b]:font-semibold [&_div]:px-1 [&_div]:py-3 [&_div]:text-center [&_div+div]:border-l [&_div+div]:border-sep [&_span]:text-xs [&_span]:text-hint",
  ),
  seg: m(
    "seg",
    "flex rounded-[9px] bg-[rgba(127,127,127,.16)] p-0.5 [&_button]:flex [&_button]:flex-1 [&_button]:cursor-pointer [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:rounded-[7px] [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-sm [&_button]:text-fg [&_button.pn-on]:bg-sec [&_button.pn-on]:shadow-[0_1px_3px_rgba(0,0,0,.25)] [&_svg.i]:size-4 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:-outline-offset-2 [&_button:focus-visible]:outline-accent",
  ),
  on: m("on"),
  empty: m("empty", "px-4 py-10 text-center text-hint"),
  err: m("err", "px-4 py-10 text-center text-danger"),
  note: m("note", "px-4 py-2.5 text-[13px] text-hint"),

  // ---------------------------------------------------------------- daraxt (org chart)
  orgwrap: m("orgwrap", "overflow-auto pt-[18px] pb-6 min-[760px]:ml-[calc(50%-50vw)] min-[760px]:w-screen"),
  org: m(
    "org",
    [
      "inline-block min-w-full px-4 text-center",
      "[&_ul]:relative [&_ul]:m-0 [&_ul]:flex [&_ul]:justify-center [&_ul]:pt-[22px] [&>ul]:pt-0",
      "[&_ul_ul]:before:absolute [&_ul_ul]:before:top-0 [&_ul_ul]:before:left-1/2 [&_ul_ul]:before:h-[22px] [&_ul_ul]:before:border-l-[1.5px] [&_ul_ul]:before:border-line [&_ul_ul]:before:content-['']",
      "[&_li]:relative [&_li]:flex [&_li]:list-none [&_li]:flex-col [&_li]:items-center [&_li]:px-[5px] [&_li]:pt-[22px]",
      "[&_li]:before:absolute [&_li]:before:top-0 [&_li]:before:right-1/2 [&_li]:before:h-[22px] [&_li]:before:w-1/2 [&_li]:before:border-t-[1.5px] [&_li]:before:border-line [&_li]:before:content-['']",
      "[&_li]:after:absolute [&_li]:after:top-0 [&_li]:after:left-1/2 [&_li]:after:h-[22px] [&_li]:after:w-1/2 [&_li]:after:border-t-[1.5px] [&_li]:after:border-l-[1.5px] [&_li]:after:border-line [&_li]:after:content-['']",
      "[&_li:only-child]:pt-0 [&_li:only-child]:before:hidden [&_li:only-child]:after:hidden",
      "[&_li:first-child]:before:border-0 [&_li:last-child]:after:border-0",
      "[&_li:last-child]:before:rounded-tr-[10px] [&_li:last-child]:before:border-r-[1.5px] [&_li:first-child]:after:rounded-tl-[10px]",
    ].join(" "),
  ),
  /** daraxt kartochkasi: person — bosiladi, root — ko'k, dept — tepada bo'lim rangi (--dc), head — oltin ramka */
  ob: m(
    "ob",
    `relative flex w-32 flex-col items-center gap-[5px] rounded-xl border border-sep bg-sec px-2 pt-3 pb-2.5 [&_.pn-t]:text-[13px] [&_.pn-t]:leading-[1.25] [&_.pn-t]:font-semibold [&_.pn-s]:text-xs [&_.pn-s]:leading-[1.2] [&_.pn-s]:text-sub [&_.pn-sq]:size-[34px] [&_.pn-sq]:rounded-[10px] [&_.pn-av]:size-[38px] [&_.pn-av]:text-sm [&.pn-person]:cursor-pointer [&.pn-person]:active:scale-[.97] [&.pn-root]:w-[170px] [&.pn-root]:border-0 [&.pn-root]:bg-[linear-gradient(135deg,#6ab3f3,#5288c1)] [&.pn-root]:text-white [&.pn-root_.pn-s]:text-white/85 [&.pn-dept]:border-t-[3px] [&.pn-dept]:border-t-(--dc) [&.pn-head]:border-gold/55 ${FOCUS}`,
  ),
  person: m("person"),
  root: m("root"),
  dept: m("dept"),
  mini: m("mini", "flex justify-center gap-1 [&_.pn-av]:size-[26px] [&_.pn-av]:cursor-pointer [&_.pn-av]:text-[10px]"),
  kids: m("kids", "ml-9 border-l-[1.5px] border-line"),

  // ---------------------------------------------------------------- pastdan chiqadigan oyna
  "sheet-bg": m("sheet-bg", "fixed inset-0 z-20 touch-none bg-black/50 opacity-0 transition-opacity duration-200 [&.pn-on]:opacity-100"),
  sheet: m(
    "sheet",
    "fixed inset-x-0 bottom-0 z-21 mx-auto max-h-[90vh] max-h-[90dvh] max-w-[720px] translate-y-full overflow-y-auto overscroll-contain rounded-t-[14px] bg-page pt-1.5 pb-[calc(28px+env(safe-area-inset-bottom))] transition-transform duration-[250ms] ease-[cubic-bezier(.2,.8,.2,1)] [&.pn-on]:translate-y-0",
  ),
  grab: m("grab", "mx-auto mt-1 mb-1.5 h-[5px] w-9 rounded-[3px] bg-hint opacity-40"),
  /** oyna sarlavhasi (avatar/ikonka + ism) */
  who: m(
    "who",
    "flex flex-col items-center gap-1.5 px-4 pt-2.5 pb-1 text-center [&_.pn-av]:size-[72px] [&_.pn-av]:text-[26px] [&_.pn-av>svg.i]:size-8 [&_.pn-sq_svg.i]:size-8 [&_h2]:mt-1 [&_h2]:mb-0 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:[overflow-wrap:anywhere]",
  ),
  /** brauzerda yopish tugmasi (Telegram'da — BackButton) */
  "sheet-x": m(
    "sheet-x",
    `absolute top-2 right-2.5 grid size-[34px] cursor-pointer place-items-center rounded-full border-0 bg-[rgba(127,127,127,.16)] p-0 text-hint [.tg_&]:hidden [&_svg.i]:size-[18px] ${FOCUS}`,
  ),
  toast: m(
    "toast",
    "pointer-events-none fixed bottom-6 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-[10px] bg-[rgba(30,30,30,.92)] px-4 py-2.5 text-sm text-white shadow-[0_6px_20px_rgba(0,0,0,.35)] transition-opacity duration-300 [overflow-wrap:anywhere] max-[641px]:bottom-[calc(76px+env(safe-area-inset-bottom))]",
  ),
  /** xato toast (s.toast bilan birga) */
  toastErr: m("toast-err", "!bg-danger"),
  login: m(
    "login",
    "mx-auto mt-[12vh] max-w-[360px] px-4 text-center [&_.pn-brand]:mx-auto [&_.pn-brand]:mb-5 [&_.pn-brand]:h-[34px] [&_.pn-logo]:mx-auto [&_.pn-logo]:mb-3.5 [&_.pn-logo]:size-[84px] [&_.pn-logo_svg.i]:size-10",
  ),
  tagrow: m("tagrow", "mt-1.5 flex flex-wrap gap-1.5"),
  tag: m("tag", `rounded-md ${GREY} px-2 py-[3px] text-xs text-sub`),
  /** xodimga biriktirilgan agent belgisi (rangi --dc) */
  agchip: m(
    "agchip",
    "mt-0.5 inline-flex max-w-full cursor-pointer items-center gap-1 truncate rounded-lg border-0 bg-[color-mix(in_srgb,var(--dc)_14%,transparent)] px-2 py-[3px] text-[11px] font-semibold text-(--dc) [&_svg.i]:size-3",
  ),
  /** ikonka: `i` — umumiy o'lcham (base.css svg.i, 20px) va ota qoidalari ([&_svg.i]:…) shu nom bilan */
  i: "i pn-i",
  spin: m("spin"),
} as const;

export type PanelStyles = typeof s & Record<string, string | undefined>;
export default s as PanelStyles;
