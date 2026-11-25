import type { Kind } from "@/tgcrm/api";
import { Icon, Notice, Top } from "@/tgcrm/kit";

const KINDS: [Kind, string, string, string][] = [
  ["company", "Firma raqami", "Bo'lim xodimlari birgalikda yozishadi", "building-2"],
  ["personal", "Shaxsiy raqam", "Sotuvchining o'z Telegram'i", "user"],
];

export function CreateView({
  isHead,
  kind,
  title,
  err,
  busy,
  onKind,
  onTitle,
  onSubmit,
  onBack,
}: {
  isHead: boolean;
  kind: Kind;
  title: string;
  err: string;
  busy: boolean;
  onKind: (k: Kind) => void;
  onTitle: (t: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Top title="Akkaunt ulash" onBack={onBack} />
      {isHead ? (
        <fieldset className="m-0 border-0 p-0">
          <legend className="sh">Turi</legend>
          <div className="list" role="radiogroup">
            {KINDS.map(([k, t, s, ic]) => (
              <label key={k} className="item tap">
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => onKind(k)} className="sr-only" />
                <span
                  className="sq"
                  style={{
                    background: k === "company" ? "#3e88f7" : "#2fa37a",
                  }}
                >
                  <Icon n={ic} />
                </span>
                <span className="main">
                  <span className="t block">{t}</span>
                  <span className="s block">{s}</span>
                </span>
                {kind === k ? <Icon n="check" cls="text-link" /> : null}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <h2 className="sh m-0">
        <span>{kind === "company" ? "Nomi" : "Nomi (ixtiyoriy)"}</span>
      </h2>
      <div className="list">
        <label className="field">
          <span className="sr-only">Nomi</span>
          <input
            className="min-w-0 flex-1 border-0 bg-transparent py-2 !text-left text-base text-fg outline-none"
            value={title}
            maxLength={120}
            placeholder={kind === "company" ? "Sotuv bo'limi" : "Masalan: ish raqamim"}
            onChange={(e) => onTitle(e.target.value)}
            autoComplete="off"
          />
        </label>
      </div>
      <p className="sf m-0">
        {kind === "company"
          ? "Keyingi qadamda raqamni ulaysiz: QR yoki SMS/Telegram kodi orqali."
          : "Shaxsiy raqamingizdagi yozishmalarni faqat siz va sotuv rahbari ko'radi."}
      </p>
      {err ? (
        <Notice kind="bad" icon="circle-alert">
          {err}
        </Notice>
      ) : null}
      <div className="btns mt-5">
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Saqlanmoqda…" : "Davom etish"}
        </button>
      </div>
    </form>
  );
}
