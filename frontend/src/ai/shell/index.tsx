"use client";
// Boshqaruv paneli qobig'i — eski admin.html 234–355 va 999–1051: boot (rol → qism / yo'naltirish), kontekst (AdminApi),
// oynalar navbati (BackButton bilan), toast, tablar, Esc; ko'rinish — ./ui, kirish — ./login.
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";

import { api } from "@/shared/api/client";
import { backOff, backShow, confirmDo, disableZoom, haptic, hapticSelect, initData, initTelegram, tg } from "@/shared/telegram/telegram";
import {
  ADMIN_ONLY_TABS,
  AREAS,
  AdminContext,
  TABS,
  type AdminApi,
  type Area,
  type Me,
  type Overview,
  type Prefs,
  type TabKey,
  type ToastKind,
} from "./AdminContext";
import { isFullscreen } from "./fullscreen-flag";
import { LoginView } from "./login";
import { ShellView, TabButton, type Mode, type SheetItem, type ToastState } from "./ui";
import AuditSection from "@/ai/audit";
import ChatSection from "@/ai/chat";
import { fromDept } from "@/ai/agents/model";
import GraphSection from "@/ai/graph";
import KbSection from "@/ai/kb";
import MemorySection from "@/ai/memory";
import AgentsSection from "@/ai/agents";
import SystemSection from "@/ai/system";
import TemplatesSection from "@/ai/templates";
import UsersSection from "@/ai/users";

const SECTIONS: Record<TabKey, ComponentType> = {
  chat: ChatSection,
  agents: AgentsSection,
  users: UsersSection,
  templates: TemplatesSection,
  memory: MemorySection,
  kb: KbSection,
  audit: AuditSection,
  graph: GraphSection as ComponentType,
  system: SystemSection,
};


const PANEL_ROLES = ["owner", "admin"];

