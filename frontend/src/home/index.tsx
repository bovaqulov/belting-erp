"use client";
// /app — bo'lim tanlash: ERP, LentaCUD, GeoMaps, Analitika, Jarvis (AI), Development. Har kim faqat ruxsati bor bo'limni ko'radi; bitta bo'lsa —
// to'g'ridan-to'g'ri o'sha ochiladi; hech biri bo'lmasa — avvalgidek bugungi hisobot formasi (oddiy xodim).
import { useCallback, useEffect, useState } from "react";

import { LoginView } from "@/ai/shell";
import type { Me } from "@/ai/shell/AdminContext";
import { api } from "@/shared/api/client";
import { erpAccess } from "@/shared/auth/erp-access";
import { disableZoom, initData, initTelegram } from "@/shared/telegram/telegram";

import { LauncherView, type Card, type Mode } from "./ui";

const PANEL_ROLES = ["owner", "admin"];
const CARDS: Card[] = [
  { key: "erp", href: "/app/erp", title: "ERP", sub: "Ombor, savdo, sex, CRM, marketplace, moliya", color: "#3e88f7" },
  { key: "lenta", href: "/app/lenta", title: "LentaCUD", sub: "Konveyer lenta chizmasi, PDF va loyihalar", color: "#2fa37a" },
  { key: "geo", href: "/app/geo", title: "GeoMaps", sub: "Mijozlar xaritasi, hududlar, marshrutlar", color: "#12a4a0" },
  { key: "analytics", href: "/app/analytics", title: "Analitika", sub: "Savdo, ombor va marketplace ko'rsatkichlari", color: "#e5484d" },
  { key: "jarvis", href: "/app/jarvis", title: "Jarvis", sub: "AI agentlar, xotira, bilimlar, graph", color: "#9a5bea" },
  { key: "dev", href: "/app/dev", title: "Development", sub: "Audit, tizim holati va loglar", color: "#e8961f" },
];

async function allowed(m: Me): Promise<Set<string>> {
  const panel = PANEL_ROLES.includes(m.user.role);
  const out = new Set<string>();
  if (panel || (await erpAccess())) out.add("erp");
  if (panel || m.can_lenta) out.add("lenta"); // rahbariyat — doim (backend can_lenta hali qaytarmaydi)
  if (panel || m.can_geo) out.add("geo"); // rahbariyat — doim (backend can_geo hali qaytarmaydi)
  if (panel) out.add("analytics");
  if (panel || m.can_view) out.add("jarvis").add("dev");
  return out;
}

export default function Launcher() {
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [me, setMe] = useState<Me | null>(null);

  const boot = useCallback(async () => {
    try {
      const m = await api<Me>("/app/api/me");
      setMe(m);
      const ok = await allowed(m);
      const cards = CARDS.filter((c) => ok.has(c.key));
      if (cards.length === 1) return window.location.replace(cards[0].href);
      if (!cards.length) {
        const rd = m.report_depts?.[0];
        if (rd) return window.location.replace(`/app/report?dept=${encodeURIComponent(rd)}`);
        return setMode({ kind: "err", msg: "Sizga hali hech qaysi bo'lim ochilmagan. Rahbaringizga murojaat qiling." });
      }
      setMode({ kind: "app", cards });
    } catch (e) {
      const msg = (e as Error).message;
      if (!initData() && /Kirish|401/.test(msg)) return setMode({ kind: "login" });
      setMode({ kind: "err", msg });
    }
  }, []);

  useEffect(() => {
    initTelegram();
    const undo = disableZoom();
    // boot asinxron: setState faqat `await api("/app/api/me")` dan keyin (sinxron kaskad yo'q) — Shell'dagidek
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void boot();
    return undo;
  }, [boot]);

  async function logout() {
    await api("/app/api/logout", { method: "POST" }).catch(() => {});
    setMe(null);
    setMode({ kind: "login" });
  }

  return (
    <LauncherView mode={mode} me={me} showLogout={!!me && !initData()} login={<LoginView msg="" onLogin={() => void boot()} />} onLogout={() => void logout()} />
  );
}
