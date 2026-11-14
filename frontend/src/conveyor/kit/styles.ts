// Lenta (konveyer chizmasi) uslublari — Tailwind utility sinflari, eski lenta.html klass nomlari bilan: c("field col", bad && "bad").
// Har nom = `cv-<nom>` belgisi + utility'lar. Modifikator (on, sec, bad, hide …) — faqat belgi, uslubni asosiy nom beradi
// ([&.cv-on]:…); ichki qism (t, s, qh …) — ota beradi ([&_.cv-t]:…). Kompyuter — lg (≥1024px), telefon — max-lg.
// O'lchamlar: --side (chap panel), --hdr (sarlavha), --barh / --bar-real (pastki panel, JS o'lchaydi), --field (maydon foni).

const m = (k: string, u = "") => (u ? `cv-${k} ${u}` : `cv-${k}`);
const SHADOW = "shadow-[0_1px_2px_rgba(0,0,0,.08),0_4px_16px_rgba(0,0,0,.08)]";

const S: Record<string, string> = {
  /** ikonka: `i` — umumiy o'lcham (base.css svg.i) va ota qoidalari ([&_svg.i]:…) shu nom bilan */
  i: "i cv-i",
  // ---------------------------------------------------------------- sarlavha
  top: m("top", "sticky top-0 z-10 h-(--hdr) border-b border-sep bg-page/90 backdrop-blur-[14px] backdrop-saturate-180"),
  bar: m("bar", "flex h-full items-center gap-3 px-3"),
  logo: m("logo", "grid size-9 flex-none place-items-center rounded-full bg-[linear-gradient(135deg,#3ccf9a,#2fa37a)] text-white [&_svg.i]:size-[19px]"),
  ttl: m("ttl", "min-w-0 flex-1 [&_h1]:m-0 [&_h1]:text-[17px] [&_h1]:leading-[1.2] [&_h1]:font-semibold [&_p]:mt-0.5 [&_p]:mb-0 [&_p]:truncate [&_p]:text-xs [&_p]:text-sub"),
  "icon-btn": m(
    "icon-btn",
    "grid size-11 flex-none cursor-pointer place-items-center rounded-full border-0 bg-transparent text-link enabled:hover:bg-[rgba(127,127,127,.12)] enabled:active:scale-[.94] disabled:cursor-default disabled:opacity-35 [&.cv-del]:-my-1 [&.cv-del]:mr-[-8px] [&.cv-del]:ml-0 [&.cv-del]:text-danger",
  ),
  del: m("del"),

  // ---------------------------------------------------------------- joylashuv
  app: m(
    "app",
    "flex flex-col gap-3 pt-3 pb-[calc(var(--bar-real,calc(var(--barh)+env(safe-area-inset-bottom)))+16px)] lg:grid lg:h-[calc(100dvh-var(--hdr))] lg:grid-cols-[var(--side)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-0 lg:p-0",
  ),
  span: m("span", "col-span-full"),
  side: m("side", "flex min-w-0 flex-col gap-3 *:flex-none max-lg:contents lg:overflow-y-auto lg:border-r lg:border-sep lg:bg-page lg:px-4 lg:pt-4 lg:pb-6"),
  centerCol: m("centerCol", "flex min-w-0 flex-col max-lg:order-4 max-lg:scroll-mt-[calc(var(--hdr)+8px)] lg:h-full lg:px-4 lg:pt-3 lg:pb-[calc(var(--bar-real,var(--barh))+8px)]"),
  chat: m("chat", "mx-3 flex flex-col items-end gap-1 max-lg:order-1 lg:m-0"),
  parseMsgs: m("parseMsgs", "px-4 max-lg:order-2 lg:px-1"),
  mqBox: m("mqBox", "empty:hidden max-lg:order-3 max-lg:scroll-mt-[calc(var(--hdr)+8px)] lg:hidden"),
  params: m("params", "max-lg:order-5 max-lg:scroll-mt-[calc(var(--hdr)+8px)]"),
  custCard: m("custCard", "max-lg:order-6"),
  /** savollar xulosasi (telefon): sariq tugma */
  mq: m(
    "mq",
    "mx-3 flex min-h-12 w-[calc(100%-24px)] cursor-pointer items-center gap-2 rounded-xl border-0 bg-warn/16 px-3 py-2 text-left text-sm text-fg [&_.cv-m]:min-w-0 [&_.cv-m]:flex-1 [&_.cv-m_span]:block [&_.cv-m_span]:truncate [&_.cv-m_span]:text-[13px] [&_.cv-m_span]:text-sub [&_b]:block [&_b]:font-semibold [&_svg.i]:size-[18px] [&_svg.i]:text-warn",
  ),
  m: m("m"),
  card: m("card", "mx-3 overflow-hidden rounded-2xl bg-sec lg:[.cv-side_&]:m-0"),
  btn: m(
    "btn",
    "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-btn px-4 font-semibold whitespace-nowrap text-btn-fg disabled:cursor-default disabled:opacity-45 [&.cv-sec]:!bg-[rgba(127,127,127,.15)] [&.cv-sec]:!text-fg [&.cv-wide]:w-full",
  ),
  sec: m("sec"),
  wide: m("wide"),
  muted: m("muted", "text-sub"),
  h3: m("h3", "text-[13px] font-semibold tracking-[.02em] text-head uppercase"),

  // ---------------------------------------------------------------- chat va zakaz maydoni
  bubble: m("bubble", `max-w-[85%] rounded-[18px_18px_4px_18px] bg-btn px-3 py-2 leading-[1.4] whitespace-pre-wrap text-btn-fg [overflow-wrap:anywhere] ${SHADOW}`),
  composer: m("composer", "flex w-full items-end gap-2 rounded-3xl border border-sep bg-page py-1 pr-1 pl-4 transition-colors focus-within:border-accent/60"),
  otext: m("otext", "block max-h-[30vh] min-h-10 min-w-0 flex-1 resize-none overflow-y-hidden border-0 bg-transparent py-[9px] leading-[1.4] text-fg outline-none focus-visible:outline-none"),
  sendc: m("sendc", "grid size-10 flex-none cursor-pointer place-items-center rounded-full border-0 bg-btn text-btn-fg enabled:active:scale-[.94] disabled:cursor-default disabled:opacity-60"),
  /** ochiladigan izoh (xatolar, ogohlantirishlar) */
  fold: m(
    "fold",
    "text-[13px] text-sub [&>summary]:inline-flex [&>summary]:min-h-10 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:gap-1 [&>summary::-webkit-details-marker]:hidden [&>summary_svg.i]:size-4 [&>summary_svg.i]:transition-transform [&[open]>summary_svg.i:last-child]:rotate-180 [&_ul]:mt-0 [&_ul]:mb-1 [&_ul]:pl-[18px] [&.cv-warns>summary]:font-medium [&.cv-warns>summary]:text-warn",
  ),
  warns: m("warns"),

  // ---------------------------------------------------------------- tushunilgan parametrlar
  pcard: m(
    "pcard",
    "[&>summary]:flex [&>summary]:min-h-14 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:gap-3 [&>summary]:px-4 [&>summary]:py-3 [&>summary::-webkit-details-marker]:hidden [&>summary_.cv-t]:text-[15px] [&>summary_.cv-t]:font-semibold [&>summary_.cv-s]:truncate [&>summary_.cv-s]:text-[13px] [&>summary_.cv-s]:text-sub [&[open]>summary_.cv-s]:hidden lg:[&>summary]:cursor-default lg:[&>summary>.cv-chev]:hidden",
  ),
  main: m("main", "min-w-0 flex-1"),
  t: m("t"),
  s: m("s"),
  chev: m("chev", "grid text-sub transition-transform [[open]>summary>&]:rotate-180"),
  /** savollar bloki (sariq) */
  qs: m("qs", "mx-3 mb-2 rounded-xl bg-warn/16 px-3 py-2 text-sm [&_li]:py-0.5 [&_ul]:mt-1 [&_ul]:mb-0 [&_ul]:pl-[26px]"),
  qh: m("qh", "flex items-center gap-2 font-semibold [&_svg.i]:size-[18px] [&_svg.i]:text-warn"),
  grp: m("grp", "border-t border-sep px-4 pt-2 pb-1"),
  /** maydon qatori; bad — qizil, warn — sariq ramka; col — ustma-ust */
  field: m(
    "field",
    [
      "relative flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1",
      "[&>label]:min-w-0 [&>label]:flex-1 [&>label]:text-[15px] [&>label]:text-fg [&>label_small]:mt-px [&>label_small]:block [&>label_small]:text-xs [&>label_small]:text-sub",
      "[&_:is(input[type=text],input:not([type]),textarea)]:min-h-10 [&_:is(input[type=text],input:not([type]),textarea)]:w-[116px] [&_:is(input[type=text],input:not([type]),textarea)]:rounded-lg [&_:is(input[type=text],input:not([type]),textarea)]:border [&_:is(input[type=text],input:not([type]),textarea)]:border-transparent [&_:is(input[type=text],input:not([type]),textarea)]:bg-(--field) [&_:is(input[type=text],input:not([type]),textarea)]:px-2.5 [&_:is(input[type=text],input:not([type]),textarea)]:py-2 [&_:is(input[type=text],input:not([type]),textarea)]:text-right [&_:is(input[type=text],input:not([type]),textarea)]:text-fg [&_:is(input[type=text],input:not([type]),textarea)]:outline-none",
      "[&_:is(input,textarea):focus]:border-accent [&_input.cv-wide]:w-full [&_input.cv-wide]:text-left [&_textarea]:min-h-16 [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:text-left",
      "[&.cv-bad_:is(input,.cv-pick)]:!border-danger [&.cv-warn_:is(input,.cv-pick)]:border-warn",
      "[&_.cv-u]:w-6 [&_.cv-u]:flex-none [&_.cv-u]:text-[13px] [&_.cv-u]:text-sub",
      "[&.cv-col]:flex-col [&.cv-col]:items-stretch [&.cv-col]:gap-2",
    ].join(" "),
  ),
  col: m("col"),
  bad: m("bad"),
  warn: m("warn"),
  u: m("u"),
  /** maydonga tegishli xato / ogohlantirish matni — maydon ostida, butun qator */
  fmsg: m("fmsg", "w-full flex-none border-l-2 border-warn pl-2 text-xs leading-[1.35] text-fg [overflow-wrap:anywhere] [&.cv-e]:border-danger [&.cv-e]:text-danger"),
  e: m("e"),
  pick: m(
    "pick",
    "flex min-h-10 min-w-0 flex-1 cursor-pointer items-center justify-end gap-2 rounded-lg border border-transparent bg-(--field) px-2.5 py-2 text-right text-fg [&_span]:truncate [&_svg.i]:size-4 [&_svg.i]:text-sub",
  ),
  ro: m("ro", "text-sub tabular-nums"),
  seg: m(
    "seg",
    "flex rounded-[10px] bg-[rgba(127,127,127,.16)] p-0.5 [&_button]:min-h-10 [&_button]:flex-1 [&_button]:cursor-pointer [&_button]:rounded-lg [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-2 [&_button]:text-sm [&_button]:whitespace-nowrap [&_button]:text-fg [&_button.cv-on]:bg-sec [&_button.cv-on]:font-semibold [&_button.cv-on]:text-accent [&_button.cv-on]:shadow-[0_1px_3px_rgba(0,0,0,.2)]",
  ),
  on: m("on"),
  /** kalitcha; bosish maydoni 58×48 (ko'rinishi 46×28) */
  sw: m(
    "sw",
    "relative m-0 h-7 w-[46px] flex-none cursor-pointer appearance-none rounded-[14px] bg-[rgba(127,127,127,.35)] transition-colors checked:bg-ok before:absolute before:-inset-x-1.5 before:-inset-y-2.5 before:content-[''] after:absolute after:top-[3px] after:left-[3px] after:size-[22px] after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(0,0,0,.3)] after:transition-[left] after:content-[''] checked:after:left-[21px]",
  ),
  /** qo'shimcha (yoqiladigan) bo'lim */
  opt: m("opt", "border-t border-sep [&>.cv-field>label]:font-medium [&_.cv-ob]:mx-3 [&_.cv-ob]:mb-2 [&_.cv-ob]:rounded-xl [&_.cv-ob]:bg-[rgba(127,127,127,.06)] [&_.cv-ob]:pb-2"),
  ob: m("ob"),
  dot: m("dot", "hidden size-2 flex-none rounded-full [&.cv-err]:block [&.cv-err]:bg-danger [&.cv-warnd]:block [&.cv-warnd]:bg-warn"),
  warnd: m("warnd"),
  hide: m("hide", "!hidden"),

  // ---------------------------------------------------------------- chizma ko'ruvchi
  vhead: m("vhead", "flex min-h-12 items-center gap-2 px-3 pb-2 lg:px-0"),
  tabs: m("tabs", "flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"),
  tab: m(
    "tab",
    `min-h-10 flex-none cursor-pointer rounded-full border-0 bg-transparent px-3 text-sm whitespace-nowrap text-sub hover:bg-[rgba(127,127,127,.12)] hover:text-fg [&.cv-on]:bg-sec [&.cv-on]:font-semibold [&.cv-on]:text-accent [&.cv-on]:shadow-[0_1px_2px_rgba(0,0,0,.08),0_4px_16px_rgba(0,0,0,.08)]`,
  ),
  tools: m("tools", "flex flex-none gap-0.5 max-lg:[&_.cv-zoom]:hidden"),
  zoom: m("zoom"),
  "iss-line": m("iss-line", "flex flex-col gap-0.5 px-3 pb-2 lg:px-0"),
  iss: m(
    "iss",
    "flex items-start gap-2 text-sm [&_.cv-lnk]:p-0 [&_.cv-lnk]:underline [&_svg.i]:mt-px [&_svg.i]:size-[18px] [&_svg.i]:flex-none [&.cv-error]:text-danger [&.cv-warning]:text-fg [&.cv-warning_svg.i]:text-warn",
  ),
  error: m("error"),
  warning: m("warning"),
  viewer: m("viewer", "relative mx-1 overflow-hidden rounded-2xl bg-sec lg:m-0 lg:min-h-0 lg:flex-1 [&.cv-loading_.cv-vbusy]:grid [&.cv-loading_.cv-vbusy]:animate-[vfade_.2s_.12s_both]"),
  loading: m("loading"),
  vscroll: m("vscroll", "grid size-full touch-pan-x touch-pan-y place-items-center overflow-auto p-2 lg:p-3"),
  vpaper: m("vpaper", "flex-none cursor-zoom-in rounded bg-white shadow-[0_2px_12px_rgba(0,0,0,.18)] [&_svg]:block [&_svg]:size-full"),
  /** chizma yuklanmoqda (qisqa kechikish bilan — tez javobda miltillamaydi) */
  vbusy: m("vbusy", "absolute inset-0 hidden content-center place-items-center gap-2 bg-sec/55 [&.cv-solid]:bg-sec/88"),
  solid: m("solid"),
  "vbusy-t": m("vbusy-t", "text-sm font-medium text-fg"),
  spin: m(
    "spin",
    "size-7 animate-spin-slow rounded-full border-3 border-sub border-t-transparent [&.cv-sm]:size-[18px] [&.cv-sm]:border-2 [&.cv-sm]:border-btn-fg [&.cv-sm]:border-t-transparent",
  ),
  sm: m("sm"),
  skel: m(
    "skel",
    "mx-auto my-3 aspect-[1188/840] w-[min(92%,980px)] animate-[shimmer_1.2s_infinite] rounded-md bg-[linear-gradient(90deg,rgba(127,127,127,.10)_25%,rgba(127,127,127,.22)_50%,rgba(127,127,127,.10)_75%)] bg-size-[200%_100%]",
  ),
  vmsg: m("vmsg", "px-4 py-6 text-center text-sub"),
  /** bo'sh holat */
  empty: m(
    "empty",
    "mx-auto max-w-[560px] px-4 py-6 text-center [&_.cv-ico]:mx-auto [&_.cv-ico]:mb-3 [&_.cv-ico]:grid [&_.cv-ico]:size-14 [&_.cv-ico]:place-items-center [&_.cv-ico]:rounded-full [&_.cv-ico]:bg-accent/14 [&_.cv-ico]:text-accent [&_.cv-ico_svg.i]:size-[26px] [&_h2]:mt-0 [&_h2]:mb-1 [&_h2]:text-xl [&_h2]:font-bold [&_p]:mt-0 [&_p]:mb-4 [&_p]:text-sub",
  ),
  ico: m("ico"),
  /** namunadan boshlash */
  ex: m(
    "ex",
    "mt-2 flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border border-sep bg-page px-4 py-3 text-left text-fg enabled:hover:border-accent disabled:cursor-default disabled:opacity-55 [&_.cv-m]:flex-1 [&_small]:block [&_small]:text-xs [&_small]:text-sub [&_svg.i]:text-accent",
  ),

  // ---------------------------------------------------------------- pastki panel
  actbar: m(
    "actbar",
    "fixed inset-x-0 bottom-0 z-12 flex flex-col items-stretch gap-2 border-t border-sep bg-sec/94 px-3 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] backdrop-blur-[14px] backdrop-saturate-180 lg:left-(--side) lg:px-4 lg:py-2 max-lg:[@media(max-height:520px)]:[main.cv-app:has(input:focus,textarea:focus)~&]:hidden [&_.cv-in]:flex [&_.cv-in]:w-full [&_.cv-in]:items-center [&_.cv-in]:gap-3 [&_.cv-chips]:flex [&_.cv-chips]:min-w-0 [&_.cv-chips]:flex-1 [&_.cv-chips]:gap-1 [&_.cv-chips]:overflow-hidden max-lg:[&_.cv-chips]:hidden",
  ),
  in: m("in"),
  chips: m("chips"),
  chip: m("chip", "flex-none rounded-full bg-(--field) px-2.5 py-[5px] text-[13px] whitespace-nowrap text-fg"),
  pricebtn: m(
    "pricebtn",
    "flex min-h-12 cursor-pointer flex-col items-start justify-center rounded-xl border-0 bg-transparent px-2 text-left text-fg hover:bg-[rgba(127,127,127,.1)] max-lg:min-w-0 max-lg:flex-1 [&_b]:flex [&_b]:items-center [&_b]:gap-1 [&_b]:text-[17px] [&_b]:whitespace-nowrap [&_b]:text-accent [&_b]:tabular-nums max-[420px]:[&_b]:text-base [&_small]:text-xs [&_small]:text-sub [&_svg.i]:size-4 [&_svg.i]:text-sub [&.cv-stale_b]:opacity-50",
  ),
  stale: m("stale"),
  sendwrap: m(
    "sendwrap",
    "flex flex-none flex-col items-end gap-0.5 max-lg:[.cv-pricebtn~&]:ml-auto max-lg:[.cv-pricebtn.cv-hide+&]:flex-1 max-lg:[.cv-pricebtn.cv-hide+&_.cv-btn]:w-full max-lg:[.cv-pricebtn.cv-hide+&_.cv-why]:max-w-none max-lg:[.cv-pricebtn.cv-hide+&_.cv-why]:self-stretch max-lg:[.cv-pricebtn.cv-hide+&_.cv-why]:text-center max-[420px]:[&_.cv-btn]:px-3.5 max-[420px]:[&_.cv-btn]:text-[15px]",
  ),
  why: m("why", "max-w-[260px] text-right text-xs text-sub max-lg:max-w-[200px]"),
  /** tugma yozuvi: to'liq / qisqa (tor ekranda narx yonida) */
  "lbl-l": m("lbl-l", "max-[480px]:[.cv-pricebtn:not(.cv-hide)+.cv-sendwrap_&]:hidden"),
  "lbl-s": m("lbl-s", "hidden max-[480px]:[.cv-pricebtn:not(.cv-hide)+.cv-sendwrap_&]:inline"),
  pop: m(
    "pop",
    "fixed right-3 bottom-[calc(var(--bar-real,var(--barh))+8px)] z-13 max-h-[60vh] w-[min(420px,calc(100vw-24px))] overflow-auto rounded-2xl bg-sec py-2 shadow-[0_10px_40px_rgba(0,0,0,.35)] max-lg:right-auto max-lg:left-3",
  ),
  prow: m(
    "prow",
    "flex items-baseline gap-3 px-4 py-2 text-sm [&+&]:border-t [&+&]:border-sep [&_.cv-a]:whitespace-nowrap [&_.cv-a]:tabular-nums [&_.cv-d]:text-xs [&_.cv-d]:text-sub [&_.cv-d]:[overflow-wrap:anywhere] [&.cv-final]:font-bold [&.cv-final_.cv-a]:text-accent",
  ),
  final: m("final"),
  a: m("a"),
  d: m("d"),
  "meta-q": m(
    "meta-q",
    "px-4 pt-1 pb-3 [&_:is(input,textarea)]:w-full [&_:is(input,textarea)]:rounded-[10px] [&_:is(input,textarea)]:border [&_:is(input,textarea)]:border-transparent [&_:is(input,textarea)]:bg-sec [&_:is(input,textarea)]:px-3 [&_:is(input,textarea)]:py-2.5 [&_:is(input,textarea)]:text-fg [&_:is(input,textarea)]:outline-none [&_:is(input,textarea):focus]:border-accent [&_textarea]:min-h-[70px] [&_textarea]:resize-y [&_h3]:mt-1.5 [&_h3]:mb-0.5 [&_h3]:text-[17px] [&_h3]:font-bold [&_label]:mt-2.5 [&_label]:mb-1 [&_label]:block [&_label]:text-[13px] [&_label]:text-head [&_p]:mt-0 [&_p]:mb-2.5 [&_p]:text-[13.5px] [&_p]:text-sub [&_.cv-row]:mt-3.5 [&_.cv-row]:flex [&_.cv-row]:gap-2 [&_.cv-row_.cv-btn]:flex-1",
  ),
  row: m("row"),
  menu: m("menu", "[&_.cv-item_svg.i]:text-link"),

  // ---------------------------------------------------------------- pastdan chiqadigan oyna va ro'yxat
  "sheet-bg": m("sheet-bg", "fixed inset-0 z-30 bg-black/50 opacity-0 transition-opacity duration-200 [&.cv-on]:opacity-100"),
  sheet: m(
    "sheet",
    "fixed inset-x-0 bottom-0 z-31 mx-auto max-h-[88vh] max-h-[88dvh] max-w-[720px] translate-y-full overflow-y-auto overscroll-contain rounded-t-[14px] bg-page pt-1.5 pb-[calc(24px+env(safe-area-inset-bottom))] transition-transform duration-[250ms] ease-[cubic-bezier(.2,.8,.2,1)] [&.cv-on]:translate-y-0",
  ),
  grab: m("grab", "mx-auto mt-1 mb-1.5 h-[5px] w-9 rounded-[3px] bg-hint opacity-40"),
  list: m(
    "list",
    "mx-3 overflow-hidden rounded-xl bg-sec [&>.cv-item+.cv-item]:before:absolute [&>.cv-item+.cv-item]:before:top-0 [&>.cv-item+.cv-item]:before:right-0 [&>.cv-item+.cv-item]:before:left-3.5 [&>.cv-item+.cv-item]:before:border-t [&>.cv-item+.cv-item]:before:border-sep [&>.cv-item+.cv-item]:before:content-['']",
  ),
  item: m(
    "item",
    "relative flex min-h-[46px] items-center gap-3 px-3.5 py-2 [&.cv-on]:font-medium [&.cv-on]:text-accent [&.cv-tap]:cursor-pointer [&.cv-tap]:active:bg-[rgba(127,127,127,.12)] [&_.cv-s]:text-[13px] [&_.cv-s]:text-sub [&_.cv-t]:[overflow-wrap:anywhere]",
  ),
  tap: m("tap"),
  search: m("search", "mx-3 mt-1.5 mb-2.5 flex items-center gap-2 rounded-[10px] bg-sec px-3 [&_input]:flex-1 [&_input]:border-0 [&_input]:bg-transparent [&_input]:py-2.5 [&_input]:text-fg [&_input]:outline-none"),
  lnk: m("lnk", "cursor-pointer border-0 bg-transparent py-1.5 text-link [&.cv-danger]:text-danger"),
  danger: m("danger"),
  /** oyna sarlavhasi (loyihalar): nom — bo'shliq — amal */
  sh: m(
    "sh",
    "flex min-h-10 items-center gap-2 px-4 pb-1 text-[13px] font-semibold tracking-[.02em] text-head uppercase [&_.cv-lnk]:min-h-10 [&_.cv-lnk]:px-1 [&_.cv-lnk]:py-0 [&_.cv-lnk]:text-[15px] [&_.cv-lnk]:font-normal [&_.cv-lnk]:tracking-normal [&_.cv-lnk]:normal-case",
  ),
  sp: m("sp", "flex-1"),

  // ---------------------------------------------------------------- to'liq ekran ko'ruvchi
  fs: m(
    "fs",
    "fixed inset-0 z-40 flex flex-col bg-[#2a2f36] [&_.cv-icon-btn]:text-white [&_.cv-fsbar_.cv-t]:flex-1 [&_.cv-fsbar_.cv-t]:truncate [&_.cv-fsbar_.cv-t]:text-center [&_.cv-fsbar_.cv-t]:text-sm",
  ),
  fsbar: m("fsbar", "flex items-center gap-1 bg-black/35 px-2 pt-[calc(6px+env(safe-area-inset-top))] pb-1.5 text-white"),
  stage: m("stage", "relative flex-1 cursor-grab touch-none overflow-hidden [&_.cv-inner]:absolute [&_.cv-inner]:top-0 [&_.cv-inner]:left-0 [&_.cv-inner]:origin-top-left [&_.cv-inner]:bg-white [&_.cv-inner]:shadow-[0_4px_30px_rgba(0,0,0,.4)] [&_.cv-inner_svg]:block [&_.cv-inner_svg]:size-full"),
  inner: m("inner"),

  // ---------------------------------------------------------------- xabarlar
  toast: m(
    "toast",
    "pointer-events-none fixed bottom-[calc(var(--bar-real,84px)+12px)] left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-[10px] bg-[rgba(30,30,30,.92)] px-4 py-2.5 text-sm text-white shadow-[0_6px_20px_rgba(0,0,0,.35)] transition-opacity duration-300 [&.cv-err]:!bg-danger",
  ),
  /** markazdagi holat matni (yuklanmoqda / xato) */
  center: m("center", "px-4 py-[60px] text-center text-hint [&.cv-err]:text-danger"),
  err: m("err"),
  login: m("login", "mx-auto mt-[12vh] max-w-[360px] px-4 text-center [&_.cv-logo]:mx-auto [&_.cv-logo]:mb-3.5 [&_.cv-logo]:size-[84px] [&_.cv-logo_svg.i]:size-10"),
};

export default S;
