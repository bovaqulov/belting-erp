// Logistika (faqat ko'rinish): sarlavha (ERP'ga qaytish), yetkazib berish xizmatlari kartochkalari. Ulanmagan xizmat —
// "Tez orada" (bosilmaydi). Kalit (`key`) backend'dagi xizmat kodi bilan bir xil bo'ladi.
import type { CSSProperties } from "react";

import s from "@/shared/ui/panel/panel.module.css";
import { Icon } from "@/shared/ui/panel/ui";
import g from "@/shared/ui/tiles/tiles.module.css";

export interface Carrier {
  key: "emu" | "yandex_go" | "bito" | "fargo";
  title: string;
  color: string;
  /** null — hali ulanmagan */
  href: string | null;
}

export const CARRIERS: Carrier[] = [
  { key: "emu", title: "EMU", color: "#e5484d", href: null },
  { key: "yandex_go", title: "Yandex Go", color: "#e6b422", href: null },
  { key: "bito", title: "Bito", color: "#3e88f7", href: null },
  { key: "fargo", title: "Fargo", color: "#2fa37a", href: null },
];

const VB = "0 0 160 100";

/** Xizmat kartochkasi rasmi: monogramma (bosh harf) va harakat chiziqlari — logotiplar ruxsatsiz ishlatilmaydi. */
function CarrierArt({ title }: { title: string }) {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".4">
        <path d="M18 38 H38 M12 50 H36 M20 62 H38" />
      </g>
      <rect x="46" y="14" width="72" height="72" rx="18" fill="currentColor" />
      <text x="82" y="64" textAnchor="middle" fontSize="38" fontWeight="700" className={g.paper}>
        {title.slice(0, 1)}
      </text>
      <circle cx="128" cy="78" r="6" fill="currentColor" opacity=".5" />
    </svg>
  );
}

export function LogisticsView({ carriers }: { carriers: Carrier[] }) {
  return (
    <>
      <div className={s.top}>
        <div className={s.wrap}>
          <div className={s.bar}>
            <a className={s["icon-btn"]} href="/app/erp" title="ERP" aria-label="ERP">
              <Icon name="layout-grid" />
            </a>
            <div className={s.ttl}>
              <h1>Logistika</h1>
              <p>Yetkazib berish xizmatlari</p>
            </div>
          </div>
        </div>
      </div>
      <main className={s.wrap}>
        <nav className={g.grid} aria-label="Yetkazib berish xizmatlari">
          {carriers.map((c) => {
            const style = { "--c": c.color } as CSSProperties;
            const inner = (
              <>
                <div className={g.art}>
                  <CarrierArt title={c.title} />
                  {!c.href && <span className={g.badge}>Tez orada</span>}
                </div>
                <div className={g.body}>
                  <div className={g.title}>
                    <span>{c.title}</span>
                  </div>
                  <div className={g.sub}>{c.href ? "Jo'natmalar, narx va kuzatuv" : "Integratsiya ulanmagan"}</div>
                </div>
              </>
            );
            return c.href ? (
              <a key={c.key} className={g.card} href={c.href} style={style}>
                {inner}
              </a>
            ) : (
              <div key={c.key} className={`${g.card} ${g.soon}`} style={style} aria-disabled="true">
                {inner}
              </div>
            );
          })}
        </nav>
      </main>
    </>
  );
}