/** area — panelning qismi: jarvis (AI), staff (xodimlar), templates (shablonlar), dev (texnik) — AREAS. */
export default function Shell({ area = "jarvis" }: { area?: Area }) {
  const A = AREAS[area];
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [me, setMe] = useState<Me | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [readonly, setReadonly] = useState(false);
  const [limited, setLimited] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [tab, setTabState] = useState<TabKey>(A.tabs[0]);
  const [renderKey, setRenderKey] = useState(0);
  const [spin, setSpin] = useState(0);
  const [prefs, setPrefs] = useState<Prefs>({ usersView: "tree", agentsView: "tree", memView: "list", kbView: "tree", graphScope: "all", auditVoice: false });
  const [sheets, setSheets] = useState<SheetItem[]>([]);
  const sheetsRef = useRef<SheetItem[]>([]);
  useEffect(() => {
    sheetsRef.current = sheets;
  }, [sheets]);
  const isSheetOpen = useCallback(() => sheetsRef.current.some((x) => !x.closing), []);
  const [toastSt, setToastSt] = useState<ToastState | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const render = useCallback(() => setRenderKey((n) => n + 1), []);

  const reloadOverview = useCallback(async () => {
    const o = await api<Overview>("/app/api/overview");
    setOverview(o);
    return o;
  }, []);

  const toast = useCallback((msg: string, kind: ToastKind = "ok") => {
    setToastSt({ msg, kind, shown: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastSt((t) => t && { ...t, shown: false }), 3200);
    haptic(kind === "err" ? "error" : "success");
  }, []);

  // eski openSheet/closeSheet: barqaror funksiyalar (BackButton.offClick xuddi o'sha havolani talab qiladi)
  const [sheetApi] = useState(() => {
    let seq = 0;
    let live: number[] = []; // ochiq (yopilmayotgan) oynalar
    let inDom = 0; // DOM'dagi (yopilayotganlar bilan) — eski `document.querySelector(".sheet")`
    const close = () => {
      const ids = live;
      live = [];
      if (ids.length) {
        setSheets((l) => l.map((x) => (ids.includes(x.id) ? { ...x, closing: true } : x)));
        setTimeout(() => {
          inDom -= ids.length;
          setSheets((l) => l.filter((x) => !ids.includes(x.id)));
        }, 250);
      }
      // graf to'liq ekranda bo'lsa "Orqaga" tugmasi qoladi (to'liq ekrandan chiqish uchun)
      backOff(close, !isFullscreen());
    };
    const open = (node: ReactNode) => {
      const hadSheet = inDom > 0;
      close();
      setTimeout(
        () => {
          const id = ++seq;
          live = [...live, id];
          inDom += 1;
          setSheets((l) => [...l, { id, node, closing: false }]);
          backShow(close);
        },
        hadSheet ? 260 : 0,
      );
    };
    return { open, close };
  });

  const setTab = useCallback(
    (k: TabKey) => {
      if (k === tab) return window.scrollTo({ top: 0, behavior: "smooth" });
      setTabState(k);
      hapticSelect();
      render();
      window.scrollTo(0, 0);
    },
    [tab, render],
  );

  const setPref = useCallback(
    <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
      setPrefs((p) => ({ ...p, [k]: v }));
      render();
    },
    [render],
  );

  const boot = useCallback(async () => {
    try {
      const m = await api<Me>("/app/api/me");
      setMe(m);
      setShowLogout(!initData());
      setReadonly(false);
      setLimited(false);
      const panel = PANEL_ROLES.includes(m.user.role);
      if (!panel && m.can_view) {
        setReadonly(true);
        reloadOverview().catch(() => {});
        setMode({ kind: "app" });
        return render();
      }
      if (!panel) {
        try {
          await api("/app/api/templates");
          // faqat shablonlarga ruxsat (IT) — boshqa qismlardan Shablonlar sahifasiga
          if (area !== "templates") {
            window.location.replace("/app/templates");
            return;
          }
          setLimited(true);
          setMode({ kind: "app" });
          return render();
        } catch {
          // oddiy xodim (sotuvchi): avval bugungi hisobot formasi; Lenta/xaritaga formadagi havolalar orqali
          const rd = m.report_depts?.[0];
          if (rd) {
            window.location.replace(`/app/report?dept=${encodeURIComponent(rd)}`);
            return;
          }
          if (m.can_lenta) {
            window.location.replace("/app/lenta");
            return;
          }
          setMode({ kind: "err", msg: "Panel faqat adminlar, bo'lim boshliqlari va IT uchun." });
          return;
        }
      }
      reloadOverview().catch(() => {});
      setMode({ kind: "app" });
      render();
    } catch (e) {
      const msg = (e as Error).message;
      if (!initData() && /Kirish|401/.test(msg)) return setMode({ kind: "login", msg: "" });
      setMode({ kind: "err", msg });
    }
  }, [reloadOverview, render, area]);

  async function logout() {
    await api("/app/api/logout", { method: "POST" }).catch(() => {});
    setMode({ kind: "login", msg: "Chiqdingiz." });
    setShowLogout(false);
  }

  async function refresh() {
    setSpin((n) => n + 1);
    if (tab !== "templates" || !limited) await reloadOverview().catch(() => {});
    render();
  }

  useEffect(() => {
    initTelegram();
    const undoZoom = disableZoom();
    const root = document.documentElement;
    const t = tg();
    if (initData()) root.classList.add("tg");
    if (initData() && t?.colorScheme) root.style.colorScheme = t.colorScheme; // Telegram kunduzgi/tungi
    t?.setHeaderColor?.("bg_color");
    t?.setBackgroundColor?.("secondary_bg_color");
    // boot asinxron: setState faqat `await api("/app/api/me")` dan keyin (sinxron kaskad yo'q) — qoida noto'g'ri ogohlantiradi
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void boot();
    return undoZoom;
    // boot faqat bir marta (keyingilari — kirishdan so'ng)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // brauzer (kompyuter): ochiq oynani Esc yopadi — Telegram'da buni BackButton qiladi
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSheetOpen()) sheetApi.close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isSheetOpen, sheetApi]);

  const agents = useMemo(() => overview?.agents ?? (overview?.departments ?? []).map(fromDept), [overview]);
  const ctx: AdminApi = useMemo(
    () => ({
      me,
      overview,
      depts: overview?.departments ?? [],
      agents,
      readonly,
      limited,
      reloadOverview,
      toast,
      confirm: confirmDo,
      openSheet: sheetApi.open,
      closeSheet: sheetApi.close,
      isSheetOpen,
      tab,
      setTab,
      render,
      prefs,
      setPref,
    }),
    [me, overview, agents, readonly, limited, reloadOverview, toast, sheetApi, isSheetOpen, tab, setTab, render, prefs, setPref],
  );

  const app = mode.kind === "app";
  const tabList = app
    ? TABS.filter(
        ([k]) => A.tabs.includes(k) && (!limited || k === "templates") && (!readonly || !ADMIN_ONLY_TABS.includes(k)),
      )
    : [];
  // bitta tabli qism (Xodimlar, Shablonlar) — tab paneli kerak emas
  const tabs = tabList.length > 1
    ? tabList.map(([k, t, icon]) => {
        const n = k === "users" ? overview?.pending_users : k === "memory" ? overview?.pending_memory : 0;
        return <TabButton key={k} on={tab === k} title={t} icon={icon} n={n} onClick={() => setTab(k)} />;
      })
    : null;
  const Section = SECTIONS[tab];

  return (
    <AdminContext.Provider value={ctx}>
      <ShellView
        area={A}
        me={me}
        mode={mode}
        readonly={readonly}
        showLogout={showLogout}
        spin={spin}
        tabs={tabs}
        login={mode.kind === "login" ? <LoginView msg={mode.msg} onLogin={() => void boot()} /> : null}
        section={<Section />}
        sectionKey={`${tab}:${renderKey}`}
        sheets={sheets}
        toastSt={toastSt}
        onRefresh={() => void refresh()}
        onLogout={() => void logout()}
        onCloseSheet={sheetApi.close}
      />
    </AdminContext.Provider>
  );
}

export { LoginView };
