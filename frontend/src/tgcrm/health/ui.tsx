import type { AccHealth, HealthCheck } from "@/tgcrm/api";
import { Icon, St } from "@/tgcrm/kit";
import { fmtMinutes, listTime, tone } from "@/tgcrm/lib";

const LEVEL: Record<HealthCheck["level"], { icon: string; cls: string; label: string }> = {
  ok: { icon: "check", cls: "text-ok", label: "joyida" },
  warn: { icon: "triangle-alert", cls: "text-warn", label: "e'tibor" },
  error: { icon: "circle-alert", cls: "text-danger", label: "xato" },
};

function ago(sec: number | null): string {
  if (sec === null) return "yangilanish yo'q";
  if (sec < 60) return "hozirgina";
  return `${fmtMinutes(Math.floor(sec / 60))} oldin`;
}

export function HealthView({ data, err }: { data: { checks: HealthCheck[]; accounts: AccHealth[] } | null; err: string }) {
  const bad = data?.checks.filter((c) => c.level !== "ok").length ?? 0;
  return (
    <section aria-label="Tizim holati">
      <h2 className="sh m-0">
        <span>Tizim holati</span>
        <span className="r">{data ? (bad ? `${bad} ta e'tibor` : "hammasi joyida") : ""}</span>
      </h2>
      {err ? <p className="sf m-0 !text-danger">{err}</p> : null}
      {!data ? (
        <div className="skel" />
      ) : (
        <>
          <ul className="list plain my-0 list-none p-0">
            {data.checks.map((c) => {
              const l = LEVEL[c.level];
              return (
                <li key={c.name} className="item">
                  <span className={l.cls} role="img" aria-label={l.label}>
                    <Icon n={l.icon} />
                  </span>
                  <span className="main">
                    <span className="t block">{c.name}</span>
                    <span className="s ml block">{c.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {data.accounts.length ? (
            <>
              <h2 className="sh m-0">
                <span>Akkauntlar sog&apos;lig&apos;i</span>
              </h2>
              <ul className="list plain my-0 list-none p-0">
                {data.accounts.map((a) => (
                  <li key={a.id} className="item">
                    <span
                      className={`size-2.5 flex-none rounded-full ${a.connected ? "bg-ok" : "bg-hint/50"}`}
                      role="img"
                      aria-label={a.connected ? "Shlyuzda ulangan" : "Shlyuzda ulanmagan"}
                    />
                    <span className="main">
                      <span className="t block">{a.title}</span>
                      <span className="s ml block">
                        {a.connected ? `Oxirgi Telegram yangilanishi: ${ago(a.last_update_ago)}` : "Shlyuzda ulanmagan"}
                        {a.session_saved ? ` · sessiya saqlangan ${listTime(a.session_saved)}` : ""}
                        {a.alert_at ? ` · ogohlantirish: ${listTime(a.alert_at)}` : ""}
                      </span>
                    </span>
                    <St tone={tone(a.status)}>{a.status_label}</St>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="sf m-0">Muammo bo&apos;lsa, Jarvis bot akkaunt egasi, adminlar va sotuv rahbarlariga yozadi (soatiga bir marta).</p>
        </>
      )}
    </section>
  );
}
