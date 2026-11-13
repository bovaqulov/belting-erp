// Tizim holati (faqat ko'rinish): jarayonlar (web, worker, DB, tunnel) holati matn + rang bilan, loglar ro'yxati,
// log oynasi.
import s from "@/shared/ui/panel/panel.module.css";
import { Icon, SectionHeader, Sq, tapProps } from "@/shared/ui/panel/ui";

import { dur, size, type Status } from "./system.lib";

const MONO = { display: "block", whiteSpace: "pre-wrap", overflowWrap: "anywhere", font: "12px/1.45 ui-monospace,Menlo,monospace" } as const;
const OK = "#31b545";
const BAD = "#ec3942";

function Row({ icon, ok, t, sub, val }: { icon: string; ok: boolean; t: string; sub: string; val: string }) {
  return (
    <div className={s.item}>
      <Sq icon={icon} color={ok ? OK : BAD} />
      <div className={s.main}>
        <div className={s.t}>{t}</div>
        <div className={s.s} title={sub}>
          {sub}
        </div>
      </div>
      {/* holat rang bilan birga matnda ham (faqat rang emas) */}
      <span className={s.val} style={{ color: ok ? OK : BAD, fontWeight: 600 }}>
        {val}
      </span>
    </div>
  );
}

export function LogSheetView({ name, text, err }: { name: string; text: string | null; err: string }) {
  return (
    <>
      <div className={s.who}>
        <h2>{name}</h2>
        <div className={s.s}>oxirgi 300 qator · eng yangisi pastda</div>
      </div>
      <div className={`${s.list} ${s.plain}`}>
        <div className={s.field} style={MONO}>
          {err ? err : (text ?? "Yuklanmoqda…")}
        </div>
      </div>
    </>
  );
}

export function SystemView({ st, err, onLog }: { st: Status | null; err: string; onLog: (name: string) => void }) {
  if (err) return <div className={s.err}>{err}</div>;
  if (!st) return <div className={s.empty}>Tekshirilmoqda…</div>;

  const w = st.worker.log_age_s;
  // xato loglari tepada — muammo bo'lsa birinchi ko'rinsin
  const logs = [...st.logs].sort(
    (a, b) => Number(b.name.startsWith("errors")) - Number(a.name.startsWith("errors")) || a.age_s - b.age_s,
  );
  const dbSub = st.db.ok
    ? [st.db.engine, st.db.schema != null && `sxema ${st.db.schema}`, st.db.size_mb != null && `${st.db.size_mb} MB`]
        .filter(Boolean)
        .join(" · ")
    : st.db.error || "";
  return (
    <>
      <SectionHeader>Jarayonlar</SectionHeader>
      <div className={s.list}>
        <Row icon="monitor" ok t="Web (panel, API)" sub={`pid ${st.web.pid}`} val={`ishlayapti · ${dur(st.web.uptime_s)}`} />
        <Row
          icon="bot"
          ok={st.worker.ok}
          t="Worker (botlar, fon vazifalari)"
          sub={w === null ? "worker.log yo'q" : `worker.log oxirgi yozuv ${dur(w)} oldin`}
          val={st.worker.ok ? "ishlayapti" : "to'xtagan bo'lishi mumkin"}
        />
        <Row icon="archive" ok={st.db.ok} t="Ma'lumotlar bazasi" sub={dbSub} val={st.db.ok ? "ulangan" : "xato"} />
        <Row
          icon="link"
          ok={st.public.ok}
          t="Ochiq manzil (tunnel)"
          sub={st.public.url || "JARVIS_PUBLIC_URL yo'q"}
          val={st.public.ok ? `javob ${st.public.status}` : "javob yo'q"}
        />
      </div>
      {!st.public.ok && (
        <div style={{ padding: "8px 16px", fontSize: 13, color: BAD }}>
          {st.public.error} — bot tugmalari (Mini App) ochilmaydi. Yangi tunnel ochib, JARVIS_PUBLIC_URL ni yangilang va
          qayta ishga tushiring.
        </div>
      )}
      <SectionHeader>Loglar</SectionHeader>
      <div className={s.list}>
        {logs.map((l) => (
          <div key={l.name} className={`${s.item} ${s.tap}`} {...tapProps(() => onLog(l.name))}>
            <Sq icon="file-text" color={l.name.startsWith("errors") ? BAD : "#8e8e93"} />
            <div className={s.main}>
              <div className={s.t}>{l.name}</div>
              <div className={s.s}>
                {size(l.size)} · {dur(l.age_s)} oldin yozilgan
              </div>
            </div>
            <span className={s.chev}>
              <Icon name="chevron-right" />
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
