// Bitim tarixi (faqat ko'rinish): yozuv turi tablari, matn, vazifa muddati/ijrochisi; vaqt chizig'i (faolliklar +
// bosqichlar tarixi, vazifa "bajarildi" belgisi).
import type { ReactNode } from "react";

import { dt } from "@/erp/kit/fmt";
import { Icon } from "@/erp/kit/ui";
import { ACTI, isLate, type Activity, type Meta, type Stage } from "@/erp/crm/lib";

export type CK = "comment" | "task" | "call" | "meeting";
const TABS: [CK, string][] = [
  ["comment", "Izoh"],
  ["task", "Vazifa"],
  ["call", "Qo'ng'iroq"],
  ["meeting", "Uchrashuv"],
];
const PH: Record<CK, string> = { comment: "Izoh yozing…", task: "Nima qilish kerak?", call: "Qo'ng'iroq natijasi", meeting: "Uchrashuv natijasi" };

export function ActivityView({
  ck,
  text,
  due,
  who,
  busy,
  evs,
  userList,
  stg,
  users,
  onCk,
  onText,
  onDue,
  onWho,
  onAdd,
  onDone,
}: {
  ck: CK;
  text: string;
  due: string;
  who: string;
  busy: boolean;
  evs: Activity[];
  userList: Meta["users"];
  stg: Record<string, Stage>;
  users: Record<number, string>;
  onCk: (k: CK) => void;
  onText: (v: string) => void;
  onDue: (v: string) => void;
  onWho: (v: string) => void;
  onAdd: () => void;
  onDone: (a: Activity) => void;
}) {
  return (
    <>
      <div className="cmp">
        <div className="tabs" role="group" aria-label="Yozuv turi">
          {TABS.map(([k, t]) => (
            <button
              key={k}
              type="button"
              className={ck === k ? "on" : ""}
              aria-pressed={ck === k}
              onClick={() => onCk(k)}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          className="inp"
          value={text}
          placeholder={PH[ck]}
          aria-label={PH[ck]}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && onAdd()}
        />
        <div className="row2">
          {ck === "task" ? (
            <>
              <input type="datetime-local" className="inp" aria-label="Muddat" value={due} onChange={(e) => onDue(e.target.value)} />
              <select className="sel" aria-label="Ijrochi" value={who} onChange={(e) => onWho(e.target.value)}>
                {userList.map((u) => (
                  <option key={u.tg_id} value={u.tg_id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <span className="sp" />
          <button type="button" className="b pri" disabled={busy || !text.trim()} onClick={onAdd}>
            Qo&apos;shish
          </button>
        </div>
      </div>
      <div className="tlh">Tarix</div>
      <div className="tl">
        {evs.map((a, i) => (
          <Ev key={`${a.id ?? "s"}-${a.ts}-${i}`} a={a} stg={stg} users={users} onDone={onDone} />
        ))}
        {!evs.length ? <div className="empty2">Hali yozuv yo&apos;q</div> : null}
      </div>
    </>
  );
}

function Ev({
  a,
  stg,
  users,
  onDone,
}: {
  a: Activity;
  stg: Record<string, Stage>;
  users: Record<number, string>;
  onDone: (a: Activity) => void;
}) {
  const [icn, col] = ACTI[a.kind] || ["file", "#8e8e93"];
  const sn = (c?: string) => (c ? stg[c]?.name || c : "");
  const bx = a.data?.src === "bitrix" ? <span className="sum"> · Bitrix</span> : null;
  let txt: ReactNode = a.text;
  if (a.kind === "stage" && a.data?.from)
    txt = (
      <>
        {sn(a.data.from)} → <b>{sn(a.data.to)}</b>
        {a.data.reason ? ` (${a.data.reason})` : ""}
        {a.data.auto ? <span className="sum"> · avtomatik</span> : null}
        {bx}
      </>
    );
  else if (a.kind === "stage" && a.data?.to)
    txt = (
      <>
        Bitim ochildi: <b>{sn(a.data.to)}</b>
        {bx}
      </>
    );
  const task = a.kind === "task";
  const done = !!a.done_at;
  const late = task && !done && isLate(a.due);
  return (
    <div className={`ev ${task ? "task" : ""} ${done ? "done" : ""}`}>
      <span className="dot" style={{ background: late ? "var(--danger)" : col }}>
        <Icon n={icn} />
      </span>
      <div className="bx">
        <div className="meta">
          <span>{dt(a.ts)}</span>
          <span>{(a.actor != null && users[a.actor]) || (a.actor ? "" : "tizim")}</span>
          {task ? (
            <span className={late ? "bad-t" : ""}>
              ⏰ {dt(a.due)}
              {a.assignee && a.assignee !== a.actor ? " · " + (users[a.assignee] || "") : ""}
            </span>
          ) : null}
          {task ? (
            <input
              type="checkbox"
              className="ck ck2"
              title="Bajarildi"
              aria-label="Bajarildi"
              checked={done}
              disabled={done}
              onChange={() => onDone(a)}
            />
          ) : null}
        </div>
        <div className="txt">{txt}</div>
        {a.data?.result ? <div className="sum">Natija: {a.data.result}</div> : null}
      </div>
    </div>
  );
}
