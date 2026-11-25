import { Icon } from "@/tgcrm/kit";

import type { AiKind } from "./index";

export function AiPanelView(p: {
  q: string;
  res: { kind: AiKind; text: string } | null;
  loading: boolean;
  err: string;
  canWrite: boolean;
  onQ: (v: string) => void;
  onRun: (k: AiKind) => void;
  onUse: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sec" aria-label="AI yordamchi">
      <div className="flex items-center gap-2 border-b border-sep px-2 py-1.5">
        <button type="button" className="icon-btn" onClick={p.onClose} aria-label="AI panelini yopish">
          <Icon n="x" />
        </button>
        <h2 className="m-0 flex-1 text-[17px] font-semibold">AI yordamchi</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="mini inline-flex items-center gap-1" onClick={() => p.onRun("summary")} disabled={p.loading}>
            <Icon n="list" cls="!size-4" />
            Suhbat xulosasi
          </button>
          {p.canWrite ? (
            <button type="button" className="mini inline-flex items-center gap-1" onClick={() => p.onRun("draft")} disabled={p.loading}>
              <Icon n="sparkles" cls="!size-4" />
              Javob taklifi
            </button>
          ) : null}
          <button
            type="button"
            className="mini inline-flex items-center gap-1"
            onClick={() => p.onRun("auto")}
            disabled={p.loading}
            title="AI yordamchi shu chatga avtomatik nima yozardi — hech narsa yuborilmaydi"
          >
            <Icon n="bot" cls="!size-4" />
            Avto-javob sinovi
          </button>
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            p.onRun("ask");
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Savol</span>
            <input
              className="inp w-full"
              placeholder="Masalan: mijoz qaysi o'lchamni so'radi?"
              value={p.q}
              onChange={(e) => p.onQ(e.target.value)}
              maxLength={1000}
            />
          </label>
          <button type="submit" className="b pri" disabled={p.loading || !p.q.trim()}>
            So&apos;rash
          </button>
        </form>
        {p.loading ? (
          <p className="mt-4 text-[14px] text-hint" role="status">
            AI o&apos;ylayapti… (bir necha soniya)
          </p>
        ) : null}
        {p.err ? (
          <p role="alert" className="mt-4 text-[14px] text-danger">
            {p.err}
          </p>
        ) : null}
        {p.res && !p.loading ? (
          <div className="mt-4 rounded-xl bg-page p-3">
            {p.res.kind === "auto" ? <p className="m-0 mb-1 text-[12.5px] text-hint">Sinov — mijozga yuborilmadi</p> : null}
            <p className="m-0 text-[15px] break-words whitespace-pre-wrap">{p.res.text}</p>
            {p.res.kind === "draft" ? (
              <button type="button" className="mini pri mt-2" onClick={p.onUse}>
                Yozish maydoniga qo&apos;yish
              </button>
            ) : null}
          </div>
        ) : null}
        <p className="mt-4 text-[12.5px] text-hint">AI faqat shu suhbat va mijoz kartasiga tayanadi; narx aytmaydi. Javobni yuborishdan oldin tekshiring.</p>
      </div>
    </aside>
  );
}
