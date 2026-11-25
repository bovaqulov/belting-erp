// Xodim taklif qilish oynasi (faqat ko'rinish): bo'lim, rol, izoh, necha kishi, muddat → havola (nusxa, Telegram'da ulashish).
import s from "@/shared/ui/panel/styles";
import { Icon, ROLE_NAMES, SectionHeader, Sq } from "@/shared/ui/panel/ui";
import { permSummary, type RolesResp } from "@/ai/users/roles/roles.lib";
import type { UDept } from "@/ai/users/users.lib";

export type InviteForm = { dept: string; role: string; name: string; max_uses: string; days: string };

const chev = (
  <span className={s.chev}>
    <Icon name="chevron-right" />
  </span>
);

export function InviteView({
  v,
  depts,
  roles,
  accessRoles,
  picked,
  onPick,
  busy,
  link,
  onSet,
  onCreate,
  onCopy,
  onAgain,
}: {
  v: InviteForm;
  depts: UDept[];
  /** ega — xodim va admin; admin — faqat xodim */
  roles: string[];
  /** rollar katalogi (yuklanmagan bo'lsa — null, bo'lim ko'rinmaydi) */
  accessRoles: RolesResp | null;
  picked: string[];
  onPick: (key: string, on: boolean) => void;
  busy: boolean;
  /** yaratilgan havola (bo'lsa — natija ko'rinadi) */
  link: string | null;
  onSet: (k: keyof InviteForm, val: string) => void;
  onCreate: () => void;
  onCopy: () => void;
  onAgain: () => void;
}) {
  const d = depts.find((x) => x.key === v.dept);
  return (
    <>
      <div className={s.who}>
        <div className={s.av} style={{ background: "#2aabee" }}>
          <Icon name="user-plus" />
        </div>
        <h2>Xodim taklif qilish</h2>
        <div style={{ color: "var(--hint)", fontSize: 14 }}>
          Havolani yuboring — xodim botda «Start» ni bosgach, tasdiqsiz shu bo&apos;lim va rol bilan qo&apos;shiladi
        </div>
      </div>

      {link ? (
        <>
          <SectionHeader>Taklif havolasi</SectionHeader>
          <div className={`${s.list} ${s.plain}`}>
            <div className={s.field}>
              <Icon name="link" />
              <input readOnly value={link} aria-label="Taklif havolasi" onFocus={(e) => e.currentTarget.select()} />
            </div>
          </div>
          <div className={s.sf}>
            {d?.name ?? v.dept} · {ROLE_NAMES[v.role] ?? v.role} · {v.max_uses} kishi · {v.days} kun amal qiladi
          </div>
          <div className={s.actions}>
            <button className={s.btn} onClick={onCopy}>
              <Icon name="clipboard" /> Nusxa olish
            </button>
            <a
              className={s.btn}
              href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Belting tizimiga taklif — botda «Start» ni bosing")}`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="send" /> Telegram&apos;da yuborish
            </a>
            <button className={`${s.lnk}`} onClick={onAgain}>
              Yana taklif yaratish
            </button>
          </div>
        </>
      ) : (
        <>
          <SectionHeader>Bo&apos;lim</SectionHeader>
          <div className={s.list}>
            {depts.map((x) => (
              <label key={x.key} className={`${s.item} ${s.tap}`}>
                <Sq icon={x.icon} color={x.color} />
                <div className={s.main}>{x.name}</div>
                <input type="radio" name="idept" className={s.chk} value={x.key} checked={v.dept === x.key} onChange={() => onSet("dept", x.key)} />
              </label>
            ))}
          </div>
          {accessRoles ? (
            <>
              <SectionHeader>Rollar</SectionHeader>
              <div className={s.list}>
                {accessRoles.roles.map((r) => (
                  <label key={r.key} className={`${s.item} ${s.tap}`}>
                    <div className={s.main}>
                      <div className={s.t}>{r.name}</div>
                      <div className={s.s} style={{ whiteSpace: "normal" }}>
                        {permSummary(r.perms, accessRoles.perms, 6)}
                      </div>
                    </div>
                    <input type="checkbox" className={s.chk} checked={picked.includes(r.key)} onChange={(e) => onPick(r.key, e.target.checked)} />
                  </label>
                ))}
              </div>
              <div className={s.sf}>Xodim havolani bosishi bilan shu rollarni oladi (ixtiyoriy).</div>
            </>
          ) : null}
          <SectionHeader>Daraja va muddat</SectionHeader>
          <div className={`${s.list} ${s.plain}`}>
            <div className={s.field}>
              <label>Daraja</label>
              <select value={v.role} onChange={(e) => onSet("role", e.target.value)}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_NAMES[r] ?? r}
                  </option>
                ))}
              </select>
              {chev}
            </div>
            <div className={s.field}>
              <label>Necha kishi</label>
              <select value={v.max_uses} onChange={(e) => onSet("max_uses", e.target.value)}>
                {["1", "3", "5", "10", "20", "50"].map((n) => (
                  <option key={n} value={n}>
                    {n === "1" ? "1 kishi (shaxsiy)" : `${n} kishigacha`}
                  </option>
                ))}
              </select>
              {chev}
            </div>
            <div className={s.field}>
              <label>Muddat</label>
              <select value={v.days} onChange={(e) => onSet("days", e.target.value)}>
                {[
                  ["1", "1 kun"],
                  ["3", "3 kun"],
                  ["7", "1 hafta"],
                  ["30", "1 oy"],
                ].map(([k, t]) => (
                  <option key={k} value={k}>
                    {t}
                  </option>
                ))}
              </select>
              {chev}
            </div>
            <div className={s.field}>
              <label>Izoh</label>
              <input value={v.name} placeholder="Kim uchun (ixtiyoriy)" maxLength={200} onChange={(e) => onSet("name", e.target.value)} />
            </div>
          </div>
          <div className={s.sf}>Admin — xodimlarni boshqaradi; xodim — o&apos;z bo&apos;limi ishini ko&apos;radi. Daraja va rollarni keyin xodim kartasida o&apos;zgartirish mumkin.</div>
          <div className={s.actions}>
            <button className={s.btn} disabled={busy || !v.dept} onClick={onCreate}>
              <Icon name="link" /> {busy ? "Yaratilmoqda…" : "Havola yaratish"}
            </button>
          </div>
        </>
      )}
    </>
  );
}
