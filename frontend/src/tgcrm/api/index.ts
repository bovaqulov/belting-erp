// TelegramCRM API (/app/api/tgcrm/*, kelishuv — docs/api/tgcrm.md). Telegram bilan backend gateway gaplashadi.
import { api, ApiError, authHeaders } from "@/shared/api/client";

export type Kind = "company" | "personal";
export type Status = "new" | "code_sent" | "password" | "qr" | "active" | "offline" | "flood" | "limited" | "frozen" | "banned" | "logged_out" | "error";

export type Limits = {
  message?: number;
  caption?: number;
  folders?: number;
  pinned?: number;
  channels?: number;
  file_bytes?: number;
  freeze_appeal_url?: string;
};

export type Account = {
  id: number;
  kind: Kind;
  title: string;
  owner_tg: number;
  phone: string;
  tg_user_id: number | null;
  username: string;
  name: string;
  premium: boolean;
  status: Status;
  status_label: string;
  status_detail: string;
  flood_until: string | null;
  limits: Limits;
  connected_at: string | null;
  created_at: string;
  can_manage: boolean;
  /** mijozga javob muddati (daqiqa) — undan oshsa ro'yxatda qizil */
  sla_minutes?: number;
  /** akkauntdagi rolim: admin — boshqaradi, operator — yozadi, viewer — kuzatadi */
  role?: "admin" | "operator" | "viewer" | null;
};

export type GwStatus = {
  gateway: boolean;
  configured: boolean;
  me: { tg_id: number; is_head: boolean };
};
export type AccEvent = {
  kind: string;
  detail: string;
  actor_tg: number | null;
  /** kim qildi (xodim ismi) */
  actor?: string;
  at: string;
};
export type Step = "phone" | "code" | "password" | "qr" | "qr_state" | "cancel";
export type LoginResult = {
  status?: Status | "";
  via?: string;
  hint?: string;
  url?: string;
  qr?: string;
  expires?: string | null;
};

const P = "/app/api/tgcrm";

export const getStatus = () => api<GwStatus>(`${P}/status`);
export const listAccounts = () => api<{ accounts: Account[] }>(`${P}/accounts`).then((r) => r.accounts);
export const getAccount = (id: number) => api<Account>(`${P}/accounts/${id}`);
export const createAccount = (kind: Kind, title: string) => api<Account>(`${P}/accounts`, { body: { kind, title } });
export const renameAccount = (id: number, title: string) => api<Account>(`${P}/accounts/${id}`, { method: "PATCH", body: { title } });
export const deleteAccount = (id: number) => api(`${P}/accounts/${id}`, { method: "DELETE" });
export const loginStep = (id: number, step: Step, body: Record<string, string> = {}) =>
  api<{ result: LoginResult; account: Account }>(`${P}/accounts/${id}/login`, {
    body: { step, ...body },
  });
export const logoutAccount = (id: number) => api<Account>(`${P}/accounts/${id}/logout`, { method: "POST" });
export const restartAccount = (id: number) => api<Account>(`${P}/accounts/${id}/restart`, { method: "POST" });
export const accountEvents = (id: number) => api<{ events: AccEvent[] }>(`${P}/accounts/${id}/events`).then((r) => r.events);

// ---------------------------------------------------------------- chatlar (2–3-bosqich)
export type PeerKind = "user" | "bot" | "group" | "supergroup" | "channel";

export type Chat = {
  peer_id: number;
  kind: PeerKind;
  title: string;
  username: string;
  phone: string;
  verified: boolean;
  scam: boolean;
  deleted: boolean;
  is_self: boolean;
  contact: boolean;
  members: number | null;
  online: boolean;
  last_seen: string | null;
  has_photo: boolean;
  top_msg_id: number;
  last_date: string | null;
  last_text: string;
  last_out: boolean;
  last_read: boolean;
  unread: number;
  unread_mentions: number;
  read_inbox_max: number;
  read_outbox_max: number;
  pinned: boolean;
  archived: boolean;
  muted: boolean;
  draft: string;
  can_write?: boolean;
  /** mas'ul operator */
  assignee: { tg_id: number; name: string } | null;
  /** shu chatda AI yordamchi o'chirilgan */
  ai_off?: boolean;
  /** mijoz yozgan, javob yo'q — qachondan */
  waiting_since?: string | null;
  /** CRM: voronka bosqichi va teglar (mijoz kartasi bo'lsa) */
  crm?: { stage: StageId; tags: TagRow[] } | null;
};

