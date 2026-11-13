// Audit bo'limining sof mantig'i — eski admin.html (951–998): AUDIT_ICONS, auditToolInfo, VOICE_ST, voiceRow ma'lumot qismi.

export interface AuditRow {
  id: number | string;
  ts: string;
  event: string;
  tg_id?: number | string | null;
  name?: string | null;
  dept?: string | null;
  detail?: string | null;
}

export const AUDIT_ICONS: Record<string, [icon: string, color: string]> = {
  answer: ["message-circle", "#5288c1"],
  tool: ["settings", "#8e8e93"],
  user_changed: ["user", "#af52de"],
  user_approved: ["user-plus", "#34c759"],
  user_request: ["user-plus", "#f5a623"],
  invite_joined: ["user-plus", "#34c759"],
  invite_created: ["link", "#5288c1"],
  task_assigned: ["clipboard-check", "#f5a623"],
  task_done: ["check", "#34c759"],
  report_submitted: ["chart-column", "#34c759"],
  template_proposed: ["file-cog", "#f5a623"],
  template_approved: ["file-cog", "#34c759"],
  web_login: ["log-out", "#5288c1"],
  denied: ["x", "#ec3942"],
  memory_add: ["brain", "#af52de"],
  kb_add: ["book-open", "#5288c1"],
  voice: ["mic", "#ff2d55"],
};

/** Eski admin.html'da ICONS.mic / ICONS.play shu bo'limda qo'shilgan (lib/admin/icons.ts da yo'q). */

export interface ToolInfo {
  action?: string;
  label?: string;
}

/** "tool" yozuvi: vosita nomi va (bo'lsa) amal — eski alohida eventlar (memory_add, kb_add, ...) endi detail.action da */
export function auditToolInfo(a: Pick<AuditRow, "event" | "detail">): ToolInfo {
  if (a.event !== "tool" || !a.detail) return {};
  try {
    const d = JSON.parse(a.detail);
    const name = String(d.tool || "").replace(/^mcp__[^_]+__/, "");
    const label = [d.action || name, d.result && d.result !== "ok" ? d.result : "", d.via ? "via " + d.via : ""]
      .filter(Boolean)
      .join(" · ");
    return { action: d.action || "", label };
  } catch {
    return {};
  }
}

/** Oddiy (ovozsiz) qator ikonkasi: amal → event → "history". */
export function auditIcon(a: Pick<AuditRow, "event" | "detail">): [string, string] {
  const td = auditToolInfo(a);
  return (td.action && AUDIT_ICONS[td.action]) || AUDIT_ICONS[a.event] || ["history", "#8e8e93"];
}

/** esc(a.ts.slice(5, 16).replace("T", " ")) */
export function auditTs(ts: string): string {
  return ts.slice(5, 16).replace("T", " ");
}

const VOICE_ST: Record<string, [cls: string, label: string]> = {
  tanildi: ["ok", "tanildi"],
  eshitilmadi: ["warn", "eshitilmadi"],
  xato: ["err", "xato"],
};

export interface VoiceInfo {
  cls: "" | "ok" | "warn" | "err";
  label: string;
  forwardedFrom: string;
  duration: number | string;
  text: string;
}

/** voiceRow(a) ning ma'lumot qismi: detail JSON (buzuq bo'lsa — {}). */
export function voiceInfo(a: Pick<AuditRow, "detail">): VoiceInfo {
  let d: Record<string, unknown> = {};
  try {
    const p = JSON.parse(a.detail || "{}");
    if (p && typeof p === "object") d = p;
  } catch {
    /* eskidagidek: d = {} */
  }
  const st = typeof d.status === "string" ? d.status : d.status ? String(d.status) : "";
  const [cls, label] = VOICE_ST[st] || ["", st];
  return {
    cls: cls as VoiceInfo["cls"],
    label,
    forwardedFrom: d.forwarded_from ? String(d.forwarded_from) : "",
    duration: (d.duration as number | string) || 0,
    text: d.text ? String(d.text) : "",
  };
}

/** GET /app/api/voice/{id} xatosi matni (eskidagidek). */
export function voiceFetchError(status: number): string {
  return status === 404 ? "Fayl saqlanmagan (eski yozuv)" : "Yuklab bo'lmadi";
}
