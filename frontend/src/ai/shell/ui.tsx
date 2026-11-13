// Boshqaruv paneli karkasi (faqat ko'rinish): yuqori panel (bo'lim ikonkasi, sarlavha, firma · foydalanuvchi, bo'limlar,
// yangilash, chiqish), tablar (tepada va telefonda pastda), holatlar, bo'lim (xato chegarasi bilan), oynalar, toast.
import { Component, useEffect, useState, type ReactNode } from "react";

import s from "@/shared/ui/panel/panel.module.css";
import { Icon } from "@/shared/ui/panel/ui";

import type { Me, ToastKind } from "./AdminContext";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export type Mode = { kind: "loading" } | { kind: "app" } | { kind: "err"; msg: string } | { kind: "login"; msg: string };
export type SheetItem = { id: number; node: ReactNode; closing: boolean };
export type ToastState = { msg: string; kind: ToastKind; shown: boolean };

/** eski render() ichidagi try/catch → <div class="err"> (chizish paytidagi xatolar uchun) */
export class SectionBoundary extends Component<{ children: ReactNode }, { msg: string | null }> {
  state = { msg: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { msg: e instanceof Error ? e.message : String(e) };
  }
  render() {
    return this.state.msg !== null ? <div className={s.err}>{this.state.msg}</div> : this.props.children;
  }
}

export function SheetView({ node, closing, onBg }: { node: ReactNode; closing: boolean; onBg: () => void }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const vis = on && !closing;
  return (
    <>
      <div className={cx(s["sheet-bg"], vis && s.on)} onClick={onBg} />
      <div className={cx(s.sheet, vis && s.on)} role="dialog" aria-modal="true">
        <div className={s.grab} />
        <button className={s["sheet-x"]} title="Yopish" aria-label="Yopish" onClick={onBg}>
          <Icon name="x" />
        </button>
        {node}
      </div>
    </>
  );
}

export function ShellView({
  area: A,
  me,
  mode,
  readonly,
  showLogout,
  spin,
  tabs,
  login,
  section,
  sectionKey,
  sheets,
  toastSt,
  onRefresh,
  onLogout,
  onCloseSheet,
}: {
  area: { title: string; icon: string };
  me: Me | null;
  mode: Mode;
  readonly: boolean;
  showLogout: boolean;
  /** yangilash tugmasi aylanishi (har bosishda oshadi) */
  spin: number;
  /** tab tugmalari (bitta tabli qismda — null) */
  tabs: ReactNode;
  /** kirish oynasi (konteyner) */
  login: ReactNode;
  section: ReactNode;
  sectionKey: string;
  sheets: SheetItem[];
  toastSt: ToastState | null;
  onRefresh: () => void;
  onLogout: () => void;
  onCloseSheet: () => void;
}) {
  const app = mode.kind === "app";
  return (
    <div className={readonly ? s.ro : undefined}>
      <div className={s.top}>
        <div className={s.wrap}>
          <div className={s.bar}>
            <div className={s.logo}>
              <Icon name={A.icon} />
            </div>
            <div className={s.ttl}>
              <h1>{A.title}</h1>
              <p>{me ? `${me.company} · ${me.user.name}` : "…"}</p>
            </div>
            <div className={s.sp} />
            {/* bo'lim tanlash ekrani (/app) */}
            <a className={s["icon-btn"]} href="/app" title="Bo'limlar" aria-label="Bo'limlar">
              <Icon name="layout-grid" />
            </a>
            <button key={spin} className={cx(s["icon-btn"], spin > 0 && s.spin)} title="Yangilash" aria-label="Yangilash" onClick={onRefresh}>
              <Icon name="refresh-cw" />
            </button>
            {showLogout && (
              <button className={s["icon-btn"]} title="Chiqish" aria-label="Chiqish" onClick={onLogout}>
                <Icon name="log-out" />
              </button>
            )}
          </div>
          <div className={s.tabs}>{tabs}</div>
        </div>
      </div>
      {tabs && <nav className={s.bnav}>{tabs}</nav>}
      <main className={s.wrap}>
        {mode.kind === "loading" && <div className={s.empty}>Yuklanmoqda…</div>}
        {mode.kind === "err" && <div className={s.err}>{mode.msg}</div>}
        {mode.kind === "login" && login}
        {app && <SectionBoundary key={sectionKey}>{section}</SectionBoundary>}
      </main>
      {sheets.map((x) => (
        <SheetView key={x.id} node={x.node} closing={x.closing} onBg={onCloseSheet} />
      ))}
      {toastSt && (
        <div
          className={cx(s.toast, toastSt.kind === "err" && s.err)}
          style={{ opacity: toastSt.shown ? 1 : 0 }}
          role={toastSt.kind === "err" ? "alert" : "status"}
        >
          <Icon name={toastSt.kind === "err" ? "x" : "check"} />
          <span>{toastSt.msg}</span>
        </div>
      )}
    </div>
  );
}

/** Tab tugmasi (badge — kutayotganlar soni) */
export function TabButton({ on, title, icon, n, onClick }: { on: boolean; title: string; icon: string; n?: number; onClick: () => void }) {
  return (
    <button className={on ? s.on : ""} title={title} aria-current={on ? "page" : undefined} onClick={onClick}>
      <Icon name={icon} />
      <span>{title}</span>
      {n ? <span className={s.dot}>{n > 99 ? "99+" : n}</span> : null}
    </button>
  );
}
