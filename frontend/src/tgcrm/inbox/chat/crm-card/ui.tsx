import { useState } from "react";

import type { ContactCard, StaffRow, StageId } from "@/tgcrm/api";
import { Icon } from "@/tgcrm/kit";
import { STAGES, fmtSum, listTime, localInput } from "@/tgcrm/lib";

const INP =
  "w-full min-w-0 rounded-lg border border-sep bg-page px-2.5 py-1.5 text-[15px] text-fg outline-none focus:border-link disabled:opacity-60 coarse:min-h-11";

function Field({
  label,
  k,
  value,
  disabled,
  onSave,
  inputMode,
  placeholder,
}: {
  label: string;
  k: string;
  value: string;
  disabled: boolean;
  onSave: (k: string, v: string) => void;
  inputMode?: "text" | "tel" | "numeric";
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[12.5px] text-hint">{label}</span>
      <input
        key={value}
        className={INP}
        defaultValue={value}
        disabled={disabled}
        inputMode={inputMode}
        placeholder={placeholder}
        onBlur={(e) => onSave(k, e.target.value.trim())}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

function Tags({ tags, disabled, onTags }: { tags: ContactCard["tags"]; disabled: boolean; onTags: (names: string[]) => void }) {
  const [v, setV] = useState("");
  const names = tags.map((t) => t.name);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-link/12 py-0.5 pr-1 pl-2.5 text-[13px] text-link">
          {t.name}
          {!disabled ? (
            <button
              type="button"
              className="grid size-6 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-link hover:bg-link/15 coarse:size-8"
              onClick={() => onTags(names.filter((n) => n !== t.name))}
              aria-label={`${t.name} tegini olib tashlash`}
            >
              <Icon n="x" cls="!size-3.5" />
            </button>
          ) : null}
        </span>
      ))}
      {!disabled ? (
        <input
          className="h-8 w-28 min-w-0 rounded-full border border-dashed border-sep bg-transparent px-3 text-[13px] text-fg outline-none focus:border-link coarse:h-11"
          placeholder="+ teg"
          value={v}
          maxLength={40}
          aria-label="Teg qo'shish"
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && v.trim()) {
              e.preventDefault();
              if (!names.includes(v.trim())) onTags([...names, v.trim()]);
              setV("");
            }
          }}
        />
      ) : null}
    </div>
  );
}

