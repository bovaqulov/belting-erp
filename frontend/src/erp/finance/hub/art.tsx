// Qism kartochkalari rasmlari (SVG). Rang — currentColor (kartochka rangi), oq qismlar — .paper: mavzuga o'zi moslashadi.
import g from "@/shared/ui/tiles/styles";

const VB = "0 0 160 100";

/** Mahsulotlar — javonda qutilar va tishli remen halqasi */
function Products() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <rect x="20" y="84" width="120" height="4" rx="2" fill="currentColor" opacity=".45" />
      <rect x="26" y="50" width="34" height="34" rx="4" fill="currentColor" opacity=".7" />
      <rect className={g.paper} x="33" y="57" width="20" height="8" rx="2" />
      <rect x="64" y="62" width="26" height="22" rx="4" fill="currentColor" opacity=".4" />
      <rect x="40" y="22" width="26" height="26" rx="4" fill="currentColor" opacity=".5" />
      <ellipse cx="114" cy="60" rx="22" ry="22" fill="none" stroke="currentColor" strokeWidth="7" />
      <ellipse cx="114" cy="60" rx="22" ry="22" fill="none" className={g.paperStroke} strokeWidth="2.5" strokeDasharray="3 4" />
      <circle cx="114" cy="60" r="9" fill="currentColor" opacity=".35" />
    </svg>
  );
}

/** Shartnomalar — hujjat, matn qatorlari, imzo va muhr */
function Contracts() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <rect x="44" y="8" width="62" height="84" rx="6" fill="currentColor" opacity=".25" />
      <rect x="38" y="12" width="62" height="84" rx="6" fill="currentColor" />
      <rect className={g.paper} x="47" y="22" width="44" height="5" rx="2.5" />
      <rect className={g.paper} x="47" y="33" width="36" height="4" rx="2" opacity=".85" />
      <rect className={g.paper} x="47" y="42" width="40" height="4" rx="2" opacity=".85" />
      <rect className={g.paper} x="47" y="51" width="30" height="4" rx="2" opacity=".85" />
      <path className={g.paperStroke} d="M48 78 c6 -10 10 6 16 -2 s8 -6 12 2" fill="none" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="114" cy="72" r="16" fill="currentColor" opacity=".6" />
      <circle className={g.paperStroke} cx="114" cy="72" r="10" fill="none" strokeWidth="2.5" />
      <path className={g.paperStroke} d="M109 72 l4 4 l7 -8" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Maoshlar — kalendar varag'i va pul kupyuralari */
function Payroll() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <rect x="26" y="16" width="56" height="60" rx="6" fill="currentColor" opacity=".35" />
      <rect x="26" y="16" width="56" height="16" rx="6" fill="currentColor" opacity=".8" />
      <rect x="36" y="10" width="5" height="12" rx="2.5" fill="currentColor" />
      <rect x="67" y="10" width="5" height="12" rx="2.5" fill="currentColor" />
      {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} className={g.paper} x={33 + c * 12} y={39 + r * 11} width="7" height="6" rx="1.5" opacity=".9" />))}
      <rect x="70" y="48" width="66" height="34" rx="5" fill="currentColor" opacity=".55" transform="rotate(-8 103 65)" />
      <rect x="74" y="56" width="66" height="34" rx="5" fill="currentColor" />
      <circle className={g.paper} cx="107" cy="73" r="9" />
      <rect className={g.paper} x="80" y="62" width="10" height="4" rx="2" opacity=".8" />
      <rect className={g.paper} x="124" y="80" width="10" height="4" rx="2" opacity=".8" />
    </svg>
  );
}

export const ART = { products: Products, contracts: Contracts, payroll: Payroll };
