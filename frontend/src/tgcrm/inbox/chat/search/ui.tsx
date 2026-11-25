import type { Msg, MsgPeer } from "@/tgcrm/api";
import { Icon } from "@/tgcrm/kit";
import { listTime, mediaLabel, senderName } from "@/tgcrm/lib";

/** Topilgan so'zni ajratib ko'rsatish (katta-kichik harfsiz) */
function Hit({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  const from = Math.max(0, i - 40);
  return (
    <>
      {from ? "…" : ""}
      {text.slice(from, i)}
      <mark className="rounded bg-warn/30 text-fg">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function SearchView(p: {
  q: string;
  res: { q: string; msgs: Msg[]; peers: Record<string, MsgPeer>; more: boolean; total: number | null } | null;
  err: string;
  loading: boolean;
  onQ: (v: string) => void;
  onPick: (m: Msg) => void;
  onMore: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-page">
      <div className="flex items-center gap-1 border-b border-sep bg-sec px-2 py-1.5">
        <label className="search m-0 flex-1">
          <Icon n="search" />
          <span className="sr-only">Chatda qidirish</span>
          <input
            type="search"
            placeholder="Chatda qidirish"
            value={p.q}
            onChange={(e) => p.onQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && p.onClose()}
            autoFocus
            autoComplete="off"
          />
        </label>
        <button type="button" className="icon-btn" onClick={p.onClose} aria-label="Qidiruvni yopish">
          <Icon n="x" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        {p.err ? <p className="p-4 text-center text-danger">{p.err}</p> : null}
        {!p.res && !p.loading ? <p className="p-6 text-center text-hint">Kamida 2 ta harf kiriting — butun suhbat tarixidan qidiriladi.</p> : null}
        {p.res ? (
          <>
            <p className="m-0 px-4 pt-3 pb-1 text-[13px] text-hint">
              {p.res.total ? `${p.res.total} ta natija` : p.res.msgs.length ? "" : "Hech narsa topilmadi"}
            </p>
            <ul className="m-0 list-none p-1.5">
              {p.res.msgs.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => p.onPick(m)}
                    className="block w-full cursor-pointer rounded-xl border-0 bg-transparent px-3 py-2 text-left text-fg hover:bg-fill"
                    style={{ font: "inherit" }}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                        {m.out ? "Siz" : senderName(m.sender_id, p.res?.peers ?? {}) || "Suhbatdosh"}
                      </span>
                      <span className="flex-none text-[12.5px] text-hint tabular-nums">{listTime(m.date)}</span>
                    </span>
                    <span className="line-clamp-2 block text-[14.5px] text-sub">
                      {m.text ? <Hit text={m.text} q={p.res?.q ?? ""} /> : m.media ? mediaLabel(m.media).title : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {p.res.more ? (
              <div className="p-3 text-center">
                <button type="button" className="mini" onClick={p.onMore} disabled={p.loading}>
                  {p.loading ? "Yuklanmoqda…" : "Yana"}
                </button>
              </div>
            ) : null}
          </>
        ) : p.loading ? (
          <p className="p-6 text-center text-hint">Qidirilmoqda…</p>
        ) : null}
      </div>
    </div>
  );
}