export type Entity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user_id?: number;
  language?: string;
};
export type Media = { kind: string; [k: string]: unknown };

export type Msg = {
  id: number;
  date: string;
  out: boolean;
  sender_id: number | null;
  text: string;
  entities: Entity[];
  media: Media | null;
  action: ({ type: string } & Record<string, unknown>) | null;
  reply_to: number | null;
  fwd: { from_id?: number; from_name?: string; date?: string } | null;
  grouped_id: string | null;
  edit_date: string | null;
  views: number | null;
  post_author: string;
  reactions: { emoji: string; custom: number | null; count: number; mine: boolean }[] | null;
  deleted: boolean;
  read: boolean;
  sent_by: number | null;
  /** AI yordamchi yozgan */
  by_ai?: boolean;
  /** faqat brauzerda: yuborilmoqda / yuborilmadi */
  pending?: "sending" | "failed";
};

export type MsgPeer = { title: string; username: string; kind: PeerKind };
export type MessagesPage = {
  messages: Msg[];
  peers: Record<string, MsgPeer>;
  staff: Record<string, string>;
  has_more: boolean;
  complete: boolean;
  stale: boolean;
  notice?: string;
};
export type Folder = {
  id: number | "archive";
  title: string;
  emoticon: string;
  unread_chats: number;
  count?: number;
};
export type DialogsPage = {
  dialogs: Chat[];
  next: string | null;
  synced: boolean;
  can_write: boolean;
};

const A = (acc: number) => `${P}/accounts/${acc}`;
const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export type Who = "" | "mine" | "free" | "waiting";
export const listDialogs = (acc: number, o: { folder?: number | "archive" | null; q?: string; cursor?: string | null; who?: Who } = {}) =>
  api<DialogsPage>(`${A(acc)}/dialogs${qs({ folder: o.folder ?? undefined, q: o.q, cursor: o.cursor ?? undefined, who: o.who || undefined })}`);
export const listFolders = (acc: number) => api<{ folders: Folder[] }>(`${A(acc)}/folders`).then((r) => r.folders);
export const getChat = (acc: number, peer: number) => api<Chat>(`${A(acc)}/chats/${peer}`);
export const getMessages = (acc: number, peer: number, before?: number) => api<MessagesPage>(`${A(acc)}/chats/${peer}/messages${qs({ before })}`);
/** force — boshqa operator javob yozayotgan bo'lsa ham (409 dan keyin foydalanuvchi tasdiqlagach) */
export const sendText = (acc: number, peer: number, text: string, reply_to?: number | null, force = false) =>
  api<{ message: Msg | null }>(`${A(acc)}/chats/${peer}/send`, { body: { text, reply_to: reply_to ?? null, force } });
export const sendTyping = (acc: number, peer: number) => api(`${A(acc)}/chats/${peer}/typing`, { method: "POST" });
export const markRead = (acc: number, peer: number, max_id: number) => api(`${A(acc)}/chats/${peer}/read`, { body: { max_id } });
export const syncDialogs = (acc: number) =>
  api<{ dialogs: number; folders: number }>(`${A(acc)}/sync`, {
    method: "POST",
  });

// ---------------------------------------------------------------- media (4-bosqich)
export type FileKind = "photo" | "file" | "video" | "voice" | "audio";

export const mediaUrl = (acc: number, peer: number, msgId: number, o: { thumb?: boolean; download?: boolean } = {}) =>
  `${A(acc)}/chats/${peer}/media/${msgId}${qs({ thumb: o.thumb ? 1 : undefined, download: o.download ? 1 : undefined })}`;

