// ERP modul kartochkalari rasmlari (SVG). Rang — `currentColor` (kartochka rangi), oq qog'oz qismlari — `.paper` (--sec).
import s from "@/shared/ui/tiles/styles";

const VB = "0 0 160 100";

/** CRM — voronka: tepada mijozlar, pastda bitim. */
function Crm() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <circle cx="52" cy="16" r="7" fill="currentColor" opacity=".45" />
      <circle cx="80" cy="13" r="7" fill="currentColor" opacity=".7" />
      <circle cx="108" cy="16" r="7" fill="currentColor" opacity=".45" />
      <path d="M34 30 H126 L92 62 V84 L68 92 V62 Z" fill="currentColor" opacity=".7" />
      <rect className={s.paper} x="56" y="37" width="48" height="6" rx="3" />
      <rect className={s.paper} x="66" y="50" width="28" height="5" rx="2.5" />
      <circle cx="118" cy="80" r="12" fill="currentColor" />
      <path className={s.paperStroke} d="M112 80 l4 4 l8 -9" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Warehouse — ombor stellaji: javonlarda qutilar va rulon. */
function Warehouse() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <rect x="22" y="14" width="5" height="78" rx="2" fill="currentColor" />
      <rect x="133" y="14" width="5" height="78" rx="2" fill="currentColor" />
      <rect x="22" y="48" width="116" height="4" rx="2" fill="currentColor" />
      <rect x="22" y="86" width="116" height="4" rx="2" fill="currentColor" />
      <rect x="22" y="14" width="116" height="4" rx="2" fill="currentColor" opacity=".45" />
      <rect x="33" y="26" width="26" height="22" rx="3" fill="currentColor" opacity=".55" />
      <rect x="62" y="32" width="20" height="16" rx="3" fill="currentColor" opacity=".35" />
      <rect className={s.paper} x="39" y="33" width="14" height="7" rx="1.5" />
      <circle cx="106" cy="37" r="11" fill="currentColor" opacity=".7" />
      <circle className={s.paper} cx="106" cy="37" r="4" />
      <rect x="33" y="64" width="34" height="22" rx="3" fill="currentColor" opacity=".35" />
      <rect x="70" y="58" width="24" height="28" rx="3" fill="currentColor" opacity=".7" />
      <rect className={s.paper} x="75" y="65" width="14" height="7" rx="1.5" />
      <rect x="98" y="70" width="30" height="16" rx="3" fill="currentColor" opacity=".5" />
    </svg>
  );
}

/** Manufacturing — kesish sexi: lenta rulondan chiqadi, pichoq kesadi, kesilgan bo'lak. */
function Manufacturing() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <circle cx="42" cy="50" r="28" fill="currentColor" opacity=".7" />
      <circle cx="42" cy="50" r="19" fill="currentColor" opacity=".45" />
      <circle className={s.paper} cx="42" cy="50" r="8" />
      <rect x="42" y="72" width="62" height="6" fill="currentColor" opacity=".7" />
      <rect x="112" y="72" width="34" height="6" rx="1" fill="currentColor" opacity=".45" />
      <path d="M100 18 H116 V54 L108 66 L100 54 Z" fill="currentColor" />
      <rect className={s.paper} x="104" y="24" width="8" height="18" rx="2" />
      <rect x="18" y="86" width="128" height="4" rx="2" fill="currentColor" opacity=".35" />
    </svg>
  );
}

/** Accounting — kalkulyator va hisob varag'i. */
function Accounting() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <rect x="92" y="18" width="46" height="66" rx="4" fill="currentColor" opacity=".35" />
      <rect className={s.paper} x="99" y="28" width="32" height="4" rx="2" />
      <rect className={s.paper} x="99" y="38" width="24" height="4" rx="2" />
      <rect className={s.paper} x="99" y="48" width="28" height="4" rx="2" />
      <rect className={s.paper} x="99" y="58" width="20" height="4" rx="2" />
      <rect x="28" y="12" width="56" height="78" rx="7" fill="currentColor" />
      <rect className={s.paper} x="36" y="21" width="40" height="16" rx="3" />
      <rect x="58" y="26" width="14" height="6" rx="2" fill="currentColor" opacity=".7" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => <rect key={`${r}${c}`} className={s.paper} x={36 + c * 14} y={45 + r * 14} width="10" height="10" rx="2.5" opacity=".85" />),
      )}
    </svg>
  );
}

/** Logistics — yuk mashinasi: kuzovda qutilar, harakat chiziqlari. */
function Logistics() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".4">
        <path d="M10 40 H24 M6 52 H22 M12 64 H24" />
      </g>
      <rect x="30" y="24" width="72" height="50" rx="5" fill="currentColor" opacity=".7" />
      <rect className={s.paper} x="40" y="34" width="22" height="16" rx="2" />
      <rect className={s.paper} x="68" y="34" width="24" height="16" rx="2" opacity=".75" />
      <path d="M102 40 H124 L140 58 V74 H102 Z" fill="currentColor" />
      <path className={s.paper} d="M108 46 H122 L132 58 H108 Z" />
      <circle cx="52" cy="78" r="10" fill="currentColor" />
      <circle cx="120" cy="78" r="10" fill="currentColor" />
      <circle className={s.paper} cx="52" cy="78" r="4" />
      <circle className={s.paper} cx="120" cy="78" r="4" />
    </svg>
  );
}

/** Marketplace — savdo savati, ichida qutilar, ustida narx yorlig'i. */
function Marketplace() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <path d="M20 20 H36 L48 70 H122 L134 34 H42" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="54" y="40" width="26" height="24" rx="3" fill="currentColor" opacity=".55" />
      <rect className={s.paper} x="60" y="46" width="14" height="6" rx="1.5" />
      <rect x="84" y="46" width="30" height="18" rx="3" fill="currentColor" opacity=".35" />
      <circle cx="58" cy="84" r="7" fill="currentColor" opacity=".7" />
      <circle cx="112" cy="84" r="7" fill="currentColor" opacity=".7" />
      <circle className={s.paper} cx="58" cy="84" r="2.5" />
      <circle className={s.paper} cx="112" cy="84" r="2.5" />
      <path d="M110 8 H136 V26 L123 34 L110 26 Z" fill="currentColor" />
      <circle className={s.paper} cx="123" cy="16" r="3.5" />
    </svg>
  );
}

export const ERP_ART: Record<string, () => React.JSX.Element> = {
  crm: Crm,
  warehouse: Warehouse,
  manufacturing: Manufacturing,
  accounting: Accounting,
  logistics: Logistics,
  marketplace: Marketplace,
};
