"use client";
// ERP UI to'plami — erp_ui.js (window.UI) ning React nusxasi. Sinflar va ko'rinish o'sha erp_ui.css'dan (backend
// /app/erp/ui.css — eski va yangi sahifalar uchun bitta manba). Telegram ichida: BackButton, MainButton, haptic;
// brauzerda: tepa panel (orqaga), pastki asosiy tugma, kirish oynasi.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { ApiError } from "@/shared/api/client";
import { ICONS } from "@/shared/icons/lucide";
import { SvgIcon } from "@/shared/ui/svg-icon";

import { etg, hap, initErpEnv, LOGIN_EVENT, toast } from "./env";
import { C } from "./colors";

export { C };

export function Icon({ n, cls = "" }: { n: string; cls?: string }) {
  return <SvgIcon set={ICONS} name={n} fallback="file" className={`i ${cls}`} hidden />;
}

export type RowProps = {
  icon?: string;
  color?: string;
  lead?: ReactNode;
  t?: ReactNode;
  s?: ReactNode;
  val?: ReactNode;
  valSmall?: ReactNode;
  right?: ReactNode;
  chev?: boolean;
  tap?: boolean;
  strong?: boolean;
  cls?: string;
  tcls?: string;
  scls?: string;
  onClick?: () => void;
  role?: string;
  checked?: boolean;
  label?: string;
  data?: Record<string, string | number>;
};

/** Ro'yxat qatori (erp_ui.js row): ikonka kvadrati, sarlavha, izoh, o'ng qiymat, strelka. Bosiladigan bo'lsa — klaviatura bilan ham. */
export function Row(o: RowProps) {
  const lead = o.lead ?? (o.icon ? <span className="sq" style={{ background: C[o.color ?? "blue"] ?? o.color }}><Icon n={o.icon} /></span> : null);
  const hasVal = o.val !== undefined && o.val !== null && o.val !== "";
  const click = o.onClick;
  return (
    <div
      className={`item ${o.tap || o.chev || click ? "tap" : ""} ${o.cls ?? ""}`}
      onClick={click}
      onKeyDown={click ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), click()) : undefined}
      tabIndex={click ? 0 : undefined}
      role={o.role ?? (click ? "button" : undefined)}
      aria-checked={o.role === "checkbox" ? !!o.checked : undefined}
      aria-label={o.label}
      {...Object.fromEntries(Object.entries(o.data ?? {}).map(([k, v]) => [`data-${k}`, v]))}
    >
      {lead}
      <div className="main">
        <div className={`t ${o.tcls ?? ""}`}>{o.t}</div>
        {o.s ? <div className={`s ${o.scls ?? ""}`}>{o.s}</div> : null}
      </div>
      {hasVal ? (
        <span className={`val ${o.strong ? "strong" : ""}`}>
          {o.val}
          {o.valSmall ? <small>{o.valSmall}</small> : null}
        </span>
      ) : null}
      {o.right}
      {o.chev ? (
        <span className="chev">
          <Icon n="chev" />
        </span>
      ) : null}
    </div>
  );
}

export const List = ({ children, cls = "", style }: { children: ReactNode; cls?: string; style?: CSSProperties }) => (
  <div className={`list ${cls}`} style={style}>
    {children}
  </div>
);

export const Sh = ({ t, r }: { t: ReactNode; r?: ReactNode }) => (
  <div className="sh">
    <span>{t}</span>
    {r ? <span className="r">{r}</span> : null}
  </div>
);

export const Sf = ({ children }: { children: ReactNode }) => <div className="sf">{children}</div>;

