import type { Account, LoginResult } from "@/tgcrm/api";
import { Icon, Notice } from "@/tgcrm/kit";

export type Stage = "choose" | "phone" | "code" | "password" | "qr";

const INPUT = "min-w-0 flex-1 border-0 bg-transparent py-2 !text-left text-base text-fg outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="list">
      <label className="field">
        <span className="sr-only">{label}</span>
        {children}
      </label>
    </div>
  );
}

export function ConnectView(p: {
  stage: Stage;
  status: Pick<Account, "status_detail" | "phone">;
  gatewayOk: boolean;
  phone: string;
  code: string;
  password: string;
  qr: LoginResult | null;
  err: string;
  busy: boolean;
  onPhone: (v: string) => void;
  onCode: (v: string) => void;
  onPassword: (v: string) => void;
  onChoose: (m: "qr" | "phone") => void;
  onSendPhone: () => void;
  onSendCode: () => void;
  onSendPassword: () => void;
  onCancel: () => void;
}) {
  const dis = p.busy || !p.gatewayOk;
  const errBox = p.err ? (
    <Notice kind="bad" icon="circle-alert">
      {p.err}
    </Notice>
  ) : null;
  const cancel = (
    <button type="button" className="btn plain" onClick={p.onCancel} disabled={p.busy}>
      Bekor qilish
    </button>
  );

  if (p.stage === "choose")
    return (
      <section aria-label="Ulash usuli">
        <h2 className="sh m-0">
          <span>Ulash</span>
        </h2>
        <div className="list">
          <button
            type="button"
            className="item tap w-full border-0 bg-transparent text-left text-fg disabled:opacity-50"
            style={{ font: "inherit" }}
            onClick={() => p.onChoose("qr")}
            disabled={dis}
          >
            <span className="sq" style={{ background: "#3e88f7" }}>
              <Icon n="scan" />
            </span>
            <span className="main">
              <span className="t block">QR kod orqali</span>
              <span className="s block">Telefonda skanerlaysiz — tavsiya etiladi</span>
            </span>
            <Icon n="chevron-right" cls="chev" />
          </button>
          <button
            type="button"
            className="item tap w-full border-0 bg-transparent text-left text-fg disabled:opacity-50"
            style={{ font: "inherit" }}
            onClick={() => p.onChoose("phone")}
            disabled={dis}
          >
            <span className="sq" style={{ background: "#2fa37a" }}>
              <Icon n="phone" />
            </span>
            <span className="main">
              <span className="t block">Telefon raqami orqali</span>
              <span className="s block">Telegram kod yuboradi</span>
            </span>
            <Icon n="chevron-right" cls="chev" />
          </button>
        </div>
        <p className="sf m-0">
          Faqat bir necha oydan beri ishlatilayotgan, haqiqiy SIM-kartali raqamni ulang — yangi va virtual raqamlarni Telegram tez bloklaydi.
        </p>
        {errBox}
      </section>
    );

  if (p.stage === "qr")
    return (
      <section aria-label="QR orqali ulash">
        <h2 className="sh m-0">
          <span>QR kodni skanerlang</span>
        </h2>
        <div className="list flex flex-col items-center gap-3 px-4 py-5">
          {p.qr?.qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URI (serverda yasalgan SVG), optimallashtirish kerak emas
            <img src={p.qr.qr} alt="Telegram'ga kirish QR kodi" width={232} height={232} className="size-[232px] rounded-lg bg-white" />
          ) : (
            <div className="grid size-[232px] place-items-center rounded-lg bg-fill text-hint" aria-busy="true">
              QR tayyorlanmoqda…
            </div>
          )}
          <ol className="m-0 w-full list-decimal pl-5 text-[15px] leading-relaxed text-pretty">
            <li>Telefonda Telegram&apos;ni oching</li>
            <li>Sozlamalar → Qurilmalar → «Qurilma ulash»</li>
            <li>Shu QR kodni skanerlang</li>
          </ol>
        </div>
        <p className="sf m-0">QR har 30 soniyada yangilanadi, 5 daqiqa amal qiladi. Telefonda yangi sessiyani tasdiqlang.</p>
        {errBox}
        <div className="btns">{cancel}</div>
      </section>
    );

  if (p.stage === "phone")
    return (
      <form
        aria-label="Telefon raqami"
        onSubmit={(e) => {
          e.preventDefault();
          p.onSendPhone();
        }}
      >
        <h2 className="sh m-0">
          <span>Telefon raqami</span>
        </h2>
        <Field label="Telefon raqami">
          <input
            className={INPUT}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+998 90 123 45 67"
            value={p.phone}
            onChange={(e) => p.onPhone(e.target.value)}
            autoFocus
          />
        </Field>
        <p className="sf m-0">Kod shu raqamdagi Telegram ilovasiga (yoki SMS) keladi. Kuniga urinishlar soni cheklangan.</p>
        {errBox}
        <div className="btns">
          {cancel}
          <button type="submit" className="btn" disabled={dis}>
            {p.busy ? "Yuborilmoqda…" : "Kod olish"}
          </button>
        </div>
      </form>
    );

  if (p.stage === "code")
    return (
      <form
        aria-label="Tasdiqlash kodi"
        onSubmit={(e) => {
          e.preventDefault();
          p.onSendCode();
        }}
      >
        <h2 className="sh m-0">
          <span>Kod</span>
        </h2>
        <Field label="Tasdiqlash kodi">
          <input
            className={`${INPUT} code text-lg tracking-[0.3em]`}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="12345"
            maxLength={8}
            value={p.code}
            onChange={(e) => p.onCode(e.target.value)}
            autoFocus
          />
        </Field>
        <p className="sf m-0">{p.status.status_detail || "Kod Telegram ilovasiga yuborildi."} Kodni hech kimga bermang.</p>
        {errBox}
        <div className="btns">
          {cancel}
          <button type="submit" className="btn" disabled={dis}>
            {p.busy ? "Tekshirilmoqda…" : "Kirish"}
          </button>
        </div>
      </form>
    );

  return (
    <form
      aria-label="2FA parol"
      onSubmit={(e) => {
        e.preventDefault();
        p.onSendPassword();
      }}
    >
      <h2 className="sh m-0">
        <span>Ikki bosqichli himoya</span>
      </h2>
      <Field label="2FA parol">
        <input
          className={INPUT}
          type="password"
          autoComplete="current-password"
          placeholder="Parol"
          value={p.password}
          onChange={(e) => p.onPassword(e.target.value)}
          autoFocus
        />
      </Field>
      <p className="sf m-0">{p.status.status_detail || "Akkauntda 2FA yoqilgan."} Parol saqlanmaydi — faqat Telegram&apos;ga uzatiladi.</p>
      {errBox}
      <div className="btns">
        {cancel}
        <button type="submit" className="btn" disabled={dis}>
          {p.busy ? "Tekshirilmoqda…" : "Kirish"}
        </button>
      </div>
    </form>
  );
}
