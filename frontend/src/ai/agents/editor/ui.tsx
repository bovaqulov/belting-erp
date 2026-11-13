// Agentni yaratish / tahrirlash oynasi (faqat ko'rinish): Asosiy (tur, nom, kalit, yuqori agent, xodim/mas'ul, model,
// butun firma, ikonka, rang), Huquqlar (slot), Persona; xatolar, Bekor / Saqlash.
import type { CSSProperties, ReactNode } from "react";

import s from "@/shared/ui/panel/panel.module.css";
import { Icon, SectionHeader, Sq } from "@/shared/ui/panel/ui";
import { DEPT_COLORS, DEPT_ICONS, type AgentForm } from "@/ai/agents/agents.lib";
import a from "@/ai/agents/agents.module.css";
import { KIND_NAMES, type Agent, type AgentKind } from "@/ai/agents/model";
import type { AdminUser } from "@/ai/users/users.lib";

export type Part = "main" | "access" | "persona";
const PARTS: [Part, string][] = [
  ["main", "Asosiy"],
  ["access", "Huquqlar"],
  ["persona", "Persona"],
];
const KIND_DESC: Record<AgentKind, string> = {
  dept: "Bo'lim tuguni — Xodimlar daraxtida ham ko'rinadi",
  staff: "Xodimga biriktirilgan yordamchi",
  free: "O'z vazifasi bor agent (masalan Instagram AI)",
};