export const Empty = ({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) => (
  <div className="empty">
    <div className="ei">
      <Icon n={icon} />
    </div>
    <b>{title}</b>
    {children}
  </div>
);

/** Tanlov katagi (erp_ui.css .ck) — qator ichida faqat ko'rinish, bosish qatorning o'zida */
export const Check = ({ on }: { on: boolean }) => (
  <input type="checkbox" className="ck" tabIndex={-1} aria-hidden="true" readOnly checked={on} style={{ pointerEvents: "none" }} />
);

export function Seg<K extends string>({ items, cur, onPick }: { items: [K, string][]; cur: K; onPick: (k: K) => void }) {
  return (
    // tugmalar guruhi (aria-pressed): to'liq tab naqshi (tabpanel, strelka bilan yurish) yo'q — tablist e'lon qilinmaydi
    <div className="seg" role="group" data-seg="">
      {items.map(([k, l]) => (
        <button
          key={k}
          data-k={k}
          type="button"
          aria-pressed={k === cur}
          className={k === cur ? "on" : ""}
          onClick={() => {
            hap.tap();
            onPick(k);
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ sheet (pastdan chiqadigan oyna)
// Ochiq oynalar ro'yxati — Telegram BackButton / brauzer "Orqaga" avval eng ustidagi oynani yopadi.
const sheets: (() => void)[] = [];
export const closeTopSheet = (): boolean => {
  const c = sheets[sheets.length - 1];
  if (c) {
    c();
    return true;
  }
  return false;
};

export function Sheet({
  title,
  done,
  onDone,
  onClose,
  children,
}: {
  title: string;
  done?: string;
  onDone?: () => Promise<boolean | void> | boolean | void;
  onClose: () => void;
  children: ReactNode;
}) {
  const [on, setOn] = useState(false);
  const busy = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  // onClose ref'da: ota inline funksiya bersa ham effekt har render'da qayta ishlamasin (fokus o'g'irlanmasin)
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });
  const close = useCallback(() => {
    setOn(false);
    setTimeout(() => onCloseRef.current(), 260);
  }, []);
  useEffect(() => {
    const r = requestAnimationFrame(() => setOn(true));
    sheets.push(close);
    etg()?.BackButton?.show();
    const f = bodyRef.current?.querySelector<HTMLInputElement>("input:not([type=checkbox]),textarea");
    const ft = f ? setTimeout(() => f.focus(), 280) : undefined;
    return () => {
      cancelAnimationFrame(r);
      clearTimeout(ft);
      const i = sheets.indexOf(close);
      if (i >= 0) sheets.splice(i, 1);
    };
  }, [close]);
  const ok = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if ((await onDone?.()) !== false) close();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      busy.current = false;
    }
  };
  return createPortal(
    <>
      <div className={`sheet-bg ${on ? "on" : ""}`} onClick={close} />
      <div className={`sheet ${on ? "on" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" />
        <div className="hd">
          <button className="x" onClick={close}>
            Bekor
          </button>
          <h2>{title}</h2>
          {done ? (
            <button className="x go" onClick={ok}>
              {done}
            </button>
          ) : (
            <span className="x" />
          )}
        </div>
        <div
          className="bd"
          ref={bodyRef}
          onKeyDown={(e) => {
            if (e.key === "Enter" && done && (e.target as HTMLElement).tagName === "INPUT") {
              e.preventDefault();
              void ok();
            }
          }}
        >
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ------------------------------------------------------------ asosiy tugma (Telegram MainButton / pastki tugma)
export function MainButton({ text, onClick, color, disabled }: { text: string; onClick: () => Promise<void> | void; color?: string; disabled?: boolean }) {
  const fn = useRef(onClick);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fn.current = onClick;
  }, [onClick]);
  const run = useCallback(async () => {
    const t = etg();
    t?.MainButton?.showProgress(false);
    setBusy(true);
    try {
      await fn.current();
    } finally {
      t?.MainButton?.hideProgress();
      setBusy(false);
    }
  }, []);
  const t = etg();
  useEffect(() => {
    document.body.classList.add("has-main");
    const mb = etg()?.MainButton;
    if (mb) {
      const tp = etg()?.themeParams ?? {};
      mb.setParams({ text, color: color ?? tp.button_color, text_color: tp.button_text_color, is_active: !disabled, is_visible: true });
      mb.onClick(run);
    }
    return () => {
      document.body.classList.remove("has-main");
      mb?.offClick(run);
      mb?.hide();
    };
  }, [text, color, disabled, run]);
  if (t) return null;
  return createPortal(
    <div className="mainbtn" id="mainbtn">
      <button className="btn" disabled={disabled || busy} onClick={run} style={color ? { background: color } : undefined}>
        {text}
      </button>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------ sahifa karkasi va ichki navigatsiya (stek)
export type Nav<V> = { view: V; go: (v: V) => void; back: () => void; root: (v: V) => void; depth: number };

/** Ichki ekranlar steki (erp_ui.js go/back/root): Telegram BackButton va brauzer tepa paneli bilan; scroll tiklanadi. */
export function useNav<V>(first: V): Nav<V> {
  const [stack, setStack] = useState<{ v: V; y: number }[]>([{ v: first, y: 0 }]);
  const go = useCallback((v: V) => {
    hap.soft();
    setStack((s) => [...s.slice(0, -1), { ...s[s.length - 1], y: window.scrollY }, { v, y: 0 }]);
    window.scrollTo(0, 0);
  }, []);
  const back = useCallback(() => {
    if (closeTopSheet()) return;
    setStack((s) => {
      if (s.length <= 1) {
        etg()?.close();
        return s;
      }
      hap.soft();
      const n = s.slice(0, -1);
      requestAnimationFrame(() => window.scrollTo(0, n[n.length - 1].y));
      return n;
    });
  }, []);
  const root = useCallback((v: V) => {
    setStack([{ v, y: 0 }]);
    window.scrollTo(0, 0);
  }, []);
  const depth = stack.length;
  useEffect(() => {
    const b = etg()?.BackButton;
    if (!b) return;
    b.onClick(back);
    if (depth > 1) b.show();
    else b.hide();
    return () => b.offClick(back);
  }, [back, depth]);
  return { view: stack[stack.length - 1].v, go, back, root, depth };
}

/** Sahifa karkasi: brauzerda tepa panel (orqaga + sarlavha), Telegram ichida yashirin; kirish oynasi.
 *  bare — o'z sarlavhasi va to'liq ekran tartibi bor ilova (CRM): tepa panel va .wrap yo'q, faqat muhit + kirish oynasi. */
export function Shell({ title, nav, wide, bare, children }: { title: string; nav?: Nav<unknown>; wide?: boolean; bare?: boolean; children: ReactNode }) {
  // statik eksport: serverda (build) skelet, brauzerda darhol kontent
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (ready) initErpEnv();
  useEffect(() => {
    document.title = title || "ERP";
  }, [title]);
  const inTg = ready && !!etg();
  if (bare || !nav)
    return (
      <>
        {ready ? children : <Skeleton />}
        <Login />
      </>
    );
  return (
    <>
      <div className={`top ${inTg ? "hidden" : ""}`} id="topbar">
        <div className="bar">
          <button className={`back ${nav.depth > 1 ? "on" : ""}`} onClick={nav.back}>
            <Icon n="back" />
            Orqaga
          </button>
          <h1>{title}</h1>
          <span />
        </div>
      </div>
      <main className={`wrap ${wide ? "wide" : ""}`}>{ready ? children : <Skeleton />}</main>
      <Login />
    </>
  );
}

const noop = () => () => {};

export const Skeleton = () => (
  <>
    <div style={{ height: 12 }} />
    <div className="skel" />
    <div className="skel" />
    <div className="skel" />
  </>
);

/** Tarmoq xatosi (server javob bermadi) — ApiError emas. "Internet aloqasini tekshiring" faqat shunda o'rinli. */
export const isNetErr = (e: unknown): boolean => !(e instanceof ApiError);

/** Xato matni ostidagi maslahat: tarmoq xatosida — internet, aks holda — qayta urinish */
export const ErrHint = ({ net }: { net: boolean }) => (
  <>
    <br />
    {net ? "Internet aloqasini tekshirib, qayta urining." : "Birozdan so'ng qayta urinib ko'ring."}
  </>
);

/** Ma'lumot yuklash: yuklanmoqda / xato / tayyor; reload() — qayta so'rash (fon yangilanishida skeletsiz). */
export function useLoad<T>(
  fn: () => Promise<T>,
  deps: unknown[],
): { data: T | undefined; err: string; net: boolean; at: number; reload: () => Promise<void> } {
  const [data, setData] = useState<T>();
  const [err, setErr] = useState("");
  const [net, setNet] = useState(false);
  const [at, setAt] = useState(0); // oxirgi muvaffaqiyatli yuklanish (ms) — fon yangilanishi yiqilsa "eskirgan" ko'rsatish uchun
  const f = useRef(fn);
  useLayoutEffect(() => {
    f.current = fn;
  });
  // so'rov raqami: sekin eski javob (fon polling) yangisining ustiga yozmasin
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const id = ++seq.current;
    try {
      const d = await f.current();
      if (id !== seq.current) return;
      setData(d);
      setErr("");
      setAt(Date.now());
    } catch (e) {
      if (id !== seq.current) return;
      setErr((e as Error).message);
      setNet(isNetErr(e));
    }
  }, []);
  // deps o'zgarsa yangi ma'lumot; yangi ekran uchun komponentga `key` bering (eski ma'lumot ko'rinmasin)
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, err, net, at, reload };
}

/** Yuklash holatini ko'rsatish: xato → "Xatolik", ma'lumot yo'q → skelet. */
export function Loaded<T>({
  st,
  children,
}: {
  st: { data: T | undefined; err: string; net?: boolean; reload?: () => Promise<void> };
  children: (d: T) => ReactNode;
}) {
  if (st.err && st.data === undefined)
    return (
      <Empty icon="alert" title="Yuklab bo'lmadi">
        {st.err}
        <ErrHint net={!!st.net} />
        {st.reload ? (
          <div className="btns">
            <button className="btn sec" onClick={() => void st.reload?.()}>
              Qayta urinish
            </button>
          </div>
        ) : null}
      </Empty>
    );
  if (st.data === undefined) return <Skeleton />;
  return <>{children(st.data)}</>;
}

// ------------------------------------------------------------ kirish (brauzer, sessiya yo'q)
function Login() {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState("Tayyorlanmoqda…");
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(LOGIN_EVENT, on);
    return () => window.removeEventListener(LOGIN_EVENT, on);
  }, []);
  useEffect(() => {
    if (!open) return;
    let stop = false;
    (async () => {
      try {
        const r = await fetch("/app/api/login/start", { method: "POST", credentials: "same-origin" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.link || !d.token) throw new Error(d.detail || `HTTP ${r.status}`);
        setLink(d.link);
        setMsg("Tasdiqlash kutilmoqda…");
        const t0 = Date.now();
        const tick = async () => {
          if (stop) return;
          if (Date.now() - t0 > 3e5) return setMsg("Vaqt tugadi — sahifani yangilang");
          try {
            const p = await fetch(`/app/api/login/poll?token=${encodeURIComponent(d.token)}`, { credentials: "same-origin" });
            const j = await p.json().catch(() => ({}));
            if (p.ok && j.ok) return location.reload();
          } catch {
            // tarmoq uzilishi — polling to'xtamasin, keyingi urinishda davom etadi
          }
          setTimeout(tick, 2000);
        };
        setTimeout(tick, 2000);
      } catch (e) {
        setMsg("Xato: " + (e as Error).message);
      }
    })();
    return () => {
      stop = true;
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="sheet-bg on" />
      <div className="sheet on" role="dialog" aria-modal="true" aria-label="Kirish">
        <div className="grab" />
        <div className="hd">
          <span className="x" />
          <h2>Kirish</h2>
          <span className="x" />
        </div>
        <div className="bd">
          <Empty icon="send" title="Telegram orqali kirish">
            Botda «Kirish»ni tasdiqlang — sahifa o&apos;zi ochiladi.
          </Empty>
          <div className="btns">
            <a className="btn" href={link || undefined} target="_blank" rel="noreferrer">
              Telegram&apos;ni ochish
            </a>
          </div>
          <div className="sf" style={{ textAlign: "center" }}>
            {msg}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
