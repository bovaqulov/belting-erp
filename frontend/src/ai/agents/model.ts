// Jarvis agentlari modeli. Jarvis — umumiy nom: firmaning turli qismlariga egalik qiluvchi xodimlar uchun agentlar,
// xodimlar kabi ishlaydi (qila olgan darajasida). BITTA daraxt:
//   bo'lim agenti (kind=dept) — bo'lim tuguni; Xodimlar daraxti = faqat shu tugunlar + odamlar;
//   xodim agenti (kind=staff) — xodimga biriktirilgan (owner_tg), xodim kartochkasida ham ko'rinadi;
//   mustaqil agent (kind=free) — masalan Instagram AI; ostida sub-agentlar (Direct javobchi, Izohlarga javobchi).
// Huquqlarni IT bo'limi yoki Rahbariyat (va owner/admin) belgilaydi — canManage().
// API: docs/api/agents.md. Backend hali faqat bo'limlarni beradi — fromDept() o'giradi.
import type { Dept } from "@/ai/shell/AdminContext";

export type AgentKind = "dept" | "staff" | "free";
export const KIND_NAMES: Record<AgentKind, string> = {
  dept: "Bo'lim agenti",
  staff: "Xodim agenti",
  free: "Mustaqil agent",
};

/** ma'lumot doirasi: inherit — so'ragan xodimning roli bo'yicha (departments.yaml access) */
export type Scope = "inherit" | "all" | "team" | "own" | "none";
export const SCOPE_NAMES: Record<Scope, string> = {
  inherit: "Rol bo'yicha",
  all: "Butun firma",
  team: "Jamoa",
  own: "Faqat o'zi",
  none: "Yo'q",
};
export const SCOPE_AREAS: readonly { key: string; name: string; desc: string }[] = [
  { key: "calls", name: "Qo'ng'iroqlar", desc: "Statistika va yozuvlar" },
  { key: "crm", name: "CRM", desc: "Bitimlar, mijozlar" },
  { key: "leads", name: "Lidlar", desc: "Yangi murojaatlar" },
  { key: "orders", name: "Buyurtmalar", desc: "Zakazlar holati" },
  { key: "tasks", name: "Vazifalar", desc: "Xodimlar vazifalari" },
  { key: "finance", name: "Moliya", desc: "Mijoz qarzi, to'lovlar, akt sverka" },
  { key: "treasury", name: "Kassa va bank", desc: "Kassa/bank qoldig'i, ta'minotchilarga qarz" },
  { key: "cost", name: "Tannarx", desc: "Kirim narxi, учетная цена" },
];

export type ChannelType = "telegram_group" | "telegram_bot" | "instagram_direct" | "instagram_comments" | "web";
export const CHANNEL_NAMES: Record<ChannelType, { name: string; icon: string; hint: string }> = {
  telegram_group: { name: "Telegram guruh", icon: "message-circle", hint: "Guruh ID yoki nomi (guruhda /bind)" },
  telegram_bot: { name: "Telegram bot", icon: "send", hint: "@bot_username" },
  instagram_direct: { name: "Instagram Direct", icon: "message-circle", hint: "Instagram akkaunt (@nom)" },
  instagram_comments: { name: "Instagram izohlar", icon: "megaphone", hint: "Instagram akkaunt (@nom)" },
  web: { name: "Veb chat", icon: "monitor", hint: "Jarvis → Chat" },
};
/** auto — o'zi javob beradi; approve — javob qoralama, mas'ul tasdiqlaydi */
export type ChannelMode = "auto" | "approve";

export interface Channel {
  id: string;
  type: ChannelType;
  ref: string;
  mode: ChannelMode;
}

/** kim foydalana oladi (yozishadi, topshiriq beradi); ikkalasi bo'sh — yuqori bo'lim a'zolari */
export interface Audience {
  depts: string[];
  users: number[];
}

