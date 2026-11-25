import type { ReactNode } from "react";

import type { AccEvent, Account, GwStatus } from "@/tgcrm/api";
import { Av, GatewayNotices, Icon, Notice, St, Top } from "@/tgcrm/kit";
import { displayName, eventName, fmtBytes, fmtPhone, fmtWait, tone } from "@/tgcrm/lib";

const p2 = (n: number) => String(n).padStart(2, "0");
const fmtAt = (s: string) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : `${p2(d.getDate())}.${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

const KV = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="item">
    <span className="main t">{k}</span>
    <span className="val">{v}</span>
  </div>
);

function StatusNotice({ a, wait }: { a: Account; wait: number }) {
  if (a.status === "flood" && wait > 0)
    return (
      <Notice kind="warn" icon="clock">
        Telegram {fmtWait(wait)} kutishni so&apos;radi. Shu vaqt ichida ba&apos;zi amallar vaqtincha ishlamaydi.
      </Notice>
    );
  if (a.status === "offline")
    return (
      <Notice kind="warn" icon="refresh-cw">
        {a.status_detail || "Telegram bilan aloqa uzildi."} Shlyuz o&apos;zi qayta ulanadi.
      </Notice>
    );
  if (["limited", "frozen", "banned", "logged_out", "error"].includes(a.status))
    return (
      <Notice kind="bad" icon="triangle-alert">
        {a.status_detail || a.status_label}
      </Notice>
    );
  return null;
}

export function AccountView({
  account: a,
  gw,
  events,
  wait,
  err,
  busy,
  canManage,
  connect,
  members,
  onBack,
  onLogout,
  onRestart,
  onDelete,
}: {
  account: Account;
  gw: GwStatus;
  events: AccEvent[] | null;
  wait: number;
  err: string;
  busy: boolean;
  canManage: boolean;
  connect: ReactNode;
  members: ReactNode;
  onBack: () => void;
  onLogout?: () => void;
  onRestart?: () => void;
  onDelete?: () => void;
}) {
  const name = displayName(a);
  const sub = [a.title && a.name ? a.name : "", fmtPhone(a.phone), a.username ? `@${a.username}` : ""].filter(Boolean).join(" · ");
  const L = a.limits || {};
  return (
    <>
      <Top title={a.kind === "company" ? "Firma raqami" : "Shaxsiy raqam"} onBack={onBack} />
      <div className="hero">
        <Av name={name} seed={a.tg_user_id ?? a.id} big />
        <h2>{name}</h2>
        <p>{sub || "Hali ulanmagan"}</p>
        <div className="mt-2.5">
          <St tone={tone(a.status)}>{a.status_label}</St>
        </div>
      </div>
      <StatusNotice a={a} wait={wait} />
      {canManage ? <GatewayNotices gw={gw} /> : null}
      {connect}
      {!canManage && a.status !== "active" ? <p className="sf m-0 pt-4">Bu akkauntni egasi yoki sotuv rahbari ulaydi.</p> : null}

      {a.status === "active" || a.status === "flood" || a.status === "limited" || a.status === "frozen" || a.status === "offline" ? (
        <>
          <h2 className="sh m-0">
            <span>Telegram limitlari</span>
            <span className="r">{a.premium ? "Premium" : "Bepul"}</span>
          </h2>
          <div className="list plain">
            <KV k="Xabar matni" v={`${L.message ?? 4096} belgi`} />
            <KV k="Media izohi" v={`${L.caption ?? 1024} belgi`} />
            <KV k="Fayl hajmi" v={fmtBytes(L.file_bytes)} />
            <KV k="Papkalar" v={L.folders ?? "—"} />
            <KV k="Qadalgan chatlar" v={L.pinned ?? "—"} />
          </div>
          <p className="sf m-0">Telegram akkauntga qarab beradi; xabar yozishda shu chegaralar tekshiriladi.</p>
        </>
      ) : null}

      {members}

      {err ? (
        <Notice kind="bad" icon="circle-alert">
          {err}
        </Notice>
      ) : null}

      {onRestart || onLogout || onDelete ? (
        <>
          <h2 className="sh m-0">
            <span>Amallar</span>
          </h2>
          <div className="list plain">
            {onRestart ? (
              <button
                type="button"
                className="item tap center w-full border-0 bg-transparent disabled:opacity-50"
                style={{ font: "inherit" }}
                onClick={onRestart}
                disabled={busy}
              >
                <Icon n="refresh-cw" /> Qayta ulash
              </button>
            ) : null}
            {onLogout ? (
              <button
                type="button"
                className="item tap center danger w-full border-0 bg-transparent disabled:opacity-50"
                style={{ font: "inherit" }}
                onClick={onLogout}
                disabled={busy}
              >
                <Icon n="log-out" /> Uzish
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="item tap center danger w-full border-0 bg-transparent disabled:opacity-50"
                style={{ font: "inherit" }}
                onClick={onDelete}
                disabled={busy}
              >
                <Icon n="trash-2" /> Kartani o&apos;chirish
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      <h2 className="sh m-0">
        <span>Jurnal</span>
      </h2>
      {events === null ? (
        <div className="skel" />
      ) : events.length ? (
        <ol className="list plain my-0 list-none p-0">
          {events.slice(0, 30).map((e, i) => (
            <li key={i} className="item">
              <span className="main">
                <span className="t block">{eventName(e.kind)}</span>
                {e.detail || e.actor ? <span className="s block">{[e.detail, e.actor ? `— ${e.actor}` : ""].filter(Boolean).join(" ")}</span> : null}
              </span>
              <span className="val text-[13px]">{fmtAt(e.at)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="sf m-0">Hozircha yozuv yo&apos;q.</p>
      )}
    </>
  );
}
