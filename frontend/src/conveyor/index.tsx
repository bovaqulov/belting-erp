"use client";
// Lenta chizmasi (/app/lenta) — eski backend/src/jarvis/office/static/lenta.html. Qobiq: holat — Lenta kontrolleri (model/),
// boot, klaviatura (Esc, Ctrl+Z/Y/S), Telegram mavzusi; narx oynasi (tashqariga bosilsa yopiladi), pastki panel balandligi,
// brauzerda kirish (/login/start → poll). Ko'rinish — ./ui.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { api } from "@/shared/api/client";
import { disableZoom, initData, initTelegram, tg } from "@/shared/telegram/telegram";
import { Composer, Side } from "@/conveyor/form";
import Fullscreen from "@/conveyor/fullscreen";
import { observeResize } from "@/conveyor/kit";
import { barChips, sized } from "@/conveyor/lib/logic";
import { askMeta } from "@/conveyor/meta-ask";
import { openMenu } from "@/conveyor/menu";
import { Lenta, LentaContext } from "@/conveyor/model";
import Center from "@/conveyor/viewer";

import { ActBarView, ConveyorView, LoginScreen, PricePopView, type LoginMsg } from "./ui";

const POLL_MS = 2000;
const POLL_MAX_MS = 300000;

function LoginView({ L, msg }: { L: Lenta; msg: string }) {
  const t = L.t;
  const [lmsg, setLmsg] = useState<LoginMsg>({ kind: "text", text: msg });
  const timers = useRef(new Set<number>());
  useEffect(() => {
    const ts = timers.current;
    return () => ts.forEach((id) => clearTimeout(id));
  }, []);
  async function startLogin() {
    try {
      const { token, link } = await api<{ token: string; link: string }>("/app/api/login/start", { method: "POST" });
      window.open(link, "_blank");
      setLmsg({ kind: "link", link });
      const started = Date.now();
      const later = (fn: () => void) => {
        const id = window.setTimeout(() => {
          timers.current.delete(id);
          fn();
        }, POLL_MS);
        timers.current.add(id);
      };
      const poll = async () => {
        if (Date.now() - started > POLL_MAX_MS) {
          setLmsg({ kind: "text", text: t("Vaqt tugadi, qayta urining.", "Время вышло, попробуйте снова.") });
          return;
        }
        try {
          const r = await api<{ ok?: boolean }>(`/app/api/login/poll?token=${encodeURIComponent(token)}`);
          if (r.ok) return void L.boot();
        } catch (e) {
          setLmsg({ kind: "text", text: (e as Error).message });
          return;
        }
        later(poll);
      };
      later(poll);
    } catch (e) {
      setLmsg({ kind: "text", text: (e as Error).message });
    }
  }
  return <LoginScreen t={t} ru={L.LANG === "ru"} lmsg={lmsg} onStart={() => void startLogin()} />;
}

function PricePop({ L }: { L: Lenta }) {
  const t = L.t;
  const p = L.PRICE;
  // eski: tashqariga bosilsa yopiladi (keyingi tsikldan boshlab)
  useEffect(() => {
    let off: ((e: MouseEvent) => void) | null = null;
    const id = setTimeout(() => {
      off = (e: MouseEvent) => {
        if (!(e.target as Element).closest?.("#pricePop, #priceBtn")) {
          L.closePop();
          if (off) document.removeEventListener("click", off);
        }
      };
      document.addEventListener("click", off);
    }, 0);
    return () => {
      clearTimeout(id);
      if (off) document.removeEventListener("click", off);
    };
  }, [L]);
  return <PricePopView t={t} p={p} lang={L.LANG} />;
}

