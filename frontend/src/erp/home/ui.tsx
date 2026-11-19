// ERP bosh sahifasi (faqat ko'rinish): sarlavha (logo, bo'limlarga qaytish), modul kartochkalari; ko'chirilmagan
// modul — "Tez orada" (bosilmaydi).
import type { CSSProperties } from "react";

import s from "@/shared/ui/panel/styles";
import { Icon } from "@/shared/ui/panel/ui";
import g from "@/shared/ui/tiles/styles";

import { ERP_ART } from "./art";

export interface Module {
  key: string;
  title: string;
  sub: string;
  color: string;
  /** null — hali ko'chirilmagan */
  href: string | null;
}

export const MODULES: Module[] = [
  { key: "crm", title: "CRM", sub: "Mijozlar, voronkalar, bitimlar va vazifalar", color: "#d4537e", href: "/app/erp/crm" },
  { key: "warehouse", title: "Warehouse", sub: "Qoldiq, kirim-chiqim, joylash va sanash", color: "#3e88f7", href: "/app/erp/ombor" },
  { key: "manufacturing", title: "Manufacturing", sub: "Kesish sexi: zakazlar, taxta, lenta sarfi", color: "#e8961f", href: "/app/erp/sex" },
  { key: "marketplace", title: "Marketplace", sub: "WB, Ozon, Uzum: buyurtmalar, tovarlar, narx, qoldiq", color: "#f0603a", href: "/app/erp/marketplace" },
  { key: "logistics", title: "Logistics", sub: "Yetkazish: EMU, Yandex Go, Bito, Fargo", color: "#12a4a0", href: "/app/erp/logistics" },
  { key: "accounting", title: "Accounting", sub: "Mahsulotlar, shartnomalar va maoshlar", color: "#2fa37a", href: "/app/erp/moliya" },
  { key: "hr", title: "HR", sub: "Xodimlar: taklif qilish, tuzilma (iyerarxiya) va rollar", color: "#8b6cf0", href: "/app/erp/staff" },
];

export function ErpHomeView({ modules, loading = false }: { modules: Module[]; loading?: boolean }) {
  return (
    <div data-panel="" className="contents">
      <div className={s.top}>
        <div className={s.wrap}>
          <div className={s.bar}>
            <div className={s.ttl}>
              <h1>
                <span className={s.brand} aria-hidden="true" />
                <span className={s.sr}>Belting ERP</span>
              </h1>
              <p>ERP</p>
            </div>
            <div className={s.sp} />
            <a className={s["icon-btn"]} href="/app" title="Bo'limlar" aria-label="Bo'limlar">
              <Icon name="layout-grid" />
            </a>
          </div>
        </div>
      </div>
      <main className={s.wrap}>
        <nav className={g.grid} aria-label="ERP modullari">
          {modules.map((m) => {
            const Art = ERP_ART[m.key];
            const style = { "--c": m.color } as CSSProperties;
            const inner = (
              <>
                <div className={g.art}>
                  {Art && <Art />}
                  {!m.href && <span className={g.badge}>Tez orada</span>}
                </div>
                <div className={g.body}>
                  <div className={g.title}>
                    <span>{m.title}</span>
                  </div>
                  <div className={g.sub}>{m.sub}</div>
                </div>
              </>
            );
            return m.href ? (
              <a key={m.key} className={g.card} href={m.href} style={style}>
                {inner}
              </a>
            ) : (
              <div key={m.key} className={`${g.card} ${g.soon}`} style={style} aria-disabled="true">
                {inner}
              </div>
            );
          })}
        </nav>
        {!loading && !modules.length ? (
          <div className={s.empty}>Sizga hali ERP bo&apos;limi biriktirilmagan — administratorga murojaat qiling.</div>
        ) : null}
      </main>
    </div>
  );
}