/** Fayl yuborish (multipart) — XHR: yuklash foizi uchun. X-Requested-With — backend shuni talab qiladi (CSRF himoyasi). */
export function sendFile(
  acc: number,
  peer: number,
  file: Blob,
  name: string,
  o: {
    kind: FileKind;
    caption?: string;
    reply_to?: number | null;
    force?: boolean;
    onProgress?: (pct: number) => void;
  },
): Promise<{ message: Msg | null }> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file, name);
    fd.append("kind", o.kind);
    if (o.caption) fd.append("caption", o.caption);
    if (o.reply_to) fd.append("reply_to", String(o.reply_to));
    if (o.force) fd.append("force", "1");
    const x = new XMLHttpRequest();
    x.open("POST", `${A(acc)}/chats/${peer}/send-file`);
    x.withCredentials = true;
    for (const [k, v] of Object.entries({
      ...authHeaders(),
      "X-Requested-With": "tgcrm",
    }))
      x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => e.lengthComputable && o.onProgress?.(Math.round((e.loaded / e.total) * 100));
    x.onload = () => {
      let data: { detail?: unknown; message?: Msg | null } = {};
      try {
        data = JSON.parse(x.responseText || "{}");
      } catch {
        /* bo'sh javob */
      }
      if (x.status >= 200 && x.status < 300) resolve({ message: data.message ?? null });
      else reject(new ApiError(typeof data.detail === "string" ? data.detail : `Yuborilmadi (${x.status})`, x.status, data.detail));
    };
    x.onerror = () => reject(new Error("Tarmoq xatosi — internet aloqasini tekshiring."));
    x.send(fd);
  });
}

// ---------------------------------------------------------------- amallar, profil, qidiruv (5-bosqich)
export type ChatInfo = {
  about: string;
  pinned_msg_id: number | null;
  pinned: Msg | null;
  members: number | null;
  admins: number | null;
  common_chats: number | null;
  can_write: boolean;
};
export type Member = {
  peer_id: number;
  title: string;
  username: string;
  kind: PeerKind;
  online: boolean;
  last_seen: string | null;
  role: "owner" | "admin" | "";
  has_photo: boolean;
  is_self: boolean;
};
export type SearchFilter = "" | "photo" | "video" | "file" | "link" | "voice" | "music";
export type SearchPage = { messages: Msg[]; peers: Record<string, MsgPeer>; has_more: boolean; total: number | null };
export type GlobalHit = { chat: Chat; message: Msg };

export const peerPhotoUrl = (acc: number, peer: number) => `${A(acc)}/peers/${peer}/photo`;
export const editMsg = (acc: number, peer: number, id: number, text: string) =>
  api<{ message: Msg }>(`${A(acc)}/chats/${peer}/messages/${id}/edit`, { body: { text } });
export const deleteMsgs = (acc: number, peer: number, ids: number[], revoke: boolean) =>
  api(`${A(acc)}/chats/${peer}/messages/delete`, { body: { ids, revoke } });
export const forwardMsgs = (acc: number, peer: number, ids: number[], to: number) =>
  api<{ count: number }>(`${A(acc)}/chats/${peer}/messages/forward`, { body: { ids, to } });
