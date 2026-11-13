// Boshliq tayinlash oynasi (faqat ko'rinish): @username, bo'lim, "Tayinlash"; tayinlangan, botga hali kirmaganlar.
import type { RefObject } from "react";

import s from "@/shared/ui/panel/panel.module.css";
import { Icon, SectionHeader, Sq } from "@/shared/ui/panel/ui";
import { deptOf, type HeadScope, type PendingHead, type UDept } from "@/ai/users/users.lib";

export function HeadFormView({
  inpRef,
  username,
  dept,
  headScopes,
  pendingHeads,
  depts,
  busy,
  onUsername,
  onDept,
  onAdd,
  onDel,
}: {
  inpRef: RefObject<HTMLInputElement | null>;
  username: string;
  dept: string;
  headScopes: HeadScope[];
  pendingHeads: PendingHead[];
  depts: UDept[];
  busy: boolean;
  onUsername: (v: string) => void;
  onDept: (k: string) => void;
  onAdd: () => void;
  onDel: (id: PendingHead["id"]) => void;
}) {
  return (
    <>
      <div className={s.who}>
        <div className={s.av} style={{ background: "var(--gold)" }}>
          <Icon name="crown" />
        </div>
        <h2>Boshliq tayinlash</h2>
        <div style={{ color: "var(--hint)", fontSize: 14 }}>
          Botga hali kirmagan bo&apos;lsa ham — kirganda avtomatik boshliq bo&apos;ladi
        </div>
      </div>
      <SectionHeader>Foydalanuvchi</SectionHeader>
      <div className={`${s.list} ${s.plain}`}>
        <div className={s.field}>
          <Icon name="user" />
          <input
            ref={inpRef}
            placeholder="@username"
            aria-label="Telegram username"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === "Enter") onAdd();
            }}
            value={username}
            onChange={(e) => onUsername(e.target.value)}
          />
        </div>
      </div>
      <SectionHeader>Bo&apos;lim</SectionHeader>
      <div className={s.list}>
        {headScopes.map((sc) => (
          <label key={sc.key} className={`${s.item} ${s.tap}`}>
            <Sq icon={sc.icon} color={sc.color} />
            <div className={s.main}>{sc.name}</div>
            <input
              type="radio"
              name="hdept"
              className={s.chk}
              value={sc.key}
              checked={dept === sc.key}
              onChange={() => onDept(sc.key)}
            />
          </label>
        ))}
      </div>
      <div className={s.actions}>
        <button className={s.btn} disabled={busy} onClick={onAdd}>
          <Icon name="crown" /> {busy ? "Yuborilmoqda…" : "Tayinlash"}
        </button>
      </div>
      {pendingHeads.length > 0 && (
        <>
          <SectionHeader>Tayinlangan, botga hali kirmagan</SectionHeader>
          <div className={s.list}>
            {pendingHeads.map((h) => (
              <div key={String(h.id)} className={s.item}>
                <Sq icon="clock" color="#8e8e93" />
                <div className={s.main}>
                  <div className={s.t}>@{h.username}</div>
                  <div className={s.s}>{deptOf(depts, h.dept_group).name}</div>
                </div>
                <button className={`${s.lnk} ${s.danger}`} disabled={busy} onClick={() => onDel(h.id)}>
                  O&apos;chirish
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
