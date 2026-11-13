// GeoMap'ga kirish (faqat ko'rinish): sarlavha, xabar, "Telegram orqali kirish" yoki bot havolasi, xato.
import { Btn } from "@/geomap/kit";

export function LoginView({ message, link, err, busy, onStart }: { message?: string; link: string | null; err: string; busy: boolean; onStart: () => void }) {
  return (
    <div className="gm-login">
      <div className="gm-login-box">
        <h1>GeoMap</h1>
        <p>Belting mijozlari xaritasi — Bitrix24 va 1C ma&apos;lumotlari asosida.</p>
        {message && <p className="gm-err">{message}</p>}
        {!link ? (
          <Btn kind="primary" onClick={onStart} disabled={busy}>{busy ? "Ochilmoqda…" : "Telegram orqali kirish"}</Btn>
        ) : (
          <>
            <p>Telegram&apos;da botni oching va <b>Start</b> ni bosing. Bu sahifa o&apos;zi ochiladi.</p>
            <p className="gm-muted small">Bot oynasi ochilmagan bo&apos;lsa (brauzer to&apos;sgan) — pastdagi tugmani bosing.</p>
            <a className="gm-btn primary" href={link} target="_blank" rel="noopener noreferrer">Botni ochish</a>
          </>
        )}
        {err && <p className="gm-err">{err}</p>}
      </div>
    </div>
  );
}