export const reactMsg = (acc: number, peer: number, id: number, emoji: string) => api(`${A(acc)}/chats/${peer}/messages/${id}/react`, { body: { emoji } });
export const pinMsg = (acc: number, peer: number, id: number, unpin: boolean) => api(`${A(acc)}/chats/${peer}/messages/${id}/pin`, { body: { unpin } });
export const setChatPinned = (acc: number, peer: number, pinned: boolean) => api(`${A(acc)}/chats/${peer}/pin`, { body: { pinned } });
export const setChatArchived = (acc: number, peer: number, archived: boolean) => api(`${A(acc)}/chats/${peer}/archive`, { body: { archived } });
/** seconds: null — ovozni yoqish, 0 — doimiy o'chirish, N — N soniyaga */
export const setChatMuted = (acc: number, peer: number, seconds: number | null) => api(`${A(acc)}/chats/${peer}/mute`, { body: { seconds } });
export const getChatInfo = (acc: number, peer: number) => api<ChatInfo>(`${A(acc)}/chats/${peer}/info`);
export const getMembers = (acc: number, peer: number, q = "") => api<{ members: Member[]; limited: boolean }>(`${A(acc)}/chats/${peer}/members${qs({ q })}`);
export const searchChat = (acc: number, peer: number, o: { q?: string; filter?: SearchFilter; offset_id?: number }) =>
  api<SearchPage>(`${A(acc)}/chats/${peer}/search${qs({ q: o.q, filter: o.filter, offset_id: o.offset_id })}`);
export const searchAll = (acc: number, q: string) => api<{ results: GlobalHit[] }>(`${A(acc)}/search${qs({ q })}`);

// ---------------------------------------------------------------- operatorlar (6-bosqich)
export type StaffRow = { tg_id: number; name: string };
export type AccRole = "admin" | "operator" | "viewer";
export type AccMembers = { members: (StaffRow & { role: AccRole })[]; open: boolean; candidates: StaffRow[]; can_manage: boolean };
export type LockState = { holder: number | null; name?: string; mine?: boolean };

export const listStaff = (acc: number) => api<{ staff: StaffRow[]; me: number }>(`${A(acc)}/staff`);
export const assignChat = (acc: number, peer: number, tg_id: number | null) => api<Chat>(`${A(acc)}/chats/${peer}/assign`, { body: { tg_id } });
export const takeLock = (acc: number, peer: number) => api<LockState>(`${A(acc)}/chats/${peer}/lock`, { body: {} });
export const releaseLock = (acc: number, peer: number) => api<LockState>(`${A(acc)}/chats/${peer}/lock`, { body: { release: true } });
export const lockState = (acc: number, peer: number) => api<LockState>(`${A(acc)}/chats/${peer}/lock-state`);
export const getAccountMembers = (acc: number) => api<AccMembers>(`${A(acc)}/members`);
export const setAccountMember = (acc: number, tg_id: number, role: AccRole | null) =>
  api<AccMembers>(`${A(acc)}/members`, { method: "PUT", body: { tg_id, role } });

// ---------------------------------------------------------------- CRM qatlami (7-bosqich)
export type StageId = "new" | "qualified" | "offer" | "negotiation" | "won" | "lost";
export type TagRow = { id: number; name: string; color: string };
export type CrmTask = { id: number; title: string; due_at: string; done_at: string | null; assignee: StaffRow; overdue: boolean };
export type CrmNote = { id: number; text: string; author: string; author_tg: number; at: string };
export type ContactCard = {
  id: number;
  tg_user_id: number;
  name: string;
  company: string;
  phone: string;
  inn: string;
  source: string;
  stage: StageId;
  stage_label: string;
  stage_at: string | null;
  lost_reason: string;
  amount: string | null;
  owner: StaffRow | null;
  tags: TagRow[];
  notes: CrmNote[];
  tasks: CrmTask[];
  can_write: boolean;
  stages: { id: StageId; label: string }[];
};
export type QuickReply = { id: number; title: string; text: string; shared: boolean; can_delete: boolean };
export type CrmReport = {
  days: number;
  sla_minutes: number;
  incoming: number;
  replies: number;
  median_min: number | null;
  sla_pct: number | null;
  waiting_now: number;
  waiting: { peer_id: number; title: string; minutes: number; assignee: string }[];
  staff: {
    tg_id: number | null;
    name: string;
    assigned: number;
    replies: number;
    answered: number;
    median_min: number | null;
    sla_pct: number | null;
    waiting: number;
  }[];
  funnel: { stage: StageId; label: string; count: number }[];
  tasks_overdue: number;
  can_edit_sla: boolean;
};

