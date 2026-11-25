import type { QuickReply } from "@/tgcrm/api";
import { Icon } from "@/tgcrm/kit";

const INP = "w-full min-w-0 rounded-lg border border-sep bg-page px-2.5 py-1.5 text-[15px] text-fg outline-none focus:border-link coarse:min-h-11";

export function QuickView(p: {
  rows: QuickReply[] | null;
  err: string;
  form: { title: string; text: string; shared: boolean } | null;
  isAdmin: boolean;
  onPick: (text: string) => void;
  onClose: () => void;
  onForm: (f: { title: string; text: string; shared: boolean } | null) => void;
  onSave: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      className="mb-2 max-h-[min(360px,50dvh)] overflow-y-auto rounded-xl border border-sep bg-sec shadow-[0_6px_24px_rgb(0_0_0/0.14)]"
      role="dialog"
      aria-label="Tez javoblar"
      onKeyDown={(e) => e.key === "Escape" && p.onClose()}
    >
      <div className="sticky top-0 flex items-center gap-2 border-b border-sep bg-sec px-3 py-1.5">
        <span className="flex-1 text-[14px] font-semibold">Tez javoblar</span>
        {!p.form ? (
          <button type="button" className="mini" onClick={() => p.onForm({ title: "", text: "", shared: false })}>
            + Shablon
          </button>
        ) : null}
        <button type="button" className="icon-btn" onClick={p.onClose} aria-label="Yopish">
          <Icon n="x" />
        </button>
      </div>
      {p.form ? (
        <form
          className="grid gap-2 border-b border-sep p-3"
          onSubmit={(e) => {
            e.preventDefault();
            p.onSave();
          }}
        >
          <input
            className={INP}
            placeholder="Nomi (masalan: narx, manzil, yetkazish)"
            value={p.form.title}
            maxLength={60}
            autoFocus
            onChange={(e) => p.onForm({ ...p.form!, title: e.target.value })}
          />
          <textarea
            className={`${INP} min-h-[80px] resize-y`}
            placeholder="Matn"
            value={p.form.text}
            maxLength={4096}
            onChange={(e) => p.onForm({ ...p.form!, text: e.target.value })}
          />
          {p.isAdmin ? (
            <label className="flex items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={p.form.shared}
                onChange={(e) => p.onForm({ ...p.form!, shared: e.target.checked })}
                className="size-5 accent-[var(--link)]"
              />
              Barcha akkauntlar uchun
            </label>
          ) : null}
          <div className="flex gap-2">
            <button type="button" className="mini" onClick={() => p.onForm(null)}>
              Bekor
            </button>
            <button type="submit" className="mini pri" disabled={!p.form.title.trim() || !p.form.text.trim()}>
              Saqlash
            </button>
          </div>
        </form>
      ) : null}
      {p.err ? <p className="m-0 px-3 py-2 text-[13px] text-danger">{p.err}</p> : null}
      <ul className="m-0 list-none p-1">
        {p.rows === null ? <li className="p-3 text-center text-hint">Yuklanmoqda…</li> : null}
        {p.rows?.map((r) => (
          <li key={r.id} className="flex items-start gap-1">
            <button
              type="button"
              onClick={() => p.onPick(r.text)}
              className="min-w-0 flex-1 cursor-pointer rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-fg hover:bg-fill"
              style={{ font: "inherit" }}
            >
              <span className="block text-[14px] font-semibold">
                {r.title}
                {r.shared ? <span className="ml-1.5 text-[11.5px] font-normal text-hint">umumiy</span> : null}
              </span>
              <span className="line-clamp-2 block text-[13.5px] text-sub">{r.text}</span>
            </button>
            {r.can_delete ? (
              <button
                type="button"
                className="icon-btn !text-hint hover:!text-danger"
                onClick={() => p.onDelete(r.id)}
                aria-label={`${r.title} shablonini o'chirish`}
              >
                <Icon n="trash-2" cls="!size-4" />
              </button>
            ) : null}
          </li>
        ))}
        {p.rows && !p.rows.length ? <li className="p-3 text-center text-[13.5px] text-hint">Shablon yo&apos;q — «+ Shablon» bilan qo&apos;shing.</li> : null}
      </ul>
    </div>
  );
}