export type Repeat = "daily" | "weekly" | "monthly" | "once";
export interface Schedule {
  id: string;
  title: string;
  /** agentga beriladigan ko'rsatma (prompt) */
  instruction: string;
  repeat: Repeat;
  /** HH:MM, Toshkent vaqti */
  time: string;
  /** weekly: 1=Du … 7=Ya */
  days: number[];
  /** monthly: oyning kuni 1–28 */
  day: number;
  /** once: YYYY-MM-DD */
  date: string;
  /** natija qayerga: owner — mas'ul xodimga, channel — kanal id */
  deliver: string;
  enabled: boolean;
}

export type TaskStatus = "new" | "doing" | "done" | "failed";
export const TASK_STATUS: Record<TaskStatus, { name: string; st: string }> = {
  new: { name: "Yangi", st: "new" },
  doing: { name: "Bajarilmoqda", st: "work" },
  done: { name: "Bajarildi", st: "done" },
  failed: { name: "Bajarilmadi", st: "bad" },
};
export interface AgentTask {
  id: string;
  title: string;
  instruction: string;
  /** YYYY-MM-DD yoki bo'sh */
  due: string;
  status: TaskStatus;
  created_by?: number;
  created_at?: string;
  result?: string;
}

export interface Agent {
  key: string;
  kind: AgentKind;
  name: string;
  name_ru?: string;
  /** yuqori agent kaliti; undefined — eski ma'lumot (dept-tree qoidasi), null — eng yuqori */
  parent?: string | null;
  /** kind=staff — biriktirilgan xodim; boshqalarida — mas'ul (ixtiyoriy) */
  owner_tg?: number | null;
  icon: string;
  color: string;
  model: string;
  persona: string;
  tools: string[];
  sees_all: boolean;
  scopes: Record<string, Scope>;
  audience: Audience;
  channels: Channel[];
  schedules: Schedule[];
  tasks: AgentTask[];
  /** faqat o'qish (backend hisoblaydi) */
  members: number;
  chats: Dept["chats"];
}

/** hozirgi backend javobi (bo'lim) → bo'lim agenti */
export function fromDept(d: Dept): Agent {
  const x = d as Dept & Partial<Agent>;
  return {
    key: d.key,
    kind: x.kind ?? "dept",
    name: d.name,
    name_ru: d.name_ru,
    parent: d.parent,
    owner_tg: x.owner_tg ?? null,
    icon: d.icon,
    color: d.color,
    model: d.model,
    persona: d.persona,
    tools: d.tools,
    sees_all: d.sees_all,
    scopes: x.scopes ?? {},
    audience: x.audience ?? { depts: [], users: [] },
    channels:
      x.channels ??
      d.chats.map((c) => ({ id: `tg${c.chat_id}`, type: "telegram_group" as const, ref: String(c.title || c.chat_id), mode: "auto" as const })),
    schedules: x.schedules ?? [],
    tasks: x.tasks ?? [],
    members: d.members,
    chats: d.chats,
  };
}

let n = 0;
export const rid = (p: string): string => `${p}${Date.now().toString(36)}${(n++).toString(36)}`;

/** agentlarni boshqarish: owner/admin, IT bo'limi yoki Rahbariyat (sees_all bo'lim) a'zosi */
export function canManage(
  me: { user: { role: string; departments?: string[] }; can_manage_agents?: boolean } | null,
  depts: readonly { key: string; sees_all?: boolean }[],
): boolean {
  if (!me) return false;
  if (typeof me.can_manage_agents === "boolean") return me.can_manage_agents; // backend javobi ustun
  if (me.user.role === "owner" || me.user.role === "admin") return true;
  const mine = me.user.departments ?? [];
  return mine.includes("it") || depts.some((d) => d.sees_all && mine.includes(d.key));
}

/** dept agentining yuqorisi faqat dept (Xodimlar daraxti uzilmasin); boshqalari — istalgan agent */
export function allowedParent(kind: AgentKind, candidate: Agent): boolean {
  return kind !== "dept" || candidate.kind === "dept";
}
