# API: Jarvis agentlari

**Jarvis** — umumiy nom: firmaning turli qismlariga egalik qiluvchi xodimlar uchun agentlar. Ular xodimlar kabi ishlaydi
(qila olgan darajasida): kanallarda javob beradi, jadval bo'yicha ish bajaradi, topshiriq oladi.

Backend tayyor: `backend/config/apps/jarvis/` (Django). Frontend: `frontend/src/ai/agents/` (model.ts — tiplar, AgentEditor, AgentSheet, ScheduleSheet, TaskSheet),
`frontend/src/ai/org/` (bitta daraxt). Backend 2-bosqichda. Hozirgi jarvis backend: faqat bo'limlar (`departments.yaml`),
frontend ularni `kind: "dept"` agentlarga o'giradi (`fromDept`).

## Bitta daraxt

| kind | Nima | Xodimlar daraxtida |
|---|---|---|
| `dept` | bo'lim agenti — bo'lim tuguni | bo'lim bo'lib (xodimi bo'lsa) |
| `staff` | xodimga biriktirilgan (`owner_tg` majburiy) | xodim kartochkasida belgi |
| `free` | mustaqil (masalan Instagram AI) | ko'rinmaydi |

`parent` — yuqori agent kaliti (`null` — eng yuqori). Istalgan agent ostida sub-agentlar bo'ladi:
`Marketing (dept) → Instagram AI (free) → Direct javobchi, Izohlarga javobchi`.
Qoidalar (backend ham tekshiradi, 400): sikl yo'q; `dept` ning yuqorisi faqat `dept` yoki `null` (Xodimlar daraxti uzilmasin).
Xodimlar daraxti (`GET /app/api/users` → `depts[]`) — shu `dept` tugunlari va ularning `parent` i; agentlar bilan bir xil.

## Boshqaruv huquqi

Agent yaratish/tahrirlash/o'chirish, huquqlar, jadval — owner, admin, **IT bo'limi** a'zolari, **Rahbariyat** (sees_all bo'lim)
a'zolari. Topshiriq berish — ular va agentning foydalanuvchilari (`audience`, `owner_tg`). Har o'zgarish — audit.

## Model

```ts
interface AgentInput {
  key: string;            // ^[a-z][a-z0-9_]{1,31}$, noyob, O'ZGARMAYDI (bo'lim agenti uchun = bo'lim kaliti)
  kind: "dept" | "staff" | "free";   // O'ZGARMAYDI
  name: string; name_ru: string;
  parent: string | null;
  owner_tg: number | null;           // staff — majburiy; boshqalarida — mas'ul (ixtiyoriy)
  icon: string; color: string;       // lucide nomi, #rrggbb
  model: string;                     // claude-sonnet-5-5 | claude-opus-5-5 | claude-haiku-5-5 | claude-fable-5-2
  persona: string;                   // ≥ 20 belgi
  tools: string[];                   // vositalar (agents.lib.ts TOOLS)
  sees_all: boolean;                 // faqat dept
  scopes: Record<Area, "all" | "team" | "own" | "none">;  // yo'q kalit = rol bo'yicha (departments.yaml access)
  audience: { depts: string[]; users: number[] };        // kim foydalanadi; ikkalasi bo'sh — yuqori bo'lim a'zolari
  channels: { id: string; type: ChannelType; ref: string; mode: "auto" | "approve" }[];
}
type Area = "calls" | "crm" | "leads" | "orders" | "tasks" | "finance" | "treasury" | "cost";
type ChannelType = "telegram_group" | "telegram_bot" | "instagram_direct" | "instagram_comments" | "web";
```

`scopes` — agent kimga javob berayotgan bo'lsa, o'sha xodimning huquqidan **oshmaydi** (min(agent doirasi, xodim roli));
jadval/kanal ishida (xodimsiz) — agent doirasi. `mode: "approve"` — javob qoralama, mas'ul (`owner_tg`) Telegramda tasdiqlaydi.

Javobda qo'shimcha (faqat o'qish): `members`, `chats`, `schedules: Schedule[]`, `tasks: AgentTask[]`.

## Endpointlar

| Metod | Yo'l | Tana | Javob |
|---|---|---|---|
| GET | `/app/api/overview` | — | mavjud javob + `agents: Agent[]` (hammasi, sub-agentlar bilan) |
| POST | `/app/api/agents` | `AgentInput` | `{ key }` — 400, 409 kalit band |
| PATCH | `/app/api/agents/{key}` | `Partial<AgentInput>` (key, kind e'tiborsiz) | `{ ok }` |
| DELETE | `/app/api/agents/{key}` | — | `{ ok }` |
| POST | `/app/api/agents/{key}/schedules` | `Schedule` | `{ id }` |
| PATCH / DELETE | `/app/api/agents/{key}/schedules/{id}` | `Partial<Schedule>` | `{ ok }` |
| POST | `/app/api/agents/{key}/tasks` | `{title, instruction, due}` | `{ id }` |
| PATCH / DELETE | `/app/api/agents/{key}/tasks/{id}` | `{title?, instruction?, due?, status?}` | `{ ok }` |

Xato: `{ detail: "matn" }` (nima bo'ldi + qanday tuzatish).

### DELETE agent oqibati
sub-agentlar bir daraja yuqoriga ko'chadi; `dept` bo'lsa — `users.departments` dan olinadi, guruhlar uziladi; xotira va
bilimlar o'chmaydi; agentning jadval va topshiriqlari ham o'chadi (chat tarixi — agent bilan).

## Jadval (Schedule)

```ts
interface Schedule {
  id: string; title: string;
  instruction: string;               // agentga ko'rsatma (prompt)
  repeat: "daily" | "weekly" | "monthly" | "once";
  time: "HH:MM";                     // Toshkent
  days: number[];                    // weekly: 1=Du … 7=Ya
  day: number;                       // monthly: 1–28
  date: "YYYY-MM-DD";                // once
  deliver: "owner" | string;         // natija: mas'ul xodimga yoki kanal id
  enabled: boolean;
}
```
Bajaruvchi: worker sikli (hozirgi `reminders`/scheduler o'rniga yoki yonida), agent huquqlari bilan, natija `deliver` ga.

## Topshiriq (AgentTask)

```ts
interface AgentTask { id; title; instruction; due: "YYYY-MM-DD" | ""; status: "new" | "doing" | "done" | "failed";
                      created_by; created_at; result? }
```
Agent topshiriqni oladi (`doing`), bajaradi, `result` yozadi (`done`/`failed`) va beruvchiga xabar qiladi.

## Saqlash joyi

`agents`, `agent_schedules`, `agent_tasks` jadvallari (Django modellari; demo — SQLite, prod — PostgreSQL). `departments.yaml` — faqat boshlang'ich seed (`kind=dept`).
O'zgarishdan keyin agent konfiguratsiyasi qayta yuklanadi (restart shart emas).
