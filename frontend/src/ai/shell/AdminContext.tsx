"use client";
// Boshqaruv paneli umumiy holati va amallari (eski admin.html: state, LIMITED, READONLY, toast, confirmDo, openSheet, render …).
// Qiymatni Shell beradi; bo'limlar `useAdmin()` bilan oladi.
import { createContext, useContext, type ReactNode } from "react";

import type { Agent } from "@/ai/agents/model";

export type TabKey = "chat" | "agents" | "users" | "templates" | "memory" | "kb" | "audit" | "graph" | "system";

/** [kalit, sarlavha, ikonka] */
export const TABS: readonly (readonly [TabKey, string, string])[] = [
  ["chat", "Chat", "message-circle"],
  ["agents", "Agentlar", "bot"],
  ["users", "Xodimlar", "users"],
  ["templates", "Shablonlar", "file-text"],
  ["audit", "Audit", "history"],
  ["graph", "Graph", "network"],
  ["memory", "Xotira", "brain"],
  ["kb", "Bilimlar", "book-open"],
  ["system", "Tizim", "activity"],
];

/** Panel qismlari (2026-11-13): /app/jarvis — faqat AI (chat, agentlar, xotira, bilimlar; graf — Bilimlar ichida), /app/staff — xodimlar,
 *  /app/templates — hisobot shablonlari, /app/dev — texnik (audit, tizim). Bitta tabli qismda tab paneli ko'rsatilmaydi. */
export type Area = "jarvis" | "staff" | "templates" | "dev";
export const AREAS: Record<Area, { title: string; icon: string; tabs: readonly TabKey[]; home?: string }> = {
  jarvis: { title: "Jarvis", icon: "bot", tabs: ["chat", "agents", "memory", "kb"] },
  // HR — ERP ichidagi bo'lim (egasi qarori 2026-11-14): sarlavhadagi "Bo'limlar" ERP'ga qaytaradi
  staff: { title: "HR · Xodimlar", icon: "users", tabs: ["users"], home: "/app/erp" },
  templates: { title: "Shablonlar", icon: "file-text", tabs: ["templates"] },
  dev: { title: "Development", icon: "terminal", tabs: ["audit", "system"] },
};
/** faqat owner/admin (backend ham tekshiradi) — rahbar (faqat ko'rish) bu tablarni ko'rmaydi */
export const ADMIN_ONLY_TABS: readonly TabKey[] = ["system"];

export type Role = "owner" | "admin" | "employee" | "pending" | "blocked" | (string & {});

/** GET /app/api/me → user (db.users qatori; qolgan maydonlar bo'limlarga kerak bo'lsa — index signature) */
export interface MeUser {
  tg_id: number;
  name: string;
  role: Role;
  username?: string | null;
  departments?: string[];
  [k: string]: unknown;
}

export interface Me {
  user: MeUser;
  company: string;
  can_admin: boolean;
  can_view: boolean;
  /** agentlarni boshqarish (owner/admin, IT, Rahbariyat) — backend hisoblaydi */
  can_manage_agents?: boolean;
  can_lenta: boolean;
  can_geo?: boolean;
  report_depts?: string[];
  /** ruxsat etilgan ERP modullari (backend staff.MODULE_DEPTS) */
  modules?: string[];
}

export interface DeptChat {
  chat_id: number | string;
  title?: string | null;
  dept: string;
  [k: string]: unknown;
}

/** GET /app/api/overview → departments[] */
export interface Dept {
  key: string;
  title: string;
  name: string;
  icon: string;
  color: string;
  tools: string[];
  model: string;
  sees_all: boolean;
  /** yuqori bo'lim (ai/org/dept-tree): undefined — eski ma'lumot, null — eng yuqori */
  parent?: string | null;
  name_ru?: string;
  persona: string;
  members: number;
  chats: DeptChat[];
}

export interface DeptStat {
  dept: string;
  requests: number;
  [k: string]: unknown;
}

export interface Overview {
  departments: Dept[];
  /** barcha agentlar (sub-agentlar bilan) — backend 2-bosqich; yo'q bo'lsa departments → bo'lim agentlari */
  agents?: Agent[];
  pending_users: number;
  pending_memory: number;
  stats_week: DeptStat[];
}

export type ToastKind = "ok" | "err";

/** Eski `state.*` — bo'lim ichidagi ko'rinish tanlovlari tablar almashganda saqlanib qoladi. */
export interface Prefs {
  usersView: "tree" | "list";
  agentsView: "tree" | "list";
  memView: "list" | "graph";
  kbView: "tree" | "graph";
  /** eski state.graphScope || "all" */
  graphScope: string;
  auditVoice: boolean;
}

export interface AdminApi {
  /** boot'dan keyin har doim bor (bo'limlar faqat shundan keyin chiziladi) */
  me: Me | null;
  overview: Overview | null;
  /** overview.departments (yuklanmagan bo'lsa []) */
  depts: Dept[];
  /** Jarvis agentlari — bitta daraxt (ai/agents/model.ts) */
  agents: Agent[];
  /** eski READONLY: rahbariyat a'zosi — hammasini ko'radi, o'zgartirmaydi (ildizda .ro klassi) */
  readonly: boolean;
  /** eski LIMITED: faqat "Shablonlar" tabi (bo'lim boshlig'i / IT) */
  limited: boolean;
  /** eski loadOverview(): GET /app/api/overview → overview, depts, tab nishonlari */
  reloadOverview(): Promise<Overview>;
  /** eski toast(m, kind="ok"): 3.2 s, haptic success/error */
  toast(msg: string, kind?: ToastKind): void;
  /** eski confirmDo: Telegram showConfirm, bo'lmasa window.confirm */
  confirm(msg: string): Promise<boolean>;
  /** eski openSheet(inner): oldingi oyna yopilib (260 ms), yangisi ochiladi; Telegram BackButton yopadi.
   *  node — o'z holatiga ega komponent bo'lsin (<UserSheet id={…}/>): ochilgandan keyin tashqaridan yangilanmaydi. */
  openSheet(node: ReactNode): void;
  closeSheet(): void;
  /** hozir ochiq oyna bormi — joriy qiymat (callback'larda eskirmaydi) */
  isSheetOpen(): boolean;
  tab: TabKey;
  /** tab bosilganidek: o'sha tab bo'lsa — tepaga silliq aylantirish; aks holda almashtirish + haptic + scrollTo(0,0) */
  setTab(key: TabKey): void;
  /** eski render(): faol bo'limni qayta o'rnatish (remount → qayta yuklaydi) */
  render(): void;
  prefs: Prefs;
  /** eski `state.x = v; render()` — prefs o'zgaradi va faol bo'lim qayta o'rnatiladi */
  setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void;
}

export const AdminContext = createContext<AdminApi | null>(null);

export function useAdmin(): AdminApi {
  const v = useContext(AdminContext);
  if (!v) throw new Error("useAdmin() faqat <Shell> ichida");
  return v;
}
