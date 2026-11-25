// Agentlar: yaratish/tahrirlash/o'chirish uchun sof mantiq (forma holati, tekshiruv, so'rov tanasi).
// API kelishuvi (backend 2-bosqich): docs/api/agents.md
//   POST   /app/api/agents          AgentInput            → { key }
//   PATCH  /app/api/agents/{key}    Partial<AgentInput>   → { ok }   (key va kind o'zgarmaydi)
//   DELETE /app/api/agents/{key}                          → { ok }
import { ApiError } from "@/shared/api/client";

import type { Agent, AgentKind, Audience, Channel, Scope } from "./model";

export interface ToolInfo {
  key: string;
  name: string;
  desc: string;
  /** xavfli — faqat IT/admin bo'limlariga (departments.yaml izohi) */
  risky?: boolean;
}

/** departments.yaml dagi vositalar (izohlardan). Backend `GET /app/api/departments/meta` bersa — o'sha ustun. */
export const TOOLS: readonly ToolInfo[] = [
  { key: "web", name: "Internet", desc: "Qidiruv va sahifa o'qish" },
  { key: "memory", name: "Xotira", desc: "O'z bo'limi va firma umumiy faktlari" },
  { key: "kb", name: "Bilimlar", desc: "Bilimlar bazasi: o'z bo'limi va umumiy hujjatlar" },
  { key: "reminders", name: "Eslatmalar", desc: "Shu chatga eslatma" },
  { key: "weather", name: "Ob-havo", desc: "Ob-havo ma'lumoti" },
  { key: "currency", name: "Valyuta", desc: "CBU valyuta kurslari" },
  { key: "ask_departments", name: "Bo'limlardan so'rash", desc: "Boshqa bo'lim agentlaridan ma'lumot so'rash" },
  { key: "calls", name: "Qo'ng'iroqlar", desc: "IP-telefoniya: Yeastar va Moizvonki statistikasi" },
  { key: "crm", name: "CRM", desc: "CRM: bitimlar, lidlar, mijozlar, vazifalar" },
  { key: "site", name: "Sayt", desc: "remen.uz: mahsulot rasmi, narxi, havolasi" },
  { key: "belts", name: "Remenlar", desc: "Remen aniqlash, AppSheet narxlari, Excel taklif" },
  { key: "lenta", name: "Lenta chizmasi", desc: "Konveyer lenta chizmasi (LentaCUD)" },
  { key: "geomap", name: "Mijozlar xaritasi", desc: "GeoMaps: hududlar, marshrut" },
  { key: "onec", name: "1C", desc: "Qoldiq, mahsulot, mijoz tarixi, sotuv, hujjatlar, moliya" },
  { key: "erp", name: "ERP", desc: "Qoldiq, buyurtma holati, sex, qarz, qoralama" },
  { key: "wb", name: "Wildberries", desc: "WB seller API (yozish — faqat admin tasdig'i bilan)" },
  { key: "computer", name: "Kompyuter", desc: "Terminal va fayllar — faqat IT va admin", risky: true },
];

export const DEFAULT_TOOLS = ["web", "memory", "kb", "reminders", "weather", "currency"];

export const MODELS: readonly { id: string; name: string }[] = [
  { id: "claude-sonnet-5-5", name: "Sonnet 5.5 — muvozanat" },
  { id: "claude-opus-5-5", name: "Opus 5.5 — eng kuchli" },
  { id: "claude-haiku-5-5", name: "Haiku 5.5 — tez va arzon" },
  { id: "claude-fable-5-2", name: "Fable 5.2" },
];

/** bo'lim ikonkalari — shared/icons/lucide.ts da bor nomlar */
export const DEPT_ICONS = [
  "briefcase", "calculator", "monitor", "handshake", "shopping-cart", "factory", "package", "folder",
  "megaphone", "building-2", "coins", "crown", "phone", "ruler", "users", "map", "chart-column", "shield-check",
  "archive", "bot",
] as const;

/** panel ranglari (mavjud bo'limlarda ishlatilgan tuslar oilasi) */
export const DEPT_COLORS = [
  "#5b7cf5", "#3e88f7", "#5ac8fa", "#2fb9c9", "#34c759", "#2fa37a", "#f7a145", "#e8961f",
  "#ff3b30", "#ff2d55", "#af52de", "#9a5bea", "#8e8e93",
] as const;

/** tahrirlanadigan maydonlar (jadval va topshiriqlar — alohida endpointlar) */
export interface AgentForm {
  key: string;
  kind: AgentKind;
  name: string;
  name_ru: string;
  /** yuqori agent kaliti; null — eng yuqori (firma ostida) */
  parent: string | null;
  /** kind=staff — biriktirilgan xodim (majburiy) */
  owner_tg: number | null;
  icon: string;
  color: string;
  model: string;
  tools: string[];
  sees_all: boolean;
  scopes: Record<string, Scope>;
  audience: Audience;
  channels: Channel[];
  persona: string;
}

export type AgentInput = AgentForm;

export function blankForm(parent: string | null = null, kind: AgentKind = "free"): AgentForm {
  return {
    key: "",
    kind,
    name: "",
    name_ru: "",
    parent,
    owner_tg: null,
    icon: kind === "dept" ? "folder" : "bot",
    color: "#3e88f7",
    model: MODELS[0].id,
    tools: [...DEFAULT_TOOLS],
    sees_all: false,
    scopes: {},
    audience: { depts: [], users: [] },
    channels: [],
    persona: "",
  };
}

