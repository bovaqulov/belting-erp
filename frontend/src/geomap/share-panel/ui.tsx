// Ulashish paneli (faqat ko'rinish): saqlangan ko'rinishlar (saqlash, jamoa, yuklash, o'chirish), havola orqali ulashish
// (nomi, parol, muddat, yaratilgan havola), mening havolalarim (nusxalash, o'chirish).
import { Btn, Empty, Field, Section, Toggle } from "@/geomap/kit";
import { dateUz, num } from "@/geomap/lib/fields";
import type { ViewState } from "@/geomap/lib/types";

export interface Share { token: string; name: string; protected: boolean; expires: string; ts: string; n: number }
export interface View { id: number; name: string; owner_tg: number; shared: boolean; state: ViewState; ts: string }

export type ShareForm = { name: string; password: string; days: number };

export function SharePanelView({
  ids, me, shares, views, form, vname, vshared, busy, vbusy, made,
  onLoadView, onSaveView, onVname, onVshared, onRemoveView, onForm, onCreate, onCopy, onRemoveShare,
}: {
  ids: string[]; me: number; shares: Share[] | null; views: View[] | null; form: ShareForm; vname: string; vshared: boolean;
  busy: boolean; vbusy: boolean; made: string | null;
  onLoadView: (s: ViewState) => void; onSaveView: () => void; onVname: (v: string) => void; onVshared: (v: boolean) => void;
  onRemoveView: (v: View) => void; onForm: (f: ShareForm) => void; onCreate: () => void; onCopy: (token: string) => void; onRemoveShare: (s: Share) => void;
}) {
  return (
    <div className="gm-panel-body">
      <Section title="Saqlangan ko'rinishlar">
        <p className="gm-muted small">Filtr, uslub, qatlamlar va xarita joyi birga saqlanadi (masalan “Samarqand qarzdorlari”).</p>
        <form className="gm-row" onSubmit={(e) => { e.preventDefault(); onSaveView(); }}>
          <input className="gm-input" placeholder="Ko'rinish nomi" aria-label="Ko'rinish nomi" maxLength={80} value={vname} onChange={(e) => onVname(e.target.value)} />
          <Btn kind="primary" type="submit" disabled={vbusy}>{vbusy ? "Saqlanmoqda…" : "Saqlash"}</Btn>
        </form>
        <Toggle on={vshared} onChange={onVshared} label="Jamoa ko'rsin" hint="Yoqilsa — GeoMap'dan foydalanadigan barcha xodimlarga ko'rinadi" />
        {!views && <Empty>Yuklanmoqda…</Empty>}
        {views && !views.length && <Empty>Hali saqlangan ko&apos;rinish yo&apos;q.</Empty>}
        {(views ?? []).map((v) => (
          <div key={v.id} className="gm-trow">
            <button type="button" className="gm-link" title={`${v.name} — yuklash`} onClick={() => onLoadView(v.state)}>{v.name}</button>
            {v.shared && <em>jamoa</em>}
            {v.owner_tg === me && (
              <button type="button" className="gm-x" aria-label={`${v.name} ko'rinishini o'chirish`} onClick={() => onRemoveView(v)}>×</button>
            )}
          </div>
        ))}
      </Section>

      <Section title="Havola orqali ulashish">
        <p className="gm-muted small">
          Hozirgi filtrdagi {num(ids.length)} ta mijoz jonli xaritada ko&apos;rinadi (joylashuv va holat yangilanib turadi). Savdo, qarz, INN va mas&apos;ul
          <b> ko&apos;rsatilmaydi</b>.
        </p>
        <Field label="Nomi">
          <input className="gm-input" value={form.name} placeholder="Mijozlar xaritasi" onChange={(e) => onForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Parol (ixtiyoriy)">
          <input className="gm-input" type="text" autoComplete="off" value={form.password} placeholder="bo'sh — ochiq havola" onChange={(e) => onForm({ ...form, password: e.target.value })} />
        </Field>
        <Field label={`Amal qilish muddati: ${form.days} kun`}>
          <input type="range" min={1} max={365} value={form.days} onChange={(e) => onForm({ ...form, days: Number(e.target.value) })} />
        </Field>
        <Btn kind="primary" disabled={busy || !ids.length} onClick={onCreate}>{busy ? "Yaratilmoqda…" : "Havola yaratish"}</Btn>
        {!ids.length && <p className="gm-muted small">Filtrga mos mijoz yo&apos;q — ulashish uchun filtrni o&apos;zgartiring.</p>}
        {made && (
          <Field label="Havola (bosib, belgilab nusxalang)">
            <input className="gm-input" readOnly value={made} onFocus={(e) => e.target.select()} />
          </Field>
        )}
      </Section>

      {/* ro'yxat kelgach bo'lim ochiq holda qayta yaratiladi (boshida bo'sh — yopiq qolib ketardi) */}
      <Section key={shares?.length ? "has" : "none"} title={`Mening havolalarim${shares ? ` (${shares.length})` : ""}`} open={!!shares?.length}>
        {!shares && <Empty>Yuklanmoqda…</Empty>}
        {shares && !shares.length && <Empty>Hali havola yaratilmagan.</Empty>}
        {(shares ?? []).map((s) => (
          <div key={s.token} className="gm-trow">
            <button type="button" className="gm-link" title={`${s.name} — havolani nusxalash`} onClick={() => onCopy(s.token)}>{s.name}</button>
            <em>{num(s.n)} ta{s.protected ? " · 🔒" : ""}</em>
            <span className="gm-muted small">{dateUz(s.expires.slice(0, 10))} gacha</span>
            <button type="button" className="gm-x" aria-label={`${s.name} havolasini o'chirish`} onClick={() => onRemoveShare(s)}>×</button>
          </div>
        ))}
      </Section>
    </div>
  );
}
