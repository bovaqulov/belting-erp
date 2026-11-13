// Accounting bosh sahifasi — ERP bosh sahifasi ko'rinishida (egasi talabi): sarlavha (logo, "Accounting", ERP'ga
// qaytish), 3 ta qism kartochkasi, chap menyusiz. Har birida jonli holat — rahbar bir qarashda ko'rsin: tovarlar soni,
// e'tibor talab qiladigan shartnomalar (imzosiz / muddati tugayapti / o'tgan), joriy oy maoshi holati.
import type { CSSProperties, ReactNode } from "react";

import { useLoad } from "@/erp/kit/ui";
import s from "@/shared/ui/panel/panel.module.css";
import { Icon } from "@/shared/ui/panel/ui";
import g from "@/shared/ui/tiles/tiles.module.css";
import { api } from "@/erp/finance/api";
import { useAcc } from "@/erp/finance/context";
import {
  AREAS,
  firstOf,
  monthLabel,
  monthOf,
  MSTATE,
  type Area,
  type Contract,
  type ItemRow,
  type Month,
} from "@/erp/finance/lib";

import { ART } from "./art";

type Stat = { text: string; hot?: boolean };

export function Hub({ demo }: { demo?: ReactNode }) {
  const { go, admin } = useAcc();
  const st = useLoad(async () => {
    const cur = monthOf(new Date().toISOString());
    const [items, att, month] = await Promise.all([
      api<ItemRow[]>("/app/api/erp/cat/items").catch(() => null),
      api<Contract[]>("/app/api/erp/contracts?state=attention").catch(
        () => null,
      ),
      admin
        ? api<Month>(`/app/api/erp/payroll/${cur}`).catch(() => null)
        : Promise.resolve(null),
    ]);
    const s: Partial<Record<Area, Stat>> = {};
    if (items)
      s.products = {
        text: `${items.length}${items.length >= 200 ? "+" : ""} tovar`,
      };
    if (att)
      s.contracts = att.length
        ? { text: `${att.length} tasi e'tibor talab qiladi`, hot: true }
        : { text: "Hammasi tartibda" };
    if (month)
      s.payroll = {
        text: `${monthLabel(month.month)}: ${MSTATE[month.state].toLowerCase()}`,
        hot: month.state === "none" || month.state === "draft",
      };
    return s;
  }, [admin]);
  return (
    <>
      {demo}
      <div className={s.top}>
        <div className={s.wrap}>
          <div className={s.bar}>
            <div className={s.ttl}>
              <h1>
                <span className={s.brand} aria-hidden="true" />
                <span className={s.sr}>Belting ERP</span>
              </h1>
              <p>Accounting</p>
            </div>
            <div className={s.sp} />
            <a
              className={s["icon-btn"]}
              href="/app/erp"
              title="ERP"
              aria-label="ERP"
            >
              <Icon name="layout-grid" />
            </a>
          </div>
        </div>
      </div>
      <main className={s.wrap}>
        <nav className={g.grid} aria-label="Accounting qismlari">
          {AREAS.map((a) => {
            const Art = ART[a.key];
            const stat = st.data?.[a.key];
            return (
              <a
                key={a.key}
                className={g.card}
                href={`?a=${a.key}`}
                style={{ "--c": a.color } as CSSProperties}
                onClick={(e) => {
                  e.preventDefault();
                  go(firstOf(a.key));
                }}
              >
                <div className={g.art}>
                  <Art />
                </div>
                <div className={g.body}>
                  <div className={g.title}>
                    <span>{a.t}</span>
                  </div>
                  <div className={g.sub}>{a.sub}</div>
                  {stat ? (
                    <div className={`acc-stat ${stat.hot ? "hot" : ""}`}>
                      {stat.text}
                    </div>
                  ) : null}
                </div>
              </a>
            );
          })}
        </nav>
      </main>
    </>
  );
}
