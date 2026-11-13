// Agent topshirig'i oynasi (faqat ko'rinish): nomi, ko'rsatma, muddat, holat, natija.
import s from "@/shared/ui/panel/panel.module.css";
import { Icon, SectionHeader } from "@/shared/ui/panel/ui";
import a from "@/ai/agents/agents.module.css";
import { TASK_STATUS, type Agent, type AgentTask, type TaskStatus } from "@/ai/agents/model";

export function TaskSheetView({
  agent,
  f,
  isNew,
  errs,
  saving,
  set,
  onRemove,
  onCancel,
  onSave,
}: {
  agent: Agent;
  f: AgentTask;
  isNew: boolean;
  errs: string[];
  saving: boolean;
  set: (p: Partial<AgentTask>) => void;
  onRemove: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <>
      <div className={s.who}>
        <h2>{isNew ? "Yangi topshiriq" : f.title}</h2>
        <div className={s.s} style={{ color: "var(--hint)" }}>
          {agent.name}
        </div>
      </div>
      <SectionHeader>Topshiriq</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        <div className={s.field}>
          <label htmlFor="tk-title">Nomi</label>
          <input id="tk-title" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Akt sverka tayyorlash" />
        </div>
        <textarea
          className={a.persona}
          style={{ minHeight: 110 }}
          value={f.instruction}
          onChange={(e) => set({ instruction: e.target.value })}
          placeholder="Nima qilish kerak, qaysi ma'lumotdan, natija qanday ko'rinishda va kimga."
          aria-label="Ko'rsatma"
        />
        <div className={s.field}>
          <label htmlFor="tk-due">Muddat</label>
          <input id="tk-due" type="date" value={f.due} onChange={(e) => set({ due: e.target.value })} />
        </div>
        {!isNew && (
          <div className={s.field}>
            <label htmlFor="tk-st">Holat</label>
            <select id="tk-st" value={f.status} onChange={(e) => set({ status: e.target.value as TaskStatus })}>
              {(Object.keys(TASK_STATUS) as TaskStatus[]).map((k) => (
                <option key={k} value={k}>
                  {TASK_STATUS[k].name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {f.result && (
        <>
          <SectionHeader>Natija</SectionHeader>
          <div className={`${s.list} ${s.plain}`}>
            <div className={s.item}>
              <pre>{f.result}</pre>
            </div>
          </div>
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
        {!isNew && (
          <button className={`${s.btn} ${s.danger}`} disabled={saving} onClick={onRemove} aria-label="O'chirish">
            <Icon name="trash-2" />
          </button>
        )}
        <button className={`${s.btn} ${s.sec}`} disabled={saving} onClick={onCancel}>
          Bekor
        </button>
        <button className={s.btn} disabled={saving} onClick={onSave}>
          {saving ? "Yuborilmoqda…" : isNew ? "Topshiriq berish" : "Saqlash"}
        </button>
      </div>
    </>
  );
}
