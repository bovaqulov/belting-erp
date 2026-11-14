// Agent jadvali oynasi (faqat ko'rinish): nomi, ko'rsatma, takror (kunlar / oy kuni / sana), vaqt, natija qayerga, yoqilgan.
import s from "@/shared/ui/panel/styles";
import { Icon, SectionHeader } from "@/shared/ui/panel/ui";
import a from "@/ai/agents/styles";
import { CHANNEL_NAMES, type Agent, type Repeat, type Schedule } from "@/ai/agents/model";
import { DAY_SHORT, describe, REPEAT_NAMES } from "@/ai/agents/schedule.lib";

export function ScheduleSheetView({
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
  f: Schedule;
  isNew: boolean;
  errs: string[];
  saving: boolean;
  set: (p: Partial<Schedule>) => void;
  onRemove: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <>
      <div className={s.who}>
        <h2>{isNew ? "Yangi jadval" : f.title}</h2>
        <div className={s.s} style={{ color: "var(--hint)" }}>
          {agent.name} · {describe(f)}
        </div>
      </div>

      <SectionHeader>Vazifa</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        <div className={s.field}>
          <label htmlFor="sc-title">Nomi</label>
          <input id="sc-title" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ertalabki savdo hisoboti" />
        </div>
        <textarea
          className={a.persona}
          style={{ minHeight: 100 }}
          value={f.instruction}
          onChange={(e) => set({ instruction: e.target.value })}
          placeholder="Kechagi sotuvlarni bo'lim va menejer bo'yicha jamla, eng katta 5 mijozni ko'rsat, rejadan farqini yoz."
          aria-label="Ko'rsatma"
        />
      </div>

      <SectionHeader>Qachon</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        <div className={s.field}>
          <label htmlFor="sc-rep">Takror</label>
          <select id="sc-rep" value={f.repeat} onChange={(e) => set({ repeat: e.target.value as Repeat })}>
            {(Object.keys(REPEAT_NAMES) as Repeat[]).map((k) => (
              <option key={k} value={k}>
                {REPEAT_NAMES[k]}
              </option>
            ))}
          </select>
        </div>
        {f.repeat === "weekly" && (
          <div className={a.days} role="group" aria-label="Kunlar">
            {DAY_SHORT.map((d, i) => {
              const on = f.days.includes(i + 1);
              return (
                <button
                  key={d}
                  type="button"
                  className={a.toggle}
                  aria-pressed={on}
                  onClick={() => set({ days: on ? f.days.filter((x) => x !== i + 1) : [...f.days, i + 1] })}
                >
                  {d}
                </button>
              );
            })}
          </div>
        )}
        {f.repeat === "monthly" && (
          <div className={s.field}>
            <label htmlFor="sc-day">Kuni</label>
            <input id="sc-day" type="number" min={1} max={28} value={f.day} onChange={(e) => set({ day: Number(e.target.value) })} />
          </div>
        )}
        {f.repeat === "once" && (
          <div className={s.field}>
            <label htmlFor="sc-date">Sana</label>
            <input id="sc-date" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
          </div>
        )}
        <div className={s.field}>
          <label htmlFor="sc-time">Vaqt</label>
          <input id="sc-time" type="time" value={f.time} onChange={(e) => set({ time: e.target.value })} />
        </div>
        <div className={s.field}>
          <label htmlFor="sc-to">Natija</label>
          <select id="sc-to" value={f.deliver} onChange={(e) => set({ deliver: e.target.value })}>
            <option value="owner">Mas&apos;ul xodimga (Telegram)</option>
            {agent.channels.map((c) => (
              <option key={c.id} value={c.id}>
                {CHANNEL_NAMES[c.type].name}
                {c.ref ? ` — ${c.ref}` : ""}
              </option>
            ))}
          </select>
        </div>
        <label className={`${s.item} ${s.tap}`}>
          <div className={s.main}>Yoqilgan</div>
          <input type="checkbox" className={s.sw} checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        </label>
      </div>
      <div className={s.sf}>Vaqt — Toshkent bo&apos;yicha.</div>

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
          {saving ? "Saqlanmoqda…" : "Saqlash"}
        </button>
      </div>
    </>
  );
}
