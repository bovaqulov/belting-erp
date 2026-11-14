// Shablonlar (faqat ko'rinish): tasdiqlovchi izohi, kutayotgan takliflar (tasdiqlash/rad etish), bo'limlar bo'yicha faol
// shablonlar (tahrirlash mumkin bo'lsa — bosiladi), yangi shablon, tarix.
import s from "@/shared/ui/panel/styles";
import { fmtTime, Icon, noEmoji, SectionHeader, Sq, tapProps } from "@/shared/ui/panel/ui";

import { deptOf, editableDepts, groupByDept, pendingOf, STATUS_NAMES, TYPE_NAMES, type Template, type TemplatesData } from "./templates.lib";

function Tags({ t }: { t: Template }) {
  return (
    <div className={s.tagrow}>
      {t.fields.map((f, i) => (
        <span className={s.tag} key={i}>
          {noEmoji(f.label)} · {TYPE_NAMES[f.type] || f.type}
        </span>
      ))}
    </div>
  );
}

export function TemplatesView({
  d,
  busy,
  onDecide,
  onEdit,
}: {
  d: TemplatesData;
  busy: boolean;
  onDecide: (id: number, ok: boolean) => void;
  /** tahrirlash oynasi (blank — yangi shablon) */
  onEdit: (deptKey: string, blank?: boolean) => void;
}) {
  const dn = (k: string) => deptOf(d.depts, k);
  const editable = editableDepts(d);
  const byDept = groupByDept(d.templates);
  const pending = pendingOf(d.templates);

  return (
    <>
      <div
        className={s.note}
        style={{
          margin: "12px 16px 0",
          background: "var(--sec)",
          borderRadius: 12,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <Sq icon="shield-check" color="#34c759" />
        <div>
          O&apos;zgarishlarni <b>{dn(d.approver_dept).name}</b> bo&apos;limi yoki ega kiritadi/tasdiqlaydi.{" "}
          {d.is_approver
            ? "Siz tasdiqlovchisiz — o'zgarishingiz darhol kuchga kiradi."
            : "Sizning o'zgarishingiz tasdiqqa yuboriladi."}
        </div>
      </div>

      {pending.length > 0 && (
        <>
          <SectionHeader>Tasdiq kutayotgan takliflar</SectionHeader>
          {pending.map((t) => {
            const dp = dn(t.dept);
            return (
              <div key={t.id} className={s.list} style={{ marginBottom: 10 }}>
                <div className={s.item}>
                  <Sq icon={dp.icon} color={dp.color} />
                  <div className={s.main}>
                    <div className={s.t}>
                      {dp.name} — «{t.title}» v{t.version}
                    </div>
                    <div className={s.s}>
                      {t.proposed_name || "—"} · {fmtTime(t.created)}
                    </div>
                    <Tags t={t} />
                  </div>
                </div>
                {d.is_approver && (
                  <div className={s.item} style={{ gap: 10 }}>
                    <button className={s["mini-btn"]} disabled={busy} onClick={() => onDecide(t.id, true)}>
                      <Icon name="check" /> Tasdiqlash
                    </button>
                    <button className={`${s["mini-btn"]} ${s.danger}`} disabled={busy} onClick={() => onDecide(t.id, false)}>
                      <Icon name="x" /> Rad etish
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      <SectionHeader>Faol shablonlar</SectionHeader>
      <div className={s.list}>
        {Object.keys(byDept).length ? (
          Object.keys(byDept).map((k) => {
            const a = byDept[k].find((t) => t.status === "active");
            const pend = byDept[k].find((t) => t.status === "pending");
            const dp = dn(k);
            const can = editable.includes(k);
            return (
              <div
                key={k}
                className={can ? `${s.item} ${s.tap}` : s.item}
                {...(can ? tapProps(() => onEdit(k)) : {})}
              >
                <Sq icon={dp.icon} color={dp.color} />
                <div className={s.main}>
                  <div className={s.t}>
                    {dp.name}
                    {a ? ` — «${a.title}» v${a.version}` : ""}
                  </div>
                  <div className={s.s}>
                    {a ? (
                      <>
                        <Icon name="clock" /> {a.ask_at || "—"} eslatma · {a.summary_at || "—"} jadval · {a.fields.length}{" "}
                        maydon
                      </>
                    ) : (
                      "faol shablon yo'q"
                    )}
                    {pend && (
                      <>
                        {" · "}
                        <span style={{ color: "var(--warn)" }}>v{pend.version} kutmoqda</span>
                      </>
                    )}
                  </div>
                </div>
                {can && (
                  <span className={s.chev}>
                    <Icon name="chevron-right" />
                  </span>
                )}
              </div>
            );
          })
        ) : (
          <div className={s.item}>
            <div className={`${s.main} ${s.s}`}>Shablon yo&apos;q</div>
          </div>
        )}
      </div>
      {editable.length > 0 && (
        <div className={s.actions}>
          <button className={`${s.btn} ${s.sec}`} onClick={() => onEdit(editable[0], true)}>
            <Icon name="plus" /> Yangi shablon
          </button>
        </div>
      )}

      <SectionHeader>Tarix</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        {d.templates.slice(0, 30).map((t) => (
          <div key={t.id} className={s.item}>
            <div className={s.main}>
              <div className={s.t}>
                {dn(t.dept).name} — «{t.title}» v{t.version}
              </div>
              <div className={s.s} style={{ whiteSpace: "normal" }}>
                {t.proposed_name || "boshlang'ich"}
                {t.decided_name ? " → " + t.decided_name : ""} · {fmtTime(t.decided || t.created)}
              </div>
            </div>
            <span className={`${s.badge} ${s[t.status] ?? ""}`}>{STATUS_NAMES[t.status] || t.status}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** xato yoki yuklanmoqda */
export const TemplatesStatus = ({ err }: { err?: string | null }) =>
  err != null ? <div className={s.err}>{err}</div> : <div className={s.empty}>Yuklanmoqda…</div>;