const C = (acc: number, peer: number) => `${A(acc)}/chats/${peer}/contact`;
export const getContact = (acc: number, peer: number) => api<ContactCard>(C(acc, peer));
export const patchContact = (acc: number, peer: number, body: Partial<Record<string, unknown>>) => api<ContactCard>(C(acc, peer), { method: "PATCH", body });
export const addNote = (acc: number, peer: number, text: string) => api<ContactCard>(`${C(acc, peer)}/notes`, { body: { text } });
export const deleteNote = (acc: number, peer: number, id: number) => api<ContactCard>(`${C(acc, peer)}/notes/${id}`, { method: "DELETE" });
export const addTask = (acc: number, peer: number, o: { title: string; due_at: string; assignee_tg?: number }) =>
  api<ContactCard>(`${C(acc, peer)}/tasks`, { body: o });
export const doneTask = (acc: number, peer: number, id: number, undo = false) => api<ContactCard>(`${C(acc, peer)}/tasks/${id}/done`, { body: { undo } });
export const listTags = () => api<{ tags: TagRow[] }>(`${P}/tags`).then((r) => r.tags);
export const listQuickReplies = (acc: number) => api<{ replies: QuickReply[] }>(`${A(acc)}/quick-replies`).then((r) => r.replies);
export const addQuickReply = (acc: number, o: { title: string; text: string; shared?: boolean }) =>
  api<{ replies: QuickReply[] }>(`${A(acc)}/quick-replies`, { body: o }).then((r) => r.replies);
export const deleteQuickReply = (acc: number, id: number) => api(`${A(acc)}/quick-replies/${id}`, { method: "DELETE" });
export const getReport = (acc: number, days: number) => api<CrmReport>(`${A(acc)}/report${qs({ days })}`);
export const setSla = (acc: number, minutes: number, days: number) =>
  api<CrmReport>(`${A(acc)}/report${qs({ days })}`, { method: "PATCH", body: { sla_minutes: minutes } });

// ---------------------------------------------------------------- tizim holati (8-bosqich)
export type HealthCheck = { name: string; level: "ok" | "warn" | "error"; detail: string };
export type AccHealth = {
  id: number;
  title: string;
  kind: Kind;
  status: Status;
  status_label: string;
  status_detail: string;
  flood_until: string | null;
  connected: boolean;
  last_update_ago: number | null;
  session_saved: string | null;
  entities: number;
  alert_status: string;
  alert_at: string | null;
};
export const getHealth = () => api<{ checks: HealthCheck[]; accounts: AccHealth[] }>(`${P}/health`);

// ---------------------------------------------------------------- AI yordamchi
export type AiSettings = {
  ai_enabled: boolean;
  ai_instructions: string;
  ai_delay_sec: number;
  ai_quiet_min: number;
  ai_max_per_hour: number;
  can_edit: boolean;
  replies_24h: number;
  orders_24h: number;
  handoffs_24h: number;
  errors_24h: number;
  /** javob kanali — faqat Telegram Business bot (egasi nomidan) */
  channel: { ok: boolean; detail: string };
  /** omborda bor-yo'qligi manbasi — 1C qoldig'i; eski bo'lsa AI «bor» demaydi */
  stock: { ok: boolean; at: string | null; detail: string; items?: number };
  log: { kind: string; detail: string; at: string }[];
};
export const getAi = (acc: number) => api<AiSettings>(`${A(acc)}/ai`);
export const patchAi = (acc: number, body: Partial<AiSettings>) => api<AiSettings>(`${A(acc)}/ai`, { method: "PATCH", body });
export const setChatAiOff = (acc: number, peer: number, off: boolean) => api<{ ai_off: boolean }>(`${A(acc)}/chats/${peer}/ai-off`, { body: { off } });
export type AiMode = "summary" | "draft" | "auto";
export const askAi = (acc: number, peer: number, o: { mode?: AiMode; question?: string }) => api<{ answer: string }>(`${A(acc)}/chats/${peer}/ai`, { body: o });
