// Agent oynasi (faqat ko'rinish): kimligi, statistika, sub-agentlar, jadval (keyingi ishga tushish), topshiriqlar,
// huquqlar (vositalar, ma'lumot doirasi, kim foydalanadi, kanallar), persona; tahrirlash / o'chirish.
import s from "@/shared/ui/panel/styles";
import { Icon, SectionHeader, Sq, tapProps } from "@/shared/ui/panel/ui";
import { toolName } from "@/ai/agents/agents.lib";
import a from "@/ai/agents/styles";
import { CHANNEL_NAMES, KIND_NAMES, SCOPE_AREAS, SCOPE_NAMES, TASK_STATUS, type Agent, type AgentTask, type Schedule } from "@/ai/agents/model";
import { describe, nextRun, whenText } from "@/ai/agents/schedule.lib";
import type { DeptStat } from "@/ai/shell/AdminContext";

export function AgentSheetView({
  ag,
  st,
  manage,
  user,
  upName,
  subs,
  scoped,
  now,
  busy,
  who,
  deptName,
  onSub,
  onAddSub,
  onSchedule,
  onTask,
  onRemove,
  onEdit,
}: {
  ag: Agent;
  st?: DeptStat;
  /** boshqarish (tahrir/o'chirish/jadval/sub-agent) huquqi */
  manage: boolean;
  /** topshiriq berish huquqi */
  user: boolean;
  upName: string | null | undefined;
  subs: Agent[];
  scoped: typeof SCOPE_AREAS;
  now: Date;
  busy: boolean;
  who: (tg: number) => string;
  deptName: (k: string) => string;
  onSub: (x: Agent) => void;
  onAddSub: () => void;
  /** item yo'q — yangi jadval */
  onSchedule: (item?: Schedule) => void;
  /** item yo'q — yangi topshiriq */
  onTask: (item?: AgentTask) => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const add = (label: string, onClick: () => void) => (
    <div className={`${s.item} ${s.tap}`} {...tapProps(onClick)} style={{ color: "var(--link)" }}>
      <Icon name="plus" />
      <div className={s.main}>{label}</div>
    </div>
  );

  return (
    <>
      <div className={s.who}>
        <Sq icon={ag.icon} color={ag.color} style={{ width: 64, height: 64, borderRadius: 18 }} />
        <h2>{ag.name}</h2>
        <div className={s.s} style={{ color: "var(--hint)" }}>
          {KIND_NAMES[ag.kind]} · {ag.model}
        </div>
        <div className={s.s} style={{ color: "var(--hint)" }}>
          {ag.kind === "dept" ? `${ag.members} xodim · ` : ""}
          {ag.owner_tg ? `${ag.kind === "staff" ? "Xodim" : "Mas'ul"}: ${who(ag.owner_tg)} · ` : ""}
          {upName ? `${upName} ostida` : "Eng yuqori daraja"}
        </div>
      </div>

      {st && (
        <>
          <SectionHeader>Statistika (7 kun)</SectionHeader>
          <div className={`${s.list} ${s.plain}`}>
            <div className={s.item}>
              <div className={s.main}>So&apos;rovlar</div>
              <span className={s.val}>{st.requests}</span>
            </div>
          </div>
        </>
      )}

      <SectionHeader>Sub-agentlar · {subs.length}</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        {subs.map((x) => (
          <div key={x.key} className={`${s.item} ${s.tap}`} {...tapProps(() => onSub(x))}>
            <Sq icon={x.icon} color={x.color} />
            <div className={s.main}>
              <div className={s.t}>{x.name}</div>
              <div className={s.s}>{KIND_NAMES[x.kind]}</div>
            </div>
            <span className={s.chev}>
              <Icon name="chevron-right" />
            </span>
          </div>
        ))}
        {manage && add("Sub-agent qo'shish", onAddSub)}
        {!subs.length && !manage && (
          <div className={s.item}>
            <div className={`${s.main} ${s.s}`}>Sub-agent yo&apos;q</div>
          </div>
        )}
      </div>

      <SectionHeader>Jadval · {ag.schedules.length}</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        {ag.schedules.map((sc) => {
          const nx = nextRun(sc, now);
          return (
            <div
              key={sc.id}
              className={`${s.item} ${manage ? s.tap : ""}`}
              {...(manage ? tapProps(() => onSchedule(sc)) : {})}
            >
              <Icon name="clock" />
              <div className={s.main}>
                <div className={s.t}>{sc.title}</div>
                <div className={s.s}>{describe(sc)}</div>
              </div>
              <span className={`${a.st} ${nx ? a.new : a.off}`}>{nx ? whenText(nx, now) : "o'chiq"}</span>
            </div>
          );
        })}
        {manage && add("Jadval qo'shish", () => onSchedule())}
        {!ag.schedules.length && !manage && (
          <div className={s.item}>
            <div className={`${s.main} ${s.s}`}>Jadval yo&apos;q</div>
          </div>
        )}
      </div>

      <SectionHeader>Topshiriqlar · {ag.tasks.filter((t) => t.status === "new" || t.status === "doing").length}</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        {ag.tasks.map((t) => (
          <div key={t.id} className={`${s.item} ${user ? s.tap : ""}`} {...(user ? tapProps(() => onTask(t)) : {})}>
            <Icon name="clipboard-check" />
            <div className={s.main}>
              <div className={s.t}>{t.title}</div>
              <div className={s.s}>{t.due ? `muddat ${t.due.split("-").reverse().join(".")}` : "muddatsiz"}</div>
            </div>
            <span className={`${a.st} ${a[TASK_STATUS[t.status].st]}`}>{TASK_STATUS[t.status].name}</span>
          </div>
        ))}
        {user && add("Topshiriq berish", () => onTask())}
        {!ag.tasks.length && !user && (
          <div className={s.item}>
            <div className={`${s.main} ${s.s}`}>Topshiriq yo&apos;q</div>
          </div>
        )}
      </div>

      <SectionHeader>Huquqlar</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        <div className={s.item}>
          <div className={s.main}>
            <div className={s.s}>Vositalar</div>
            <div className={s.tagrow}>
              {ag.tools.map((t) => (
                <span className={s.tag} key={t} title={t}>
                  {toolName(t)}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className={s.item}>
          <div className={s.main}>
            <div className={s.s}>Ma&apos;lumot doirasi</div>
            <div className={s.tagrow}>
              {scoped.length ? (
                scoped.map((ar) => (
                  <span className={s.tag} key={ar.key}>
                    {ar.name}: {SCOPE_NAMES[ag.scopes[ar.key]]}
                  </span>
                ))
              ) : (
                <span className={s.tag}>Rol bo&apos;yicha</span>
              )}
            </div>
          </div>
        </div>
        <div className={s.item}>
          <div className={s.main}>
            <div className={s.s}>Kim foydalanadi</div>
            <div className={s.tagrow}>
              {ag.audience.depts.map((k) => (
                <span className={s.tag} key={k}>
                  {deptName(k)}
                </span>
              ))}
              {ag.audience.users.map((id) => (
                <span className={s.tag} key={id}>
                  {who(id)}
                </span>
              ))}
              {!ag.audience.depts.length && !ag.audience.users.length && <span className={s.tag}>Yuqori bo&apos;lim a&apos;zolari</span>}
            </div>
          </div>
        </div>
        {ag.channels.map((c) => (
          <div key={c.id} className={s.item}>
            <Icon name={CHANNEL_NAMES[c.type].icon} />
            <div className={s.main}>
              <div className={s.t}>{CHANNEL_NAMES[c.type].name}</div>
              <div className={s.s}>{c.ref || "—"}</div>
            </div>
            <span className={`${a.st} ${c.mode === "auto" ? a.done : a.work}`}>{c.mode === "auto" ? "o'zi" : "tasdiq bilan"}</span>
          </div>
        ))}
        {!ag.channels.length && (
          <div className={s.item}>
            <div className={`${s.main} ${s.s}`} style={{ color: "var(--hint)" }}>
              Kanal ulanmagan{ag.kind === "dept" ? " — guruhda /bind" : ""}
            </div>
          </div>
        )}
      </div>

      <SectionHeader>Persona</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        <div className={s.item}>
          <pre>{ag.persona}</pre>
        </div>
      </div>

      {manage && (
        <div className={s.actions}>
          <button className={`${s.btn} ${s.danger}`} disabled={busy} onClick={onRemove}>
            <Icon name="trash-2" /> O&apos;chirish
          </button>
          <button className={s.btn} disabled={busy} onClick={onEdit}>
            <Icon name="pencil" /> Tahrirlash
          </button>
        </div>
      )}
    </>
  );
}
