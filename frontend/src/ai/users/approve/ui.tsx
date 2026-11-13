// Xodimni tasdiqlash oynasi (faqat ko'rinish): kim, qaysi bo'limga (bosilganda tasdiqlanadi).
import s from "@/shared/ui/panel/panel.module.css";
import { Avatar, Icon, SectionHeader, Sq, tapProps } from "@/shared/ui/panel/ui";
import type { AdminUser, UDept } from "@/ai/users/users.lib";

export function ApproveView({ u, depts, busy, onPick }: { u: AdminUser; depts: UDept[]; busy: boolean; onPick: (dk: string) => void }) {
  return (
    <>
      <div className={s.who}>
        <Avatar u={u} />
        <h2>{u.name}</h2>
        <div style={{ color: "var(--hint)" }}>@{u.username || "-"}</div>
      </div>
      <SectionHeader>Qaysi bo&apos;limga?</SectionHeader>
      <div className={s.list} style={busy ? { opacity: 0.55, pointerEvents: "none" } : undefined} aria-busy={busy}>
        {depts.map((d) => (
          <div key={d.key} className={`${s.item} ${s.tap}`} {...tapProps(() => onPick(d.key))}>
            <Sq icon={d.icon} color={d.color} />
            <div className={s.main}>{d.name}</div>
            <span className={s.chev}>
              <Icon name="chevron-right" />
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
