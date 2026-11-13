// Xodimni tahrirlash oynasi (faqat ko'rinish): kim, bo'limlar, rol va rahbar, xarakteristika (agent o'rgangan),
// afzalliklar, IP-telefoniya va CRM bog'lanishi, boshliq qilish (bo'lim + huquqlar); ega — o'zgartirilmaydi.
import s from "@/shared/ui/panel/panel.module.css";
import { Avatar, fmtTime, Icon, noEmoji, PERM_ICONS, ROLE_NAMES, SectionHeader, Sq } from "@/shared/ui/panel/ui";
import { activityLine, EDIT_ROLES, hasProfile, topWords, type AdminUser, type HeadScope, type PrefOpts, type ScopeState, type UDept } from "@/ai/users/users.lib";

import type { PhoneLoad, PhoneSel } from "./editor.lib";

function ProfileSection({ u }: { u: AdminUser }) {
  if (!hasProfile(u)) return null;
  const p = u.profile || {};
  const st = p.stats || {};
  const topics = st.topics || [];
  const words = topWords(u);
  return (
    <>
      <SectionHeader>Xarakteristika — Agent o&apos;rgangan</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        {p.summary ? (
          <div className={s.field} style={{ display: "block", whiteSpace: "normal", lineHeight: 1.45 }}>
            {p.summary}
          </div>
        ) : null}
        <div className={s.field}>
          <label>Faollik</label>
          <div style={{ flex: 1 }}>{activityLine(u)}</div>
        </div>
        {words ? (
          <div className={s.field}>
            <label>Ko&apos;p so&apos;zlar</label>
            <div style={{ flex: 1, whiteSpace: "normal" }}>{words}</div>
          </div>
        ) : null}
      </div>
      {topics.length > 0 && (
        <>
          <div className={s.sf}>Ko&apos;p so&apos;raydi ({st.days || 90} kun):</div>
          <div className={s.chips}>
            {topics.map(([t, n], i) => (
              <span key={i} className={s.chip}>
                {t} · {n}
              </span>
            ))}
          </div>
        </>
      )}
      {p.updated ? (
        <div className={s.sf}>Yangilangan: {fmtTime(p.updated)}</div>
      ) : (
        <div className={s.sf}>Tavsif yetarli yozishma yig&apos;ilgach avtomatik yoziladi.</div>
      )}
    </>
  );
}