export function AgentEditorView({
  f,
  isNew,
  part,
  parents,
  staff,
  models,
  errs,
  saving,
  access,
  set,
  onPart,
  onKind,
  onName,
  onKey,
  onCancel,
  onSave,
}: {
  f: AgentForm;
  isNew: boolean;
  part: Part;
  /** yuqori agent tanlovi (o'zi va avlodlari chiqarilgan) */
  parents: { d: Agent; depth: number }[];
  staff: readonly AdminUser[];
  models: readonly { id: string; name: string }[];
  errs: string[];
  saving: boolean;
  /** "Huquqlar" qismi */
  access: ReactNode;
  set: (p: Partial<AgentForm>) => void;
  onPart: (p: Part) => void;
  onKind: (k: AgentKind) => void;
  onName: (v: string) => void;
  onKey: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <>
      <div className={s.who}>
        <Sq icon={f.icon} color={f.color} style={{ width: 64, height: 64, borderRadius: 18 }} />
        <h2>{isNew ? "Yangi agent" : f.name || "Agent"}</h2>
        <div className={s.s} style={{ color: "var(--hint)" }}>
          {KIND_NAMES[f.kind]}
          {!isNew && <span className={a.code}> · {f.key}</span>}
        </div>
      </div>

      <div className={s.seg} style={{ margin: "12px 16px 0" }} role="tablist">
        {PARTS.map(([k, t]) => (
          <button key={k} role="tab" aria-selected={part === k} className={part === k ? s.on : ""} onClick={() => onPart(k)}>
            {t}
          </button>
        ))}
      </div>

      {part === "main" && (
        <>
          {isNew && (
            <>
              <SectionHeader>Turi</SectionHeader>
              <div className={`${s.list} ${s.plain}`}>
                {(Object.keys(KIND_NAMES) as AgentKind[]).map((k) => (
                  <label key={k} className={`${s.item} ${s.tap}`}>
                    <div className={s.main}>
                      <div className={s.t}>{KIND_NAMES[k]}</div>
                      <div className={a.desc}>{KIND_DESC[k]}</div>
                    </div>
                    <input type="radio" name="ag-kind" className={s.chk} checked={f.kind === k} onChange={() => onKind(k)} />
                  </label>
                ))}
              </div>
            </>
          )}

          <SectionHeader>Asosiy</SectionHeader>
          <div className={`${s.list} ${s.plain}`}>
            <div className={s.field}>
              <label htmlFor="ag-name">Nomi</label>
              <input id="ag-name" value={f.name} onChange={(e) => onName(e.target.value)} placeholder="Instagram AI" autoComplete="off" />
            </div>
            <div className={s.field}>
              <label htmlFor="ag-ru">Ruscha</label>
              <input id="ag-ru" value={f.name_ru} onChange={(e) => set({ name_ru: e.target.value })} placeholder="ixtiyoriy" autoComplete="off" />
            </div>
            {isNew && (
              <div className={s.field}>
                <label htmlFor="ag-key">Kalit</label>
                <input
                  id="ag-key"
                  className={a.code}
                  value={f.key}
                  onChange={(e) => onKey(e.target.value)}
                  placeholder="instagram_ai"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            )}
            <div className={s.field}>
              <label htmlFor="ag-parent">Yuqori</label>
              <select id="ag-parent" value={f.parent ?? ""} onChange={(e) => set({ parent: e.target.value || null })}>
                <option value="">— Firma (eng yuqori)</option>
                {parents.map(({ d, depth }) => (
                  <option key={d.key} value={d.key}>
                    {" ".repeat(depth + 1)}
                    {d.name}
                  </option>
                ))}
              </select>
              <span className={s.chev}>
                <Icon name="chevron-right" />
              </span>
            </div>
            {f.kind !== "dept" && (
              <div className={s.field}>
                <label htmlFor="ag-owner">{f.kind === "staff" ? "Xodim" : "Mas'ul"}</label>
                <select id="ag-owner" value={f.owner_tg ?? ""} onChange={(e) => set({ owner_tg: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">{f.kind === "staff" ? "— tanlang" : "— yo'q"}</option>
                  {staff.map((u) => (
                    <option key={u.tg_id} value={u.tg_id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <span className={s.chev}>
                  <Icon name="chevron-right" />
                </span>
              </div>
            )}
            <div className={s.field}>
              <label htmlFor="ag-model">Model</label>
              <select id="ag-model" value={f.model} onChange={(e) => set({ model: e.target.value })}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <span className={s.chev}>
                <Icon name="chevron-right" />
              </span>
            </div>
            {f.kind === "dept" && (
              <label className={`${s.item} ${s.tap}`}>
                <div className={s.main}>
                  <div className={s.t}>Butun firmani ko&apos;radi</div>
                  <div className={s.s}>Barcha bo&apos;limlar ma&apos;lumoti (rahbariyat)</div>
                </div>
                <input type="checkbox" className={s.sw} checked={f.sees_all} onChange={(e) => set({ sees_all: e.target.checked })} />
              </label>
            )}
          </div>
          <div className={s.sf}>
            Daraxt Xodimlar bilan bitta: bo&apos;lim agentlari u yerda bo&apos;lim bo&apos;lib ko&apos;rinadi, xodim agenti — xodim kartochkasida.
            {isNew && " Kalit keyin o'zgarmaydi."}
          </div>

          <SectionHeader>Ikonka</SectionHeader>
          <div className={`${s.list} ${s.plain}`}>
            <div className={a.picker} role="group" aria-label="Ikonka">
              {DEPT_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  className={a.pick}
                  style={{ "--c": f.color } as CSSProperties}
                  aria-pressed={f.icon === ic}
                  aria-label={ic}
                  onClick={() => set({ icon: ic })}
                >
                  <Icon name={ic} />
                </button>
              ))}
            </div>
          </div>
          <SectionHeader>Rang</SectionHeader>
          <div className={`${s.list} ${s.plain}`}>
            <div className={a.picker} role="group" aria-label="Rang">
              {DEPT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={a.swatch}
                  style={{ "--c": c } as CSSProperties}
                  aria-pressed={f.color === c}
                  aria-label={c}
                  onClick={() => set({ color: c })}
                >
                  <Icon name="check" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {part === "access" && access}

      {part === "persona" && (
        <>
          <SectionHeader>Persona</SectionHeader>
          <div className={`${s.list} ${s.plain}`}>
            <textarea
              className={a.persona}
              value={f.persona}
              onChange={(e) => set({ persona: e.target.value })}
              placeholder="Sen … agentisan. Nima qilasan, kim bilan ishlaysan, qanday javob berasan, nimani qilmaysan."
              aria-label="Persona"
            />
          </div>
          <div className={s.sf}>Agentning roli va javob uslubi — har so&apos;rovda unga beriladi.</div>
        </>
      )}

      {errs.length > 0 && (
        <div className={a.errs} role="alert">
          {errs.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
      <div className={s.actions}>
        <button className={`${s.btn} ${s.sec}`} disabled={saving} onClick={onCancel}>
          Bekor
        </button>
        <button className={s.btn} disabled={saving} onClick={onSave}>
          {saving ? "Saqlanmoqda…" : isNew ? "Yaratish" : "Saqlash"}
        </button>
      </div>
    </>
  );
}
