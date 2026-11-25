import type { AccMembers, AccRole } from "@/tgcrm/api";
import { Icon } from "@/tgcrm/kit";

const ROLES: [AccRole, string][] = [
  ["admin", "Admin"],
  ["operator", "Operator"],
  ["viewer", "Kuzatuvchi"],
];
const HINT: Record<AccRole, string> = {
  admin: "ulaydi, a'zolar va chatlarni boshqaradi",
  operator: "yozadi, chat oladi",
  viewer: "faqat o'qiydi",
};

export function MembersView(p: {
  data: AccMembers | null;
  err: string;
  busy: boolean;
  company: boolean;
  pick: { tg: number; role: AccRole };
  onPick: (v: { tg: number; role: AccRole }) => void;
  onAdd: () => void;
  onRole: (tg: number, role: AccRole) => void;
  onRemove: (tg: number) => void;
}) {
  const d = p.data;
  const inList = new Set(d?.members.map((m) => m.tg_id));
  const free = d?.candidates.filter((c) => !inList.has(c.tg_id)) ?? [];
  return (
    <section aria-label="Kirish huquqi">
      <h2 className="sh m-0">
        <span>Kirish huquqi</span>
      </h2>
      {d === null ? (
        <div className="skel" />
      ) : (
        <div className="list plain">
          {d.open && p.company ? (
            <div className="item">
              <Icon n="users" cls="flex-none text-hint" />
              <span className="main">
                <span className="t block">Bo&apos;limning hamma xodimi — operator</span>
                <span className="s ml block">Ro&apos;yxat bo&apos;sh. Xodim qo&apos;shsangiz, akkauntni faqat ro&apos;yxatdagilar ko&apos;radi.</span>
              </span>
            </div>
          ) : null}
          {d.members.map((m) => (
            <div key={m.tg_id} className="item">
              <span className="main">
                <span className="t block">{m.name || `#${m.tg_id}`}</span>
                <span className="s block">{HINT[m.role]}</span>
              </span>
              {d.can_manage ? (
                <>
                  <label>
                    <span className="sr-only">{m.name} roli</span>
                    <select className="sel" value={m.role} disabled={p.busy} onChange={(e) => p.onRole(m.tg_id, e.target.value as AccRole)}>
                      {ROLES.map(([k, t]) => (
                        <option key={k} value={k}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="icon-btn !text-danger"
                    onClick={() => p.onRemove(m.tg_id)}
                    disabled={p.busy}
                    aria-label={`${m.name} — olib tashlash`}
                  >
                    <Icon n="trash-2" />
                  </button>
                </>
              ) : (
                <span className="val">{ROLES.find(([k]) => k === m.role)?.[1]}</span>
              )}
            </div>
          ))}
          {d.can_manage && free.length ? (
            <div className="item flex-wrap">
              <label className="min-w-0 flex-1 basis-[180px]">
                <span className="sr-only">Xodim</span>
                <select className="sel w-full" value={p.pick.tg || ""} onChange={(e) => p.onPick({ ...p.pick, tg: Number(e.target.value) })}>
                  <option value="">Xodim qo&apos;shish…</option>
                  {free.map((c) => (
                    <option key={c.tg_id} value={c.tg_id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Rol</span>
                <select className="sel" value={p.pick.role} onChange={(e) => p.onPick({ ...p.pick, role: e.target.value as AccRole })}>
                  {ROLES.map(([k, t]) => (
                    <option key={k} value={k}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="mini pri" onClick={p.onAdd} disabled={!p.pick.tg || p.busy}>
                Qo&apos;shish
              </button>
            </div>
          ) : null}
        </div>
      )}
      {p.err ? <p className="sf m-0 !text-danger">{p.err}</p> : null}
      {!p.company ? <p className="sf m-0">Shaxsiy raqam: egasi — admin, sotuv rahbari kuzatadi. Yordamchi qo&apos;shish mumkin.</p> : null}
    </section>
  );
}
