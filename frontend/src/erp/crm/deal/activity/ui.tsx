// Bitim tarixi (faqat ko'rinish): yozuv turi tablari, matn, vazifa muddati/ijrochisi; vaqt chizig'i (faolliklar +
// bosqichlar tarixi, vazifa "bajarildi" belgisi).
import type { ReactNode } from "react";

import { dt } from "@/erp/kit/fmt";
import { Icon } from "@/erp/kit/ui";
import { ACTI, isLate, type Activity, type Meta, type Stage } from "@/erp/crm/lib";
import { SCROLL_X, SP, SUM } from "@/erp/crm/tw";

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
      <div className="mb-4 rounded-[10px] bg-sec px-3 py-2.5 [&_textarea]:min-h-16 [&_textarea]:w-full">
        <div className={`mb-2 flex gap-1 ${SCROLL_X}`} role="group" aria-label="Yozuv turi">
          {TABS.map(([k, t]) => (
            <button
              key={k}
              type="button"
              className={`cursor-pointer rounded-md border-0 px-2.5 py-1.5 font-medium whitespace-nowrap coarse:min-h-11 ${ck === k ? "bg-fill text-fg" : "bg-transparent text-hint"}`}
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
        <div className="mt-2 flex flex-wrap items-center gap-2 max-md:[&>.b]:flex-1 max-md:[&>.inp]:flex-[1_1_100%] max-md:[&>.sel]:flex-[1_1_100%]">
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
          <span className={SP} />
          <button type="button" className="b pri" disabled={busy || !text.trim()} onClick={onAdd}>
            Qo&apos;shish
          </button>
        </div>
      </div>
      <div className="mt-1 mb-2.5 text-xs text-hint uppercase">Tarix</div>
      <div className="relative pl-[26px] before:absolute before:top-1 before:bottom-1 before:left-2.5 before:w-0.5 before:bg-sep before:content-['']">
        {evs.map((a, i) => (
          <Ev key={`${a.id ?? "s"}-${a.ts}-${i}`} a={a} stg={stg} users={users} onDone={onDone} />
        ))}
        {!evs.length ? <div className="px-2.5 py-[30px] text-center text-hint">Hali yozuv yo&apos;q</div> : null}
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
  const auto = a.data?.src === "tunnel" || a.data?.src === "robot" ? <span className={SUM}> · avtomatik</span> : null;
  let txt: ReactNode = a.text;
  if (a.kind === "stage" && a.data?.from)
    txt = (
      <>
        {sn(a.data.from)} → <b>{sn(a.data.to)}</b>
        {a.data.reason ? ` (${a.data.reason})` : ""}
        {a.data.auto ? <span className={SUM}> · avtomatik</span> : null}
        {auto}
      </>
    );
  else if (a.kind === "stage" && a.data?.to)
    txt = (
      <>
        Bitim ochildi: <b>{sn(a.data.to)}</b>
        {auto}
      </>
    );
  const task = a.kind === "task";
  const done = !!a.done_at;
  const late = task && !done && isLate(a.due);
  return (
    <div className="relative mb-3">
      <span className="absolute top-0.5 -left-[26px] grid size-[22px] place-items-center rounded-full text-white [&_svg.i]:size-[13px]" style={{ background: late ? "var(--danger)" : col }}>
        <Icon n={icn} />
      </span>
      <div className="rounded-lg bg-sec px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-hint">
          <span>{dt(a.ts)}</span>
          <span>{(a.actor != null && users[a.actor]) || (a.actor ? "" : "tizim")}</span>
          {task ? (
            <span className={late ? "text-danger" : ""}>
              ⏰ {dt(a.due)}
              {a.assignee && a.assignee !== a.actor ? " · " + (users[a.assignee] || "") : ""}
            </span>
          ) : null}
          {task ? (
            // telefonda bosish maydoni 44px (belgilagichning o'zi 26px)
            <label className="-my-2 -mr-2 ml-auto grid cursor-pointer place-items-center coarse:size-11">
              <input type="checkbox" className="ck" title="Bajarildi" aria-label="Bajarildi" checked={done} disabled={done} onChange={() => onDone(a)} />
            </label>
          ) : null}
        </div>
        <div className={`mt-0.5 whitespace-pre-wrap [overflow-wrap:anywhere] ${task && done ? "text-hint line-through" : ""}`}>{txt}</div>
        {a.data?.result ? <div className={SUM}>Natija: {a.data.result}</div> : null}
      </div>
    </div>
  );
}
