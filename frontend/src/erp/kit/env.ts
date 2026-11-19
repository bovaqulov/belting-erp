// ERP muhiti — erp_ui.js ning React'dan tashqari qismlari: Telegram (faqat initData bo'lsa), haptic, toast, signal
// (ovoz + ekran chaqnashi), QR skaner, tasdiq oynasi, fayl yuklab olish, API (401 → kirish oynasi hodisasi).
// toast/flash — React daraxtidan tashqarida (DOM), Tailwind utility sinflari bilan (holat — data-on / data-k).
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

/** Telegram tashqarisida (Android brauzer, skaner-telefon) — navigator.vibrate */
const vib = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* tebranish yo'q */
  }
};
const hf = () => etg()?.HapticFeedback;
export const hap = {
  tap: () => (hf() ? hf()?.selectionChanged?.() : vib(8)),
  soft: () => (hf() ? hf()?.impactOccurred?.("light") : vib(12)),
  ok: () => (hf() ? hf()?.notificationOccurred?.("success") : vib(30)),
  err: () => (hf() ? hf()?.notificationOccurred?.("error") : vib([80, 60, 80])),
  warn: () => (hf() ? hf()?.notificationOccurred?.("warning") : vib([40, 40, 40])),
};

export const iconSvg = (n: string): string => svgMarkup(ICONS[n] ?? ICONS.file, "i");

// pastda markazda; pastki asosiy tugma bo'lsa — undan yuqorida
const TOAST =
  "fixed bottom-[calc(24px+var(--safe-b))] left-1/2 z-80 flex max-w-[calc(100%-32px)] -translate-x-1/2 translate-y-5 items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white opacity-0 shadow-[0_6px_24px_rgba(0,0,0,.3)] transition-[opacity,transform] duration-[220ms] has-main:bottom-[calc(84px+var(--safe-b))] data-on:translate-y-0 data-on:opacity-100 [&_svg.i]:size-[18px]";
// skaner signali: butun ekran bir lahza yashil/qizil
const FLASH =
  "pointer-events-none fixed inset-0 z-90 opacity-0 transition-opacity duration-[250ms] data-[k=bad]:bg-[rgba(236,57,66,.32)] data-[k=bad]:opacity-100 data-[k=ok]:bg-[rgba(49,181,69,.22)] data-[k=ok]:opacity-100";

let toastT: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, kind: "ok" | "bad" | "info" = "ok"): void {
  let t = document.querySelector<HTMLDivElement>("[data-toast]");
  if (!t) {
    t = document.createElement("div");
    t.dataset.toast = "";
    t.className = TOAST;
    document.body.append(t);
  }
  t.innerHTML = kind === "bad" ? iconSvg("alert") : kind === "ok" ? iconSvg("check") : "";
  const sp = document.createElement("span");
  sp.textContent = text;
  t.append(sp);
  t.style.background = kind === "bad" ? "rgba(180,35,40,.95)" : "rgba(30,30,30,.92)";
  const el = t;
  requestAnimationFrame(() => (el.dataset.on = ""));
  clearTimeout(toastT);
  toastT = setTimeout(() => delete el.dataset.on, kind === "bad" ? 4500 : 2200);
  if (kind === "bad") hap.err();
  else hap.ok();
}

let actx: AudioContext | undefined;
/** Ohanglar ketma-ketligi: [chastota Hz, davom s][] */
function tones(seq: [number, number][], type: OscillatorType): void {
  try {
    actx = actx ?? new AudioContext();
    let t = actx.currentTime;
    for (const [f, d] of seq) {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.frequency.value = f;
      o.type = type;
      g.gain.value = 0.12;
      o.connect(g);
      g.connect(actx.destination);
      o.start(t);
      o.stop(t + d);
      t += d + 0.04;
    }
  } catch {
    /* ovozsiz */
  }
}
/** Skaner signali: ovoz (yaxshi — bitta baland, xato — ikki past) + ekran chaqnashi + tebranish */
export function beep(ok: boolean): void {
  tones(
    ok
      ? [[880, 0.07]]
      : [
          [220, 0.18],
          [180, 0.22],
        ],
    ok ? "sine" : "square",
  );
  let f = document.querySelector<HTMLDivElement>("[data-flash]");
  if (!f) {
    f = document.createElement("div");
    f.dataset.flash = "";
    f.className = FLASH;
    document.body.append(f);
  }
  const el = f;
  el.dataset.k = ok ? "ok" : "bad";
  setTimeout(() => delete el.dataset.k, 300);
  if (ok) hap.ok();
  else hap.err();
}

/** Ogohlantirish (amal navbatga qo'yildi — internet yo'q): ikki o'rta ohang + tebranish */
export function beepWarn(): void {
  tones(
    [
      [520, 0.08],
      [520, 0.08],
    ],
    "triangle",
  );
  hap.warn();
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

export async function api<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  try {
    return await baseApi<T>(path, body === undefined ? { headers } : { method: "POST", body, headers });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && !initData()) {
      window.dispatchEvent(new Event(LOGIN_EVENT));
      throw new Error("Kirish talab qilinadi");
    }
    throw e;
  }
}

export const post = <T = unknown>(path: string, body: unknown = {}): Promise<T> => api<T>(path, body);

/** Telegram muhiti: sinflar (html.tg, body.in-tg — Tailwind tg: varianti), mavzu, kengaytirish; zoom imo-ishoralari o'chiq. Bir marta chaqiriladi. */
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