/** parent — amaldagi yuqori agent (parentMap), backend hali bermasa ham to'g'ri ko'rinsin */
export function formOf(a: Agent, parent: string | null): AgentForm {
  return {
    key: a.key,
    kind: a.kind,
    name: a.name,
    name_ru: a.name_ru ?? "",
    parent,
    owner_tg: a.owner_tg ?? null,
    icon: a.icon,
    color: a.color,
    model: a.model,
    tools: [...a.tools],
    sees_all: a.sees_all,
    scopes: { ...a.scopes },
    audience: { depts: [...a.audience.depts], users: [...a.audience.users] },
    channels: a.channels.map((c) => ({ ...c })),
    persona: a.persona,
  };
}

/** "inherit" doiralar yuborilmaydi (rol bo'yicha — standart) */
export function cleanScopes(s: Record<string, Scope>): Record<string, Scope> {
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v && v !== "inherit"));
}

const LAT: Record<string, string> = { "o'": "o", "g'": "g", sh: "sh", ch: "ch", "‘": "", "’": "", "'": "", "`": "" };

/** "Sotuv — Marketplace" → "sotuv_marketplace" (lotin, kichik harf, _). Kirill harflar tashlanadi. */
export function slugKey(name: string): string {
  let t = name.toLowerCase();
  for (const [a, b] of Object.entries(LAT)) t = t.split(a).join(b);
  return t
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9_]+/, "")
    .slice(0, 32);
}

export const KEY_RE = /^[a-z][a-z0-9_]{1,31}$/;

/** Xatolar ro'yxati (bo'sh — forma to'g'ri). Matn: nima noto'g'ri + qanday tuzatish. */
export function validate(f: AgentForm, existingKeys: readonly string[], isNew: boolean): string[] {
  const out: string[] = [];
  if (!f.name.trim()) out.push("Nomini yozing.");
  if (isNew) {
    if (!KEY_RE.test(f.key))
      out.push("Kalit: lotin kichik harf bilan boshlansin, faqat a–z, 0–9 va _ (2–32 belgi), masalan sotuv_b2b.");
    else if (existingKeys.includes(f.key)) out.push(`«${f.key}» kaliti band — boshqasini tanlang.`);
  }
  if (f.persona.trim().length < 20) out.push("Persona juda qisqa — agent kim va nima qilishini 1–2 gapda yozing.");
  if (!f.tools.length) out.push("Kamida bitta vosita tanlang.");
  if (!MODELS.some((m) => m.id === f.model) && !f.model.trim()) out.push("Modelni tanlang.");
  if (f.kind === "staff" && !f.owner_tg) out.push("Xodim agenti uchun xodimni tanlang.");
  if (f.channels.some((c) => c.type !== "web" && !c.ref.trim())) out.push("Kanal manzilini yozing (guruh, @akkaunt).");
  return out;
}

/** yangi bo'lim — to'liq tana; tahrir — faqat o'zgargan maydonlar (key yuborilmaydi) */
export function createBody(f: AgentForm): AgentInput {
  return {
    ...f,
    name: f.name.trim(),
    name_ru: f.name_ru.trim() || f.name.trim(),
    persona: f.persona.trim(),
    owner_tg: f.kind === "staff" ? f.owner_tg : f.owner_tg || null,
    scopes: cleanScopes(f.scopes),
    channels: f.channels.map((c) => ({ ...c, ref: c.ref.trim() })),
  };
}

/** faqat o'zgargan maydonlar; key va kind yuborilmaydi */
export function patchBody(orig: AgentForm, f: AgentForm): Partial<AgentInput> {
  const next = createBody(f);
  const prev = createBody(orig);
  const out: Partial<AgentInput> = {};
  for (const k of Object.keys(next) as (keyof AgentInput)[]) {
    if (k === "key" || k === "kind") continue;
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) (out as Record<string, unknown>)[k] = next[k];
  }
  return out;
}

/** vositani yoqish/o'chirish — katalog tartibi saqlanadi, katalogda yo'q (eski) vositalar oxirida qoladi */
export function toggleTool(tools: readonly string[], key: string, on: boolean): string[] {
  const set = new Set(tools);
  if (on) set.add(key);
  else set.delete(key);
  const known = TOOLS.map((t) => t.key).filter((k) => set.has(k));
  const rest = [...set].filter((k) => !TOOLS.some((t) => t.key === k));
  return [...known, ...rest];
}

export function toolName(key: string): string {
  return TOOLS.find((t) => t.key === key)?.name ?? key;
}

/** O'chirish tasdig'i matni — oqibatini aytadi */
export function deleteWarning(name: string, members: number, chats: number, children = 0): string {
  const parts = [`«${name}» agentini o'chirasizmi?`];
  if (children) parts.push(`${children} ta sub-agent bir daraja yuqoriga ko'chadi.`);
  if (members) parts.push(`${members} xodim shu bo'limdan chiqariladi.`);
  if (chats) parts.push(`${chats} ta Telegram guruh bog'lanishi uziladi.`);
  parts.push("Xotira va bilimlar bazadan o'chmaydi.");
  return parts.join(" ");
}

/** backend hali yozish API'sini bermasa (404/405) — tushunarli matn */
export function saveError(e: unknown): string {
  if (e instanceof ApiError && (e.status === 404 || e.status === 405))
    return "Saqlab bo'lmadi: serverda agentlarni o'zgartirish API'si hali yo'q (backend 2-bosqichda qo'shiladi).";
  return (e as Error)?.message || "Saqlab bo'lmadi.";
}