function PrefsSection({
  u,
  opts,
  vals,
  set,
}: {
  u: AdminUser;
  opts: PrefOpts;
  vals: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  const p = u.prefs || {};
  const { known, labels } = opts;
  const learned = (k: string) =>
    p[k] && p[k]?.source === "learned" ? (
      <>
        {" "}
        <span className={`${s.vst} ${s.warn}`}>o&apos;rganilgan</span>
      </>
    ) : null;
  return (
    <>
      <SectionHeader>Afzalliklar — Agent shunga moslashadi</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        {Object.keys(known).map((k) => (
          <div key={k} className={s.field}>
            <label>
              {labels[k]}
              {learned(k)}
            </label>
            <select value={vals[k] ?? ""} onChange={(e) => set(k, e.target.value)}>
              <option value="">— avtomatik —</option>
              {Object.entries(known[k]).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
            <span className={s.chev}>
              <Icon name="chevron-right" />
            </span>
          </div>
        ))}
        <div className={s.field}>
          <label>
            {labels.note}
            {learned("note")}
          </label>
          <input
            value={vals.note ?? ""}
            onChange={(e) => set("note", e.target.value)}
            placeholder="masalan: havolasiz, jadval yoqmaydi"
          />
        </div>
      </div>
      <div className={s.sf}>
        Xodim o&apos;zi aytsa yoki 2 marta bir formatni so&apos;rasa, Agent (Agent tizimi) o&apos;zi to&apos;ldiradi.
      </div>
    </>
  );
}

export function UserHead({ u }: { u: AdminUser }) {
  return (
    <div className={s.who}>
      <Avatar u={u} />
      <h2>{u.name}</h2>
      <div style={{ color: "var(--hint)" }}>
        @{u.username || "-"} · {ROLE_NAMES[u.role]}
      </div>
      <div style={{ color: "var(--hint)", fontSize: 13 }}>
        ID {u.tg_id} · oxirgi faollik {fmtTime(u.last_seen)}
      </div>
    </div>
  );
}

/** Ega — barcha huquqlar, tahrir yo'q */
export const OwnerView = ({ u }: { u: AdminUser }) => (
  <>
    <UserHead u={u} />
    <div className={s.note} style={{ textAlign: "center" }}>
      Ega — barcha huquqlar. O&apos;zgartirib bo&apos;lmaydi.
    </div>
  </>
);

export function EditorView({
  u,
  depts,
  PERMS,
  headScopes,
  prefOpts,
  managers,
  deps,
  role,
  mgr,
  scopes,
  prefs,
  phone,
  sel,
  saving,
  onDep,
  onRole,
  onMgr,
  onPref,
  onSel,
  onScope,
  onPerm,
  onCancel,
  onSave,
}: {
  u: AdminUser;
  depts: UDept[];
  PERMS: Record<string, string>;
  headScopes: HeadScope[];
  prefOpts: PrefOpts | null;
  managers: AdminUser[];
  deps: string[];
  role: string;
  mgr: string;
  scopes: Record<string, ScopeState>;
  prefs: Record<string, string>;
  phone: PhoneLoad;
  sel: PhoneSel;
  saving: boolean;
  onDep: (key: string, on: boolean) => void;
  onRole: (v: string) => void;
  onMgr: (v: string) => void;
  onPref: (k: string, v: string) => void;
  onSel: (p: Partial<PhoneSel>) => void;
  onScope: (key: string, on: boolean) => void;
  onPerm: (key: string, perm: string, on: boolean) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const o = phone.st === "ok" ? phone.o : null;
  const loadingOpt = <option value="">yuklanmoqda…</option>;
  const chev = (
    <span className={s.chev}>
      <Icon name="chevron-right" />
    </span>
  );

  return (
    <>
      <UserHead u={u} />
      <SectionHeader>Bo&apos;limlar</SectionHeader>
      <div className={s.list}>
        {depts.map((d) => (
          <label key={d.key} className={`${s.item} ${s.tap}`}>
            <Sq icon={d.icon} color={d.color} />
            <div className={s.main}>{d.name}</div>
            <input
              type="checkbox"
              className={s.chk}
              value={d.key}
              checked={deps.includes(d.key)}
              onChange={(e) => onDep(d.key, e.target.checked)}
            />
          </label>
        ))}
      </div>
      <SectionHeader>Rol va rahbar</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        <div className={s.field}>
          <label>Rol</label>
          <select value={role} onChange={(e) => onRole(e.target.value)}>
            {EDIT_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_NAMES[r]}
              </option>
            ))}
          </select>
          {chev}
        </div>
        <div className={s.field}>
          <label>Rahbari</label>
          <select value={mgr} onChange={(e) => onMgr(e.target.value)}>
            <option value="">— yo&apos;q —</option>
            {managers.map((x) => (
              <option key={x.tg_id} value={String(x.tg_id)}>
                {x.name}
              </option>
            ))}
          </select>
          {chev}
        </div>
      </div>
      <div className={s.sf}>«Rahbari» — kimga bo&apos;ysunadi; daraxt shu bo&apos;yicha quriladi.</div>
      <ProfileSection u={u} />
      {prefOpts && (
        <PrefsSection u={u} opts={prefOpts} vals={prefs} set={onPref} />
      )}
      <SectionHeader>IP-telefoniya va CRM</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        <div className={s.field}>
          <label>Yeastar</label>
          <select value={sel.yext} onChange={(e) => onSel({ yext: e.target.value })}>
            {o ? (
              <>
                <option value="">— bog&apos;lanmagan —</option>
                {o.yeastar.map((x) => (
                  <option key={String(x.ext)} value={String(x.ext)}>
                    {x.ext} — {x.name}
                  </option>
                ))}
              </>
            ) : (
              loadingOpt
            )}
          </select>
          {chev}
        </div>
        <div className={s.field}>
          <label>Moizvonki</label>
          <select
            value={sel.mzu}
            disabled={o?.moizvonki_enabled === false}
            onChange={(e) => onSel({ mzu: e.target.value })}
          >
            {!o ? (
              loadingOpt
            ) : o.moizvonki_enabled === false ? (
              <option value="">vaqtincha o&apos;chirilgan</option>
            ) : (
              <>
                <option value="">— bog&apos;lanmagan —</option>
                {o.moizvonki.map((x) => (
                  <option key={String(x.id)} value={String(x.id)}>
                    {x.name}
                  </option>
                ))}
              </>
            )}
          </select>
          {chev}
        </div>
        <div className={s.field}>
          <label>Bitrix24</label>
          <select value={sel.bxu} onChange={(e) => onSel({ bxu: e.target.value })}>
            {o ? (
              <>
                <option value="">— avtomatik (Yeastar raqami bo&apos;yicha) —</option>
                {(o.bitrix || []).map((x) => (
                  <option key={String(x.id)} value={String(x.id)}>
                    {x.inner ? `${x.name} (${x.inner})` : x.name}
                  </option>
                ))}
              </>
            ) : (
              loadingOpt
            )}
          </select>
          {chev}
        </div>
      </div>
      <div className={s.sf}>
        {phone.st === "err" ? (
          phone.msg
        ) : o && o.errors.length ? (
          <span style={{ color: "var(--warn)" }}>{o.errors.join(" · ")}</span>
        ) : (
          "Ofis ichki raqami va mobil (Moizvonki) — Agent qo'ng'iroqlarini shu bo'yicha hisoblaydi."
        )}
      </div>
      <SectionHeader>Boshliq qilish</SectionHeader>
      {headScopes.map((sc) => {
        const st = scopes[sc.key];
        return (
          <div key={sc.key} className={s.list} style={{ marginBottom: 10 }}>
            <label className={`${s.item} ${s.tap}`}>
              <Sq icon={sc.icon} color={sc.color} />
              <div className={s.main}>
                <div className={s.t} style={{ whiteSpace: "normal" }}>
                  {sc.name}
                </div>
                <div className={s.s}>boshliq</div>
              </div>
              <input
                type="checkbox"
                className={s.sw}
                checked={st.on}
                onChange={(e) => onScope(sc.key, e.target.checked)}
              />
            </label>
            <div style={{ display: st.on ? "block" : "none" }}>
              {Object.entries(PERMS).map(([pk, pn]) => (
                <label key={pk} className={`${s.item} ${s.tap}`} style={{ paddingLeft: 60 }}>
                  <span style={{ color: "var(--hint)" }}>
                    <Icon name={PERM_ICONS[pk] ?? ""} />
                  </span>
                  <div className={s.main}>{noEmoji(pn)}</div>
                  <input
                    type="checkbox"
                    className={s.chk}
                    value={pk}
                    checked={!!st.perms[pk]}
                    onChange={(e) => onPerm(sc.key, pk, e.target.checked)}
                  />
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <div className={s.sf} style={{ marginTop: -4 }}>
        Faqat bo&apos;limni <b>boshqaradigan</b> odam uchun. Oddiy xodim — yuqoridagi «Bo&apos;limlar».
      </div>
      <div className={s.actions}>
        <button className={`${s.btn} ${s.sec}`} disabled={saving} onClick={onCancel}>
          Bekor
        </button>
        <button className={s.btn} id="save" disabled={saving} onClick={onSave}>
          {saving ? "Saqlanmoqda…" : "Saqlash"}
        </button>
      </div>
    </>
  );
}
