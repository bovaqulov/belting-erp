// Ochiq havola sahifasi (faqat ko'rinish): parol / yuklanmoqda / xato ekrani; xarita (slot), sarlavha, legenda, mijoz kartasi.
import type { ReactNode } from "react";

import { Btn } from "@/geomap/kit";
import { num, STATUS_COLOR, STATUS_LABEL } from "@/geomap/lib/fields";
import { Legend } from "@/geomap/style";

export interface PubRec { id: string; name: string; lat: number; lng: number; region: string | null; status: string; address: string | null }

export function ShareLockView({ meta, pw, busy, err, onPw, onUnlock }: {
  meta: { name: string; protected: boolean } | null; pw: string; busy: boolean; err: string; onPw: (v: string) => void; onUnlock: () => void;
}) {
  return (
    <div className="gm-login">
      <div className="gm-login-box">
        <h1>{meta?.name ?? "GeoMap"}</h1>
        {meta?.protected && (
          <form onSubmit={(e) => { e.preventDefault(); onUnlock(); }} className="gm-form">
            <p className="gm-muted">Bu xarita parol bilan himoyalangan.</p>
            <input className="gm-input" type="password" placeholder="Parol" aria-label="Parol" value={pw} onChange={(e) => onPw(e.target.value)} autoFocus />
            <Btn kind="primary" type="submit" disabled={busy || !pw}>{busy ? "Tekshirilmoqda…" : "Ochish"}</Btn>
          </form>
        )}
        {(!meta || !meta.protected) && !err && <><div className="gm-spin" /><p className="gm-muted">Xarita yuklanmoqda…</p></>}
        {err && <p className="gm-err">{err}</p>}
      </div>
    </div>
  );
}

export function ShareMapView({ name, count, map, legend, card, onCloseCard }: {
  name?: string; count: number; map: ReactNode; legend: { label: string; color: string; n: number }[]; card: PubRec | null; onCloseCard: () => void;
}) {
  return (
    <div className="gm-app share">
      <main className="gm-main">
        {map}
        <div className="gm-topbar">
          <span className="gm-pill gm-pill-title"><b>{name}</b> · {num(count)} ta</span>
        </div>
        {legend.length > 0 ? <div className="gm-float-legend"><Legend items={legend} /></div> : <div className="gm-toolbar" role="status">Bu havolada xaritada ko&apos;rsatiladigan mijoz yo&apos;q</div>}
        {card && (
          <aside className="gm-card" aria-label="Mijoz">
            <button type="button" className="gm-card-x" onClick={onCloseCard} aria-label="Yopish">×</button>
            <h3>{card.name}</h3>
            <span className="gm-tag" style={{ background: STATUS_COLOR[card.status] ?? "#8a94a8" }}>{STATUS_LABEL[card.status] ?? card.status}</span>
            {card.address && <p>{card.address}</p>}
          </aside>
        )}
      </main>
    </div>
  );
}