function ActBar({ L }: { L: Lenta }) {
  const t = L.t;
  const ref = useRef<HTMLDivElement>(null);
  const S = L.S;
  const app = L.mode.kind === "app" && !!S;
  // pastki panel balandligi (sabab yozuvi, safe-area bilan o'zgaradi) -> kontentning pastki chekinishi
  useEffect(() => {
    const bar = ref.current as HTMLDivElement;
    const upd = () => document.documentElement.style.setProperty("--bar-real", (bar.classList.contains("cv-hide") ? 0 : bar.offsetHeight) + "px");
    upd();
    return observeResize(bar, upd);
  }, []);
  const chips = S ? barChips(S, L.LANG, L.LAST.hints) : [];
  const ok = sized(S) && !L.LAST.blocked && (L.LAST.sheets || []).length > 0 && !L.busy && !L.renderFail;
  const has = sized(S);
  // "tayyorlanmoqda" — tugmaning o'zida (aylanuvchi belgi): har qayta chizishda panel balandligi o'zgarib, chizma sakramasin
  const why =
    !has || L.busy
      ? ""
      : L.renderFail
        ? t("Chizma yangilanmadi — qayta urinib ko'ring", "Чертёж не обновился — повторите")
        : L.LAST.blocked
          ? t("Konfiguratsiyada xato — qizil yozuvni tuzating", "Ошибка в конфигурации — исправьте красное сообщение")
          : "";
  return (
    <ActBarView
      t={t}
      lang={L.LANG}
      barRef={ref}
      app={app}
      has={has}
      ok={ok}
      busy={L.busy}
      sending={L.sending}
      sendLock={L.sendLock}
      why={why}
      chips={chips}
      P={L.PRICE}
      popOpen={L.popOpen}
      composer={app ? <Composer key={L.buildSeq} /> : null}
      onPrice={L.togglePrice}
      onSend={() => void L.doSend()}
    />
  );
}

export default function ConveyorApp() {
  const [L] = useState(() => new Lenta());
  useSyncExternalStore(L.subscribe, L.getVersion, () => 0);

  useEffect(() => {
    initTelegram();
    // chizmani kattalashtirish ko'ruvchining o'zida (pinch/scroll); ikki marta bosish .stage da ruxsat
    const undoZoom = disableZoom("input,textarea,select,[data-stage]");
    const root = document.documentElement;
    const t = tg();
    if (initData()) root.classList.add("tg");
    // Telegram mavzusi: color-scheme (brauzer boshqaruvlari) va data-scheme (yorug' mavzudagi zaxira ranglar — lenta-global.css);
    // mavzu ilova ochiq turganda almashsa ham yangilanadi
    const ev = t as (typeof t & { onEvent?: (e: string, cb: () => void) => void; offEvent?: (e: string, cb: () => void) => void }) | null;
    const scheme = () => {
      if (!initData() || !t?.colorScheme) return;
      root.style.colorScheme = t.colorScheme;
      root.dataset.scheme = t.colorScheme;
    };
    scheme();
    ev?.onEvent?.("themeChanged", scheme);
    t?.setHeaderColor?.("bg_color");
    t?.setBackgroundColor?.("secondary_bg_color");
    L.setAskMeta(askMeta(L));
    L.init();
    void L.boot();
    const key = (e: KeyboardEvent) => {
      // Esc — eng ustki qatlam yopiladi (to'liq ekranni Fullscreen o'zi yopadi)
      if (e.key === "Escape" && L.fsIndex === null) {
        if (L.sheets.some((x) => !x.closing)) L.closeSheet();
        else if (L.popOpen) L.closePop();
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || !L.S) return;
      const k = e.key.toLowerCase();
      if ((e.target as Element).closest?.("input, textarea") && (k === "z" || k === "y")) return; // matn maydonida brauzerning o'z undo'si
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        L.undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        L.redo();
      } else if (k === "s") {
        e.preventDefault();
        void L.doSave();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      undoZoom();
      ev?.offEvent?.("themeChanged", scheme);
      document.removeEventListener("keydown", key);
      L.dispose();
    };
  }, [L]);

  // erta xato ushlagich (layout.tsx) chiqargan xabar — sahifa yuklangach (eskidagidek #app qayta quriladi) olib tashlanadi
  const loading = L.mode.kind === "loading";
  useEffect(() => {
    if (!loading) document.getElementById("lentaFatal")?.remove();
  }, [loading]);

  const t = L.t;
  const app = L.mode.kind === "app" && !!L.S;
  return (
    <LentaContext.Provider value={L}>
      <ConveyorView
        t={t}
        mode={L.mode}
        app={app}
        showBack={L.showBack}
        who={L.who}
        login={L.mode.kind === "login" ? <LoginView key={L.mode.msg} L={L} msg={L.mode.msg} /> : null}
        body={
          <>
            <Side key={`s${L.buildSeq}`} />
            <Center key={`c${L.buildSeq}`} />
          </>
        }
        actbar={<ActBar L={L} />}
        pricePop={L.popOpen && L.PRICE ? <PricePop L={L} /> : null}
        sheets={L.sheets}
        fullscreen={L.fsIndex !== null ? <Fullscreen key={L.fsKey} sheets={L.fsSheets} start={L.fsIndex} onClose={L.closeViewer} t={t} /> : null}
        toastSt={L.toastSt}
        onMenu={() => openMenu(L)}
        onCloseSheet={L.closeSheet}
      />
    </LentaContext.Provider>
  );
}