export function CrmCardView(p: {
  card: ContactCard | null;
  err: string;
  saving: boolean;
  staff: StaffRow[];
  note: string;
  task: { title: string; due: string; who: number };
  lostAsk: boolean;
  lostReason: string;
  onClose: () => void;
  onField: (k: string, v: string) => void;
  onOwner: (tg: number | null) => void;
  onStage: (s: StageId) => void;
  onLostReason: (v: string) => void;
  onLostConfirm: () => void;
  onLostCancel: () => void;
  onTags: (names: string[]) => void;
  onNote: (v: string) => void;
  onAddNote: () => void;
  onDelNote: (id: number) => void;
  onTask: (t: { title: string; due: string; who: number }) => void;
  onAddTask: () => void;
  onDone: (id: number, undo: boolean) => void;
}) {
  const c = p.card;
  const ro = !c?.can_write;
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sec" aria-label="Mijoz kartasi">
      <div className="flex items-center gap-2 border-b border-sep px-2 py-1.5">
        <button type="button" className="icon-btn" onClick={p.onClose} aria-label="Kartani yopish">
          <Icon n="x" />
        </button>
        <h2 className="m-0 flex-1 text-[17px] font-semibold">Mijoz kartasi</h2>
        {p.saving ? <span className="pr-2 text-[12.5px] text-hint">Saqlanmoqda…</span> : null}
      </div>
      {p.err ? (
        <p role="alert" className="m-0 border-b border-sep bg-danger/10 px-4 py-2 text-[13.5px] text-danger">
          {p.err}
        </p>
      ) : null}
      {!c ? (
        <p className="p-6 text-center text-hint">{p.err ? "" : "Yuklanmoqda…"}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          <h3 className="mt-4 mb-2 text-[13px] font-medium text-hint uppercase">Voronka</h3>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Voronka bosqichi">
            {STAGES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={c.stage === s.id}
                disabled={ro || p.saving}
                onClick={() => p.onStage(s.id)}
                className={`cursor-pointer rounded-full border-0 px-3 py-1.5 text-[13.5px] disabled:cursor-default coarse:min-h-11 ${c.stage === s.id ? `st ${s.tone} !px-3 !py-1.5 !text-[13.5px]` : "bg-fill text-sub"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {c.stage === "lost" && c.lost_reason ? <p className="m-0 mt-2 text-[13.5px] text-sub">Sabab: {c.lost_reason}</p> : null}
          {p.lostAsk ? (
            <div className="mt-2 rounded-xl bg-danger/8 p-3">
              <label className="block text-[13.5px]">
                Nega yo&apos;qotildi? (tahlil uchun majburiy)
                <input
                  className={`${INP} mt-1`}
                  value={p.lostReason}
                  onChange={(e) => p.onLostReason(e.target.value)}
                  autoFocus
                  placeholder="Narx qimmat, raqobatchi, kerak emas…"
                />
              </label>
              <div className="mt-2 flex gap-2">
                <button type="button" className="mini" onClick={p.onLostCancel}>
                  Bekor
                </button>
                <button type="button" className="mini danger" onClick={p.onLostConfirm} disabled={!p.lostReason.trim()}>
                  Yo&apos;qotildi deb belgilash
                </button>
              </div>
            </div>
          ) : null}

          <h3 className="mt-5 mb-2 text-[13px] font-medium text-hint uppercase">Ma&apos;lumot</h3>
          <div className="grid gap-2.5">
            <Field label="Ism" k="name" value={c.name} disabled={ro} onSave={p.onField} />
            <Field label="Kompaniya" k="company" value={c.company} disabled={ro} onSave={p.onField} />
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Telefon" k="phone" value={c.phone} disabled={ro} onSave={p.onField} inputMode="tel" />
              <Field label="STIR" k="inn" value={c.inn} disabled={ro} onSave={p.onField} inputMode="numeric" placeholder="9 yoki 14 raqam" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Summa, so'm" k="amount" value={fmtSum(c.amount)} disabled={ro} onSave={p.onField} inputMode="numeric" />
              <Field label="Manba" k="source" value={c.source} disabled={ro} onSave={p.onField} placeholder="Telegram, Instagram…" />
            </div>
            <label className="block">
              <span className="mb-0.5 block text-[12.5px] text-hint">Mas&apos;ul sotuvchi</span>
              <select className={INP} value={c.owner?.tg_id ?? ""} disabled={ro} onChange={(e) => p.onOwner(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— tanlanmagan —</option>
                {p.staff.map((s) => (
                  <option key={s.tg_id} value={s.tg_id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <h3 className="mt-5 mb-2 text-[13px] font-medium text-hint uppercase">Teglar</h3>
          <Tags tags={c.tags} disabled={ro} onTags={p.onTags} />

          <h3 className="mt-5 mb-2 text-[13px] font-medium text-hint uppercase">Vazifalar</h3>
          <ul className="m-0 grid list-none gap-1 p-0">
            {c.tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2.5 rounded-lg px-1 py-1">
                <input
                  type="checkbox"
                  checked={!!t.done_at}
                  disabled={ro}
                  onChange={() => p.onDone(t.id, !!t.done_at)}
                  className="mt-1 size-5 flex-none accent-[var(--link)]"
                  aria-label={`${t.title} — bajarildi`}
                />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[15px] ${t.done_at ? "text-hint line-through" : ""}`}>{t.title}</span>
                  <span className={`block text-[12.5px] tabular-nums ${t.overdue ? "font-semibold text-danger" : "text-hint"}`}>
                    {t.overdue ? "Muddati o'tdi · " : ""}
                    {listTime(t.due_at)} {new Date(t.due_at).toTimeString().slice(0, 5)} · {t.assignee.name}
                  </span>
                </span>
              </li>
            ))}
            {!c.tasks.length ? <li className="text-[13.5px] text-hint">Vazifa yo&apos;q</li> : null}
          </ul>
          {!ro ? (
            <form
              className="mt-2 grid gap-2 rounded-xl bg-page p-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                p.onAddTask();
              }}
            >
              <input
                className={INP}
                placeholder="Vazifa: qo'ng'iroq qilish, taklif yuborish…"
                value={p.task.title}
                onChange={(e) => p.onTask({ ...p.task, title: e.target.value })}
                maxLength={200}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="datetime-local"
                  className={INP}
                  value={p.task.due}
                  min={localInput(new Date())}
                  onChange={(e) => p.onTask({ ...p.task, due: e.target.value })}
                  aria-label="Muddat"
                />
                <select className={INP} value={p.task.who} onChange={(e) => p.onTask({ ...p.task, who: Number(e.target.value) })} aria-label="Bajaruvchi">
                  {p.staff.map((s) => (
                    <option key={s.tg_id} value={s.tg_id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="mini pri justify-self-start" disabled={!p.task.title.trim() || p.saving}>
                Vazifa qo&apos;shish
              </button>
            </form>
          ) : null}

          <h3 className="mt-5 mb-2 text-[13px] font-medium text-hint uppercase">Ichki izohlar</h3>
          {!ro ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                p.onAddNote();
              }}
            >
              <textarea
                className={`${INP} min-h-[64px] resize-y`}
                placeholder="Mijozga ko'rinmaydi: kelishuvlar, ehtiyoj, eslatma…"
                value={p.note}
                onChange={(e) => p.onNote(e.target.value)}
                maxLength={4000}
              />
              <button type="submit" className="mini pri mt-1.5" disabled={!p.note.trim() || p.saving}>
                Izoh qo&apos;shish
              </button>
            </form>
          ) : null}
          <ul className="m-0 mt-2 grid list-none gap-2 p-0">
            {c.notes.map((n) => (
              <li key={n.id} className="rounded-xl bg-warn/10 px-3 py-2">
                <p className="m-0 text-[14.5px] break-words whitespace-pre-wrap">{n.text}</p>
                <div className="mt-1 flex items-center gap-2 text-[12px] text-hint">
                  <span className="min-w-0 flex-1 truncate">
                    {n.author || "—"} · {listTime(n.at)}
                  </span>
                  {!ro ? (
                    <button
                      type="button"
                      className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-hint hover:text-danger coarse:min-h-11"
                      onClick={() => p.onDelNote(n.id)}
                    >
                      o&apos;chirish
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
