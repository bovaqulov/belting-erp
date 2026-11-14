// Agent huquqlari (faqat ko'rinish; tahrir oynasining "Huquqlar" qismi): vositalar, ma'lumot doirasi, kim foydalanadi, kanallar.
// Huquqlarni IT bo'limi yoki Rahbariyat belgilaydi (model.ts canManage) — oyna faqat ularga ochiladi.
import s from "@/shared/ui/panel/styles";
import { Icon, SectionHeader } from "@/shared/ui/panel/ui";
import { toggleTool, TOOLS, type AgentForm } from "@/ai/agents/agents.lib";
import a from "@/ai/agents/styles";
import { CHANNEL_NAMES, rid, SCOPE_AREAS, SCOPE_NAMES, type Channel, type ChannelType, type Scope } from "@/ai/agents/model";
import type { Dept } from "@/ai/shell/AdminContext";
import type { AdminUser } from "@/ai/users/users.lib";

interface Props {
  f: AgentForm;
  set: (p: Partial<AgentForm>) => void;
  depts: readonly Dept[];
  staff: readonly AdminUser[];
}

export default function AccessFields({ f, set, depts, staff }: Props) {
  const setChannel = (id: string, p: Partial<Channel>) =>
    set({ channels: f.channels.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const toggleIn = <T,>(list: readonly T[], v: T, on: boolean): T[] => (on ? [...list, v] : list.filter((x) => x !== v));
  const freeStaff = staff.filter((u) => !f.audience.users.includes(u.tg_id));

  return (
    <>
      <SectionHeader>Vositalar · {f.tools.length}</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        {TOOLS.map((t) => (
          <label key={t.key} className={`${s.item} ${s.tap} ${a.tool}`}>
            <div className={s.main}>
              <div className={`${s.t} ${t.risky ? a.risky : ""}`}>{t.name}</div>
              <div className={a.desc}>{t.desc}</div>
            </div>
            <input
              type="checkbox"
              className={s.sw}
              checked={f.tools.includes(t.key)}
              onChange={(e) => set({ tools: toggleTool(f.tools, t.key, e.target.checked) })}
            />
          </label>
        ))}
      </div>

      <SectionHeader>Ma&apos;lumot doirasi</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        {SCOPE_AREAS.map((ar) => (
          <div key={ar.key} className={s.field}>
            <label htmlFor={`sc-${ar.key}`} className={a.scLabel}>
              {ar.name}
              <small>{ar.desc}</small>
            </label>
            <select
              id={`sc-${ar.key}`}
              value={f.scopes[ar.key] ?? "inherit"}
              onChange={(e) => set({ scopes: { ...f.scopes, [ar.key]: e.target.value as Scope } })}
            >
              {(Object.keys(SCOPE_NAMES) as Scope[]).map((k) => (
                <option key={k} value={k}>
                  {SCOPE_NAMES[k]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className={s.sf}>«Rol bo&apos;yicha» — agent kimga javob berayotgan bo&apos;lsa, o&apos;sha xodimning huquqi bilan ishlaydi.</div>

      <SectionHeader>Kim foydalanadi</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        <div className={a.chipsIn}>
          {depts.map((d) => {
            const on = f.audience.depts.includes(d.key);
            return (
              <button
                key={d.key}
                type="button"
                className={a.toggle}
                aria-pressed={on}
                onClick={() => set({ audience: { ...f.audience, depts: toggleIn(f.audience.depts, d.key, !on) } })}
              >
                {on && <Icon name="check" />}
                {d.name}
              </button>
            );
          })}
        </div>
        {f.audience.users.map((id) => (
          <div key={id} className={s.item}>
            <Icon name="user" />
            <div className={s.main}>{staff.find((u) => u.tg_id === id)?.name || `#${id}`}</div>
            <button
              className={`${s.lnk} ${s.danger}`}
              aria-label="Olib tashlash"
              onClick={() => set({ audience: { ...f.audience, users: f.audience.users.filter((x) => x !== id) } })}
            >
              <Icon name="x" />
            </button>
          </div>
        ))}
        <div className={s.field}>
          <label htmlFor="aud-add">Xodim</label>
          <select
            id="aud-add"
            value=""
            onChange={(e) => e.target.value && set({ audience: { ...f.audience, users: [...f.audience.users, Number(e.target.value)] } })}
          >
            <option value="">+ qo&apos;shish…</option>
            {freeStaff.map((u) => (
              <option key={u.tg_id} value={u.tg_id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={s.sf}>Hech kim tanlanmasa — yuqori bo&apos;lim a&apos;zolari. Ular agent bilan yozishadi va topshiriq beradi.</div>

      <SectionHeader>Kanallar</SectionHeader>
      {f.channels.map((c) => (
        <div key={c.id} className={s.list} style={{ marginBottom: 8 }}>
          <div className={s.field}>
            <label htmlFor={`ch-t-${c.id}`}>Kanal</label>
            <select id={`ch-t-${c.id}`} value={c.type} onChange={(e) => setChannel(c.id, { type: e.target.value as ChannelType })}>
              {(Object.keys(CHANNEL_NAMES) as ChannelType[]).map((k) => (
                <option key={k} value={k}>
                  {CHANNEL_NAMES[k].name}
                </option>
              ))}
            </select>
            <button
              className={`${s.lnk} ${s.danger}`}
              aria-label="Kanalni o'chirish"
              onClick={() => set({ channels: f.channels.filter((x) => x.id !== c.id) })}
            >
              <Icon name="trash-2" />
            </button>
          </div>
          {c.type !== "web" && (
            <div className={s.field}>
              <label htmlFor={`ch-r-${c.id}`}>Manzil</label>
              <input
                id={`ch-r-${c.id}`}
                value={c.ref}
                onChange={(e) => setChannel(c.id, { ref: e.target.value })}
                placeholder={CHANNEL_NAMES[c.type].hint}
                autoComplete="off"
              />
            </div>
          )}
          <div className={s.field}>
            <label htmlFor={`ch-m-${c.id}`}>Javob</label>
            <select id={`ch-m-${c.id}`} value={c.mode} onChange={(e) => setChannel(c.id, { mode: e.target.value as Channel["mode"] })}>
              <option value="auto">O&apos;zi javob beradi</option>
              <option value="approve">Qoralama — mas&apos;ul tasdiqlaydi</option>
            </select>
          </div>
        </div>
      ))}
      <div className={s.actions} style={{ marginTop: 4 }}>
        <button
          className={`${s.btn} ${s.sec}`}
          onClick={() => set({ channels: [...f.channels, { id: rid("ch"), type: "telegram_group", ref: "", mode: "approve" }] })}
        >
          <Icon name="plus" /> Kanal qo&apos;shish
        </button>
      </div>
      <div className={s.sf}>Tashqi kanallarda (Instagram) avval «Qoralama» rejimi tavsiya etiladi — javoblar sifati tekshirilguncha.</div>
    </>
  );
}
