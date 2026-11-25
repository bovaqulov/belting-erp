import type { Chat } from "@/tgcrm/api";
import Avatar from "@/tgcrm/avatar";
import { Icon, Sheet } from "@/tgcrm/kit";
import { chatName } from "@/tgcrm/lib";

export function ForwardView(p: {
  acc: number;
  q: string;
  rows: Chat[] | null;
  err: string;
  busy: boolean;
  onQ: (v: string) => void;
  onPick: (c: Chat) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Kimga uzatish" onClose={p.onClose}>
      <label className="search mt-2">
        <Icon n="search" />
        <span className="sr-only">Chatni qidirish</span>
        <input type="search" placeholder="Qidirish" value={p.q} onChange={(e) => p.onQ(e.target.value)} autoFocus autoComplete="off" />
      </label>
      <ul className="m-0 min-h-[200px] list-none overflow-y-auto px-1.5 pb-2" aria-busy={p.rows === null}>
        {p.err ? <li className="p-4 text-center text-danger">{p.err}</li> : null}
        {p.rows?.map((c) => (
          <li key={c.peer_id}>
            <button
              type="button"
              disabled={p.busy}
              onClick={() => p.onPick(c)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent px-2.5 py-1.5 text-left text-fg hover:bg-fill disabled:opacity-50"
              style={{ font: "inherit" }}
            >
              <Avatar acc={p.acc} c={c} size={42} />
              <span className="min-w-0 flex-1 truncate text-[15.5px] font-medium">{chatName(c)}</span>
            </button>
          </li>
        ))}
        {p.rows && !p.rows.length ? <li className="p-6 text-center text-hint">Topilmadi</li> : null}
        {p.rows === null && !p.err ? <li className="p-6 text-center text-hint">Yuklanmoqda…</li> : null}
      </ul>
    </Sheet>
  );
}
