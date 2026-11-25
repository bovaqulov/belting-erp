// Telegram Mini App (WebApp) — xavfsiz o'ram. Ko'prik ishlamasa (masalan Windows Telegram Desktop) sahifa to'xtamasin:
// har metod chaqiruvi try/catch ichida. Asl obyekt o'zgarmas (non-configurable) — Proxy bo'sh obyekt ustida.
// Prerender (build) paytida `window` yo'q — barcha funksiyalar brauzerda chaqiriladi.

export interface TgButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

export interface TgWebApp {
  initData: string;
  colorScheme?: "light" | "dark";
  platform?: string;
  isFullscreen?: boolean;
  isVersionAtLeast?(v: string): boolean;
  requestFullscreen?(): void;
  onEvent?(e: string, cb: () => void): void;
  ready(): void;
  expand(): void;
  close(): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  showAlert?(msg: string): void;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  BackButton?: TgButton;
  HapticFeedback?: {
    notificationOccurred?(t: "success" | "error" | "warning"): void;
    selectionChanged?(): void;
    impactOccurred?(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

function safe<T extends object>(o: T): T {
  return new Proxy({} as T, {
    get(_, k) {
      const v = (o as Record<PropertyKey, unknown>)[k];
      if (typeof v === "function") {
        return (...a: unknown[]) => {
          try {
            return (v as (...x: unknown[]) => unknown).apply(o, a);
          } catch (e) {
            console.warn("tg." + String(k), e);
          }
        };
      }
      if (v && typeof v === "object" && /Button$|HapticFeedback|CloudStorage/.test(String(k))) return safe(v as object);
      return v;
    },
    has(_, k) {
      return k in o;
    },
  });
}

let cached: TgWebApp | null | undefined;

/** Telegram WebApp (yoki null — oddiy brauzer). */
export function tg(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  if (cached === undefined) {
    const raw = window.Telegram?.WebApp;
    cached = raw ? safe(raw) : null;
  }
  return cached;
}

/** initData: WebApp'dan, bo'lmasa URL hash'idan (tgWebAppData) — eski sahifalardagidek. */
export function initData(): string {
  const t = tg();
  if (t?.initData) return t.initData;
  if (typeof window === "undefined") return "";
  try {
    return new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppData") ?? "";
  } catch {
    return "";
  }
}

/** Telegram ichida viewport'ni zoom'siz qilish (egasi qarori: ilova kabi). Brauzerda zoom qoladi (ko'rish qiyin bo'lsa). */
export function lockZoom(): void {
  const vp = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (vp) vp.content = "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
}

/** Ilova kabi: pinch-zoom va ikki marta bosib kattalashtirish o'chiriladi (eski sahifalardagi skript) — faqat Telegram
 *  ichida; brauzerda hech narsa qilmaydi. allow — ikki marta bosish ruxsat etilgan elementlar (lenta: + "[data-stage]"). */
export function disableZoom(allow = "input,textarea,select"): () => void {
  if (!initData()) return () => {};
  lockZoom();
  const prevent = (ev: Event) => ev.preventDefault();
  const multi = (ev: TouchEvent) => {
    if (ev.touches && ev.touches.length > 1) ev.preventDefault();
  };
  let last = 0;
  const dbl = (ev: TouchEvent) => {
    const n = Date.now();
    const t = ev.target as Element | null;
    if (n - last < 300 && !t?.closest?.(allow)) ev.preventDefault();
    last = n;
  };
  const opt = { passive: false } as const;
  const gest = ["gesturestart", "gesturechange", "gestureend"];
  gest.forEach((e) => document.addEventListener(e, prevent, opt));
  document.addEventListener("touchmove", multi, opt);
  document.addEventListener("touchend", dbl, opt);
  return () => {
    gest.forEach((e) => document.removeEventListener(e, prevent));
    document.removeEventListener("touchmove", multi);
    document.removeEventListener("touchend", dbl);
  };
}

let fsBound = false;

/** Telefonda (iOS/Android, Bot API 8.0+) to'liq ekran: Telegram sarlavhasi yo'qoladi, yopish/«…» tugmalari sahifa ustida
 *  suzadi. html.tg-fs — base.css shu holatda kontentni --tg-*safe-area* qadar pastga suradi. Kompyuterda yoqilmaydi
 *  (u yerda butun oynani to'liq ekranga o'tkazardi). */
export function fullscreen(t: TgWebApp): void {
  if ((t.platform !== "ios" && t.platform !== "android") || !t.isVersionAtLeast?.("8.0")) return;
  const mark = () => document.documentElement.classList.toggle("tg-fs", !!t.isFullscreen);
  if (!fsBound) {
    t.onEvent?.("fullscreenChanged", mark);
    fsBound = true;
  }
  if (!t.isFullscreen) t.requestFullscreen?.();
  mark();
}

/** Sahifa ochilishida: ready + expand (telefonda to'liq ekran) + vertikal surishni o'chirish. */
export function initTelegram(): void {
  const t = tg();
  t?.ready();
  t?.expand();
  if (t) fullscreen(t);
  t?.disableVerticalSwipes?.();
}

// ---------------- haptic, BackButton, showConfirm (admin va lenta uchun umumiy) ----------------
type HapticKind = "success" | "error" | "warning";

/** haptic(t = "success") — notificationOccurred */
export const haptic = (t: HapticKind = "success"): void => tg()?.HapticFeedback?.notificationOccurred?.(t);

/** Tanlov almashganda (tab, segment) */
export const hapticSelect = (): void => tg()?.HapticFeedback?.selectionChanged?.();

/** BackButton.show() + onClick(cb) */
export function backShow(cb: () => void): void {
  const b = tg()?.BackButton;
  b?.show();
  b?.onClick(cb);
}

/** BackButton.offClick(cb); hide=false — tugma ko'rinib qoladi (ustida boshqa qatlam ochiq bo'lsa). */
export function backOff(cb: () => void, hide = true): void {
  const b = tg()?.BackButton;
  b?.offClick(cb);
  if (hide) b?.hide();
}

export const backHide = (): void => tg()?.BackButton?.hide();

type TgConfirm = TgWebApp & { showConfirm?: (msg: string, cb: (ok: boolean) => void) => void };

/** confirmDo: Telegram ichida showConfirm (asl obyektda — callback'li), bo'lmasa brauzer confirm(). */
export function confirmDo(msg: string): Promise<boolean> {
  return new Promise((resolve) => {
    const raw = window.Telegram?.WebApp as TgConfirm | undefined;
    if (initData() && raw?.showConfirm) {
      try {
        raw.showConfirm(msg, resolve);
        return;
      } catch {
        /* ko'prik ishlamasa — brauzer oynasi */
      }
    }
    resolve(window.confirm(msg));
  });
}
