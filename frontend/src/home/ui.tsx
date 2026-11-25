// Bosh sahifa (faqat ko'rinish): sarlavha (logo, firma · foydalanuvchi, chiqish), bo'lim kartochkalari, holatlar.
import type { CSSProperties, ReactNode } from "react";

import s from "@/shared/ui/panel/styles";
import { Icon } from "@/shared/ui/panel/ui";
import g from "@/shared/ui/tiles/styles";

import { ART } from "./art";
import type { Card } from "./sections";

export type { Card };


export type Mode = { kind: "loading" } | { kind: "app"; cards: Card[] } | { kind: "err"; msg: string } | { kind: "login" };

export function LauncherView({
  mode,
  me,
  showLogout,
  login,
  onLogout,
}: {
  mode: Mode;
  me: { company: string; user: { name: string } } | null;
  showLogout: boolean;
  /** kirish oynasi (konteyner — API bilan) */
  login: ReactNode;
  onLogout: () => void;
}) {
  return (
    <div data-tg-ui="" data-panel="" className="contents">
      <div className={s.top}>
        <div className={s.wrap}>
          <div className={s.bar}>
            <div className={s.ttl}>
              <h1>
                <span className={s.brand} aria-hidden="true" />
                <span className={s.sr}>Belting Agent</span>
              </h1>
              <p>{me ? `${me.company} · ${me.user.name}` : "…"}</p>
            </div>
            <div className={s.sp} />
            {showLogout && (
              <button className={s["icon-btn"]} title="Chiqish" aria-label="Chiqish" onClick={onLogout}>
                <Icon name="log-out" />
              </button>
            )}
          </div>
        </div>
      </div>
      <main className={s.wrap}>
        {mode.kind === "loading" && <div className={s.empty}>Yuklanmoqda…</div>}
        {mode.kind === "err" && <div className={s.err}>{mode.msg}</div>}
        {mode.kind === "login" && login}
        {mode.kind === "app" && (
          <>
            <nav className={g.grid} aria-label="Bo'limlar">
              {mode.cards.map((c) => {
                const Art = ART[c.key];
                return (
                  <a key={c.key} className={g.card} href={c.href} style={{ "--c": c.color } as CSSProperties}>
                    <div className={g.art}>{Art && <Art />}</div>
                    <div className={g.body}>
                      <div className={g.title}>
                        <span>{c.title}</span>
                      </div>
                      <div className={g.sub}>{c.sub}</div>
                    </div>
                  </a>
                );
              })}
            </nav>
            <div className={s.empty} style={{ padding: "12px 16px", textAlign: "left", fontSize: 13 }}>
              Bo&apos;limni tanlang. Keyin tepadagi <Icon name="layout-grid" /> tugmasi bilan shu yerga qaytasiz.
            </div>
          </>
        )}
      </main>
    </div>
  );
}
