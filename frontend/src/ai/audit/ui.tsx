// Audit (faqat ko'rinish): "Hammasi / Ovozli xabarlar" filtri, hodisalar ro'yxati, ovozli xabar qatori (tinglash).
import type { ReactNode } from "react";

import s from "@/shared/ui/panel/styles";
import { Icon, SectionHeader, Sq } from "@/shared/ui/panel/ui";

import { auditIcon, auditToolInfo, auditTs, type AuditRow, type voiceInfo } from "./audit.lib";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const hint = { color: "var(--hint)", fontSize: 13 } as const;

export function VoiceRowView({
  a,
  d,
  busy,
  url,
  onPlay,
}: {
  a: AuditRow;
  d: ReturnType<typeof voiceInfo>;
  busy: boolean;
  /** yuklangan ovoz (blob URL) — bo'lsa pleyer */
  url: string | null;
  onPlay: () => void;
}) {
  return (
    <div className={cx(s.item, s.vrow)} style={{ alignItems: "flex-start" }}>
      <Sq icon="mic" color="#ff2d55" />
      <div className={s.main}>
        <div className={s.t} style={{ whiteSpace: "normal" }}>
          Ovozli xabar{" "}
          <span style={hint}>
            · {a.name || a.tg_id || ""}
            {d.forwardedFrom && (
              <>
                {" → "}
                <i>{d.forwardedFrom}</i> (forward)
              </>
            )}
            {a.dept ? " · " + a.dept : ""} · {d.duration} s
          </span>{" "}
          <span className={cx(s.vst, d.cls && s[`v${d.cls}`])}>{d.label}</span>
        </div>
        {d.text && <div className={s.vtext}>«{d.text}»</div>}
        <div className={s.vplay}>
          {url ? (
            <audio controls autoPlay src={url} style={{ width: "100%", height: 36 }} />
          ) : (
            <button className={cx(s["mini-btn"], s.vbtn)} disabled={busy} onClick={onPlay}>
              <Icon name="play" /> Tinglash
            </button>
          )}
        </div>
      </div>
      <span className={s.val} style={{ fontSize: 12, whiteSpace: "nowrap" }}>
        {auditTs(a.ts)}
      </span>
    </div>
  );
}

function EventRow({ a }: { a: AuditRow }) {
  const td = auditToolInfo(a);
  const [i, c] = auditIcon(a);
  return (
    <div className={s.item} style={{ alignItems: "flex-start" }}>
      <Sq icon={i} color={c} />
      <div className={s.main}>
        <div className={s.t}>
          {a.event}
          {td.label ? " · " + td.label : ""}
          <span style={hint}>
            {" "}
            · {a.name || a.tg_id || ""}
            {a.dept ? " · " + a.dept : ""}
          </span>
        </div>
        {a.detail && (
          <details>
            <summary className={s.s} style={{ cursor: "pointer" }}>
              {a.detail.slice(0, 90)}
            </summary>
            <pre style={{ marginTop: 4, overflowWrap: "anywhere" }}>{a.detail.slice(0, 1500)}</pre>
          </details>
        )}
      </div>
      <span className={s.val} style={{ fontSize: 12, whiteSpace: "nowrap" }}>
        {auditTs(a.ts)}
      </span>
    </div>
  );
}

export function AuditView({
  audit,
  err,
  onlyVoice,
  voiceRow,
  onVoice,
}: {
  audit: AuditRow[] | null;
  err: string | null;
  onlyVoice: boolean;
  /** ovozli xabar qatori (konteyner — ovozni yuklaydi) */
  voiceRow: (a: AuditRow) => ReactNode;
  onVoice: (only: boolean) => void;
}) {
  if (err !== null) return <div className={s.err}>{err}</div>;
  if (!audit) return <div className={s.empty}>Yuklanmoqda…</div>;
  if (!audit.length) return <div className={s.empty}>Hali yozuv yo&apos;q</div>;

  const voiceCount = audit.filter((a) => a.event === "voice").length;
  const rows = onlyVoice ? audit.filter((a) => a.event === "voice") : audit;

  return (
    <>
      <div className={s.toolbar}>
        <div className={s.seg} style={{ flex: 1 }}>
          <button className={!onlyVoice ? s.on : ""} onClick={() => onVoice(false)}>
            <Icon name="history" /> Hammasi
          </button>
          <button className={onlyVoice ? s.on : ""} onClick={() => onVoice(true)}>
            <Icon name="mic" /> Ovozli xabarlar · {voiceCount}
          </button>
        </div>
      </div>
      <SectionHeader>Oxirgi hodisalar</SectionHeader>
      <div className={s.list}>
        {rows.length ? (
          rows.map((a) => (a.event === "voice" ? voiceRow(a) : <EventRow key={a.id} a={a} />))
        ) : (
          <div className={s.item}>
            <div className={cx(s.main, s.s)}>Ovozli xabar yo&apos;q</div>
          </div>
        )}
      </div>
    </>
  );
}
