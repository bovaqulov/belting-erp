// ERP muhiti — erp_ui.js ning React'dan tashqari qismlari: Telegram (faqat initData bo'lsa), haptic, toast, signal
// (ovoz + ekran chaqnashi), QR skaner, tasdiq oynasi, fayl yuklab olish, API (401 → kirish oynasi hodisasi).
// toast/flash — React daraxtidan tashqarida (DOM), eski sahifalardagi bilan bir xil sinflar (erp_ui.css).
import { ApiError, api as baseApi } from "@/shared/api/client";
import { ICONS } from "@/shared/icons/lucide";
import { confirmDo, initData, lockZoom, tg as rawTg, type TgWebApp } from "@/shared/telegram/telegram";
import { svgMarkup } from "@/shared/ui/svg-icon";

type TgFull = TgWebApp & {
  MainButton?: {
    setParams(p: Record<string, unknown>): void;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
  };
  themeParams?: Record<string, string>;
  isVersionAtLeast?(v: string): boolean;
  showScanQrPopup?(p: { text?: string }, cb: (v: string) => boolean | void): void;
  closeScanQrPopup?(): void;
  downloadFile?(p: { url: string; file_name: string }): void;
  openLink?(url: string): void;
  onEvent?(e: string, cb: () => void): void;
  setBottomBarColor?(c: string): void;
};

/** Telegram WebApp — faqat haqiqiy Mini App ichida (initData bor). Brauzerda null. */
export function etg(): TgFull | null {
  return initData() ? (rawTg() as TgFull | null) : null;
}

const ver = (v: string) => {
  try {
    return !!etg()?.isVersionAtLeast?.(v);
  } catch {
    return false;
  }
};

export const hap = {
  tap: () => etg()?.HapticFeedback?.selectionChanged?.(),
  soft: () => etg()?.HapticFeedback?.impactOccurred?.("light"),
  ok: () => etg()?.HapticFeedback?.notificationOccurred?.("success"),
  err: () => etg()?.HapticFeedback?.notificationOccurred?.("error"),
};

export const iconSvg = (n: string): string => svgMarkup(ICONS[n] ?? ICONS.file, "i");

let toastT: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, kind: "ok" | "bad" | "info" = "ok"): void {
  let t = document.querySelector<HTMLDivElement>(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.append(t);
  }
  t.innerHTML = kind === "bad" ? iconSvg("alert") : kind === "ok" ? iconSvg("check") : "";
  const sp = document.createElement("span");
  sp.textContent = text;
  t.append(sp);
  t.style.background = kind === "bad" ? "rgba(180,35,40,.95)" : "rgba(30,30,30,.92)";
  const el = t;
  requestAnimationFrame(() => el.classList.add("on"));
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("on"), kind === "bad" ? 4500 : 2200);
  if (kind === "bad") hap.err();
  else hap.ok();
}

let actx: AudioContext | undefined;
/** Skaner signali: ovoz + ekran chaqnashi + tebranish */
export function beep(ok: boolean): void {
  try {
    actx = actx ?? new AudioContext();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.frequency.value = ok ? 880 : 220;
    o.type = ok ? "sine" : "square";
    g.gain.value = 0.12;
    o.connect(g);
    g.connect(actx.destination);
    o.start();
    o.stop(actx.currentTime + (ok ? 0.07 : 0.4));
  } catch {
    /* ovozsiz */
  }
  let f = document.querySelector<HTMLDivElement>(".flash");
  if (!f) {
    f = document.createElement("div");
    document.body.append(f);
  }
  const el = f;
  el.className = "flash " + (ok ? "ok" : "bad");
  setTimeout(() => (el.className = "flash"), 300);
  if (ok) hap.ok();
  else hap.err();
}

/** Kamera QR skaneri (faqat Telegram 6.4+). cb false qaytarsa — oyna yopiladi. */
export function scanQR(cb: (v: string) => void, text = "QR yoki shtrixkodni skanerlang"): void {
  const t = etg();
  if (!t || !ver("6.4") || !t.showScanQrPopup) {
    toast("Kamera skaneri faqat Telegram ichida", "bad");
    return;
  }
  t.showScanQrPopup({ text }, (v) => {
    t.closeScanQrPopup?.();
    cb(v);
    return true;
  });
}

export const confirm = (msg: string): Promise<boolean> => confirmDo(msg);

/** PDF havolasini yuklab olish: Telegram 8.0+ — downloadFile, eski Telegram — openLink, brauzer — <a download>. */
export function download(url: string, name = "stiker.pdf"): void {
  const full = location.origin + url;
  const t = etg();
  if (t && ver("8.0") && t.downloadFile) {
    try {
      t.downloadFile({ url: full, file_name: name });
      return;
    } catch {
      /* pastga */
    }
  }
  if (t?.openLink) {
    t.openLink(full);
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}

/** Brauzerda sessiya yo'q (401) — <Login/> oynasini ochish hodisasi */
export const LOGIN_EVENT = "erp:login";

export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  try {
    return await baseApi<T>(path, body === undefined ? {} : { method: "POST", body });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && !initData()) {
      window.dispatchEvent(new Event(LOGIN_EVENT));
      throw new Error("Kirish talab qilinadi");
    }
    throw e;
  }
}

export const post = <T = unknown>(path: string, body: unknown = {}): Promise<T> => api<T>(path, body);

/** Telegram muhiti: sinflar (erp_ui.css), mavzu, kengaytirish; zoom imo-ishoralari o'chiq. Bir marta chaqiriladi. */
let envDone = false;
export function initErpEnv(): void {
  if (envDone || typeof window === "undefined") return;
  envDone = true;
  const t = etg();
  if (t) {
    document.documentElement.classList.add("tg");
    document.body.classList.add("in-tg");
    const theme = () => {
      document.documentElement.classList.toggle("tg-light", t.colorScheme === "light");
      t.setHeaderColor?.("secondary_bg_color");
      t.setBackgroundColor?.("secondary_bg_color");
      t.setBottomBarColor?.("secondary_bg_color");
    };
    lockZoom();
    t.ready();
    t.expand();
    theme();
    t.disableVerticalSwipes?.();
    t.onEvent?.("themeChanged", theme);
    // pinch-zoom — faqat Telegram ichida o'chiq (brauzerda yoqiq)
    for (const e of ["gesturestart", "gesturechange"]) document.addEventListener(e, (ev) => ev.preventDefault(), { passive: false });
  }
}
