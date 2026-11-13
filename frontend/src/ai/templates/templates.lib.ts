// Shablonlar bo'limining sof mantig'i (eski admin.html 620–687: TYPE_NAMES, STATUS_NAMES, deptOf, editable, byDept, pending).

export const TYPE_NAMES: Record<string, string> = { number: "son", money: "so'm", text: "matn" };
export const STATUS_NAMES: Record<string, string> = {
  active: "faol",
  pending: "kutmoqda",
  rejected: "rad etilgan",
  archived: "arxiv",
  superseded: "almashtirilgan",
};

export interface TplField {
  key: string;
  label: string;
  type: string;
}

export interface Template {
  id: number;
  dept: string;
  title: string;
  version: number;
  status: string;
  fields: TplField[];
  ask_at?: string | null;
  summary_at?: string | null;
  proposed_name?: string | null;
  decided_name?: string | null;
  created?: string | null;
  decided?: string | null;
  [k: string]: unknown;
}

export interface TplDept {
  key: string;
  name: string;
  icon: string;
  color: string;
  [k: string]: unknown;
}

/** GET /app/api/templates */
export interface TemplatesData {
  depts: TplDept[];
  templates: Template[];
  is_approver: boolean;
  can_edit: string[];
  approver_dept: string;
}

/** eski deptOf(k): topilmasa — { name: k, icon: "folder", color: "#8e8e93" } */
export function deptOf(depts: TplDept[], k: string): TplDept {
  return depts.find((x) => x.key === k) || { key: k, name: k, icon: "folder", color: "#8e8e93" };
}

/** eski editable: tasdiqlovchi — barcha bo'limlar, aks holda can_edit */
export function editableDepts(d: Pick<TemplatesData, "is_approver" | "depts" | "can_edit">): string[] {
  return d.is_approver ? d.depts.map((x) => x.key) : d.can_edit;
}

/** eski byDept: {dept: Template[]} (oddiy obyekt — Object.keys tartibi eskidagidek) */
export function groupByDept(templates: Template[]): Record<string, Template[]> {
  const byDept: Record<string, Template[]> = {};
  for (const t of templates) (byDept[t.dept] ||= []).push(t);
  return byDept;
}

export const pendingOf = (templates: Template[]): Template[] => templates.filter((t) => t.status === "pending");

/** Tahrirlash oynasining boshlang'ich qiymatlari (eski openTplEditor: blank bo'lmasa — faol shablon). */
export function editorInit(byDept: Record<string, Template[]>, editable: string[], deptKey: string, blank: boolean) {
  const a = blank ? undefined : (byDept[deptKey] || []).find((t) => t.status === "active");
  return {
    // <select> da mos option bo'lmasa brauzer birinchisini tanlaydi
    dept: editable.includes(deptKey) ? deptKey : (editable[0] ?? ""),
    title: a?.title || "",
    ask_at: a?.ask_at || "",
    summary_at: a?.summary_at || "",
    fields: (a?.fields || [{} as Partial<TplField>]).map((f) => ({
      key: f.key || "",
      label: f.label || "",
      type: f.type && f.type in TYPE_NAMES ? f.type : Object.keys(TYPE_NAMES)[0],
    })),
  };
}

/** POST /app/api/templates tanasi (eski: key/label trim, title va vaqtlar trim'siz) */
export function savePayload(v: { dept: string; title: string; ask_at: string; summary_at: string; fields: TplField[] }) {
  return {
    dept: v.dept,
    title: v.title,
    fields: v.fields.map((f) => ({ key: f.key.trim(), label: f.label.trim(), type: f.type })),
    ask_at: v.ask_at,
    summary_at: v.summary_at,
  };
}
