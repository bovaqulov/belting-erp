// Mijoz kartasi (faqat ko'rinish): holat, sifat, teg, manzil, hudud, mas'ul, savdo, qarz (rahbariyat), bitimlar, INN;
// Bitrix / orginfo / marshrut / yaqinlari / yo'l / joyini to'g'rilash; tashrif qayd etish va tashriflar tarixi.
import { Btn } from "@/geomap/kit";
import { dateUz, money, num, QUALITY_COLOR, QUALITY_LABEL, STATUS_COLOR, STATUS_LABEL } from "@/geomap/lib/fields";
import { openExternal } from "@/geomap/lib/tg";
import type { RecDetail } from "@/geomap/lib/types";

export function RecordView({ r, err, note, busy, inRoute, full, regionName, districtName, onClose, onRetry, onRoute, onNearby, onMove, onNote, onCheckin }: {
  r: RecDetail | null; err: string; note: string; busy: boolean; inRoute: boolean; full: boolean;
  regionName: (id: string) => string; districtName: (id: string) => string;
  onClose: () => void; onRetry: () => void; onRoute: () => void; onNearby: () => void; onMove: () => void; onNote: (v: string) => void; onCheckin: () => void;
}) {
  return (
    <aside className="gm-card" aria-label="Mijoz">
      <button type="button" className="gm-card-x" onClick={onClose} aria-label="Yopish">×</button>
      {err && (
        <div className="gm-card-state">
          <p className="gm-err">{err}</p>
          <Btn onClick={onRetry}>Qayta urinish</Btn>
        </div>
      )}
      {!r && !err && <p className="gm-muted gm-card-state">Yuklanmoqda…</p>}
      {r && (
        <>
          <h3>{r.name}</h3>
          <div className="gm-tags">
            <span className="gm-tag" style={{ background: STATUS_COLOR[r.status] ?? "#8a94a8" }}>{STATUS_LABEL[r.status] ?? r.status}</span>
            <span className="gm-tag outline" style={{ borderColor: QUALITY_COLOR[r.q], color: QUALITY_COLOR[r.q] }}>{QUALITY_LABEL[r.q]}</span>
            {r.tag && <span className="gm-tag outline">#{r.tag}</span>}
          </div>
          <dl className="gm-dl">
            {r.address && (<><dt>Manzil</dt><dd>{r.address}</dd></>)}
            {r.orgAddress && r.orgAddress !== r.address && (<><dt>Reyestr manzili</dt><dd>{r.orgAddress}</dd></>)}
            <dt>Hudud</dt>
            <dd>{[r.region && regionName(r.region), r.district && districtName(r.district)].filter(Boolean).join(", ") || "—"}</dd>
            <dt>Mas&apos;ul</dt>
            <dd>{r.ownerName ?? "—"}</dd>
            <dt>Savdo (12 oy)</dt>
            <dd>{money(r.sales)} so&apos;m · {num(r.salesCount)} ta xarid</dd>
            <dt>Oxirgi xarid</dt>
            <dd>{dateUz(r.lastSale)}</dd>
            {full && (<><dt>Qarz</dt><dd className={r.overdue > 0 ? "warn" : ""}>{money(r.debt)} so&apos;m{r.overdue > 0 && ` · ${num(r.overdue)} kun kechikkan`}</dd></>)}
            <dt>Ochiq bitimlar</dt>
            <dd>{r.deals}</dd>
            {r.inn && (<><dt>INN</dt><dd>{r.inn}</dd></>)}
          </dl>
          <div className="gm-row wrap">
            {r.bitrixUrl && <Btn onClick={() => openExternal(r.bitrixUrl!)}>Bitrix&apos;da ochish</Btn>}
            {r.orgUrl && <Btn onClick={() => openExternal(r.orgUrl!)}>orginfo.uz</Btn>}
            <Btn kind={inRoute ? "primary" : "plain"} onClick={onRoute} disabled={r.lat === null}>{inRoute ? "✓ Marshrutda" : "+ Marshrutga"}</Btn>
            <Btn onClick={onNearby} disabled={r.lat === null}>Yaqinlari</Btn>
            {r.lat !== null && <Btn onClick={() => openExternal(`https://yandex.uz/maps/?rtext=~${r.lat},${r.lng}&rtt=auto`)}>Yo&apos;l</Btn>}
            <Btn kind="ghost" onClick={onMove} title="Bosgach, xaritada mijozning to'g'ri joyini ko'rsating">📍 Joyini to&apos;g&apos;rilash</Btn>
          </div>
          <div className="gm-checkin">
            <textarea className="gm-input" rows={2} placeholder="Tashrif izohi (nima kelishildi, keyingi qadam)" value={note} onChange={(e) => onNote(e.target.value)} />
            <Btn kind="primary" disabled={busy} onClick={onCheckin}>{busy ? "Yozilmoqda…" : "Tashrif qayd etish"}</Btn>
          </div>
          {r.checkins.length > 0 && (
            <ul className="gm-visits">
              {r.checkins.map((c) => (
                <li key={c.id}>
                  <b>{dateUz(c.ts)}</b> · {c.name ?? c.tg_id}
                  {c.note && <p>{c.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}
