// Bo'lim kartochkalari rasmlari (SVG). Rang — `currentColor` (kartochka rangi), oq qog'oz qismlari — `.paper` (--sec):
// yorug'/qorong'i rejim va Telegram mavzusida o'zi moslashadi. Bezak emas — bo'lim nima ekanini bir qarashda aytadi.
import s from "@/shared/ui/tiles/styles";

const VB = "0 0 160 100";

/** ERP — ombor stellaji: javonlarda har xil qutilar va rulon. */
function Erp() {
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

/** LentaCUD — konveyer lentasi: barabanlar, lenta, ustida yuk, pastida o'lcham chizig'i. */
function Lenta() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <rect x="18" y="38" width="124" height="28" rx="14" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="32" cy="52" r="9" fill="currentColor" opacity=".55" />
      <circle cx="128" cy="52" r="9" fill="currentColor" opacity=".55" />
      <circle className={s.paper} cx="32" cy="52" r="3" />
      <circle className={s.paper} cx="128" cy="52" r="3" />
      <circle cx="64" cy="52" r="3" fill="currentColor" opacity=".35" />
      <circle cx="96" cy="52" r="3" fill="currentColor" opacity=".35" />
      <rect x="44" y="18" width="22" height="18" rx="3" fill="currentColor" opacity=".7" />
      <rect x="84" y="22" width="28" height="14" rx="3" fill="currentColor" opacity=".4" />
      <g stroke="currentColor" strokeWidth="2" opacity=".6">
        <path d="M18 82 H142" />
        <path d="M18 76 V88 M142 76 V88" />
      </g>
      <rect className={s.paper} x="64" y="76" width="32" height="12" rx="3" />
      <rect x="69" y="80" width="22" height="4" rx="2" fill="currentColor" opacity=".6" />
    </svg>
  );
}

/** GeoMaps — buklangan xarita, marshrut va mijoz nuqtasi. */
function Geo() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <path d="M24 22 L60 14 L100 24 L136 16 V80 L100 88 L60 78 L24 86 Z" fill="currentColor" opacity=".18" />
      <path d="M60 14 V78 L100 88 V24 Z" fill="currentColor" opacity=".22" />
      <path d="M24 22 L60 14 L100 24 L136 16 V80 L100 88 L60 78 L24 86 Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M38 70 C52 60 56 44 74 46 S96 58 108 40" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="5 5" strokeLinecap="round" />
      <circle cx="38" cy="70" r="4.5" fill="currentColor" />
      <path d="M110 46 C102 36 98 31 98 25 A12 12 0 0 1 122 25 C122 31 118 36 110 46 Z" fill="currentColor" />
      <circle className={s.paper} cx="110" cy="25" r="4.5" />
    </svg>
  );
}

/** Analitika — o'suvchi ustunlar va trend chizig'i. */
function Analytics() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <path d="M26 86 H138" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".45" />
      <rect x="34" y="62" width="16" height="22" rx="3" fill="currentColor" opacity=".35" />
      <rect x="58" y="50" width="16" height="34" rx="3" fill="currentColor" opacity=".5" />
      <rect x="82" y="56" width="16" height="28" rx="3" fill="currentColor" opacity=".4" />
      <rect x="106" y="34" width="16" height="50" rx="3" fill="currentColor" opacity=".7" />
      <path d="M42 46 L66 32 L90 38 L114 16" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {[[42, 46], [66, 32], [90, 38]].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="4.5" fill="currentColor" />
      ))}
      <circle cx="114" cy="16" r="6" fill="currentColor" />
      <circle className={s.paper} cx="114" cy="16" r="2.5" />
    </svg>
  );
}

/** Jarvis — bot va suhbat pufakchalari. */
function Jarvis() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <path d="M78 12 V20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="78" cy="10" r="4" fill="currentColor" />
      <rect x="52" y="20" width="52" height="40" rx="12" fill="currentColor" opacity=".75" />
      <circle className={s.paper} cx="68" cy="40" r="5" />
      <circle className={s.paper} cx="88" cy="40" r="5" />
      <rect className={s.paper} x="70" y="50" width="16" height="3.5" rx="1.75" />
      <rect x="18" y="56" width="40" height="22" rx="8" fill="currentColor" opacity=".35" />
      <path d="M30 78 L26 88 L40 78 Z" fill="currentColor" opacity=".35" />
      <rect x="26" y="63" width="24" height="3.5" rx="1.75" className={s.paper} />
      <rect x="26" y="69" width="16" height="3.5" rx="1.75" className={s.paper} />
      <rect x="100" y="64" width="42" height="22" rx="8" fill="currentColor" opacity=".5" />
      <path d="M128 86 L134 94 L120 86 Z" fill="currentColor" opacity=".5" />
      <rect x="108" y="71" width="26" height="3.5" rx="1.75" className={s.paper} />
      <rect x="108" y="77" width="18" height="3.5" rx="1.75" className={s.paper} />
    </svg>
  );
}

/** Xodimlar — tuzilma: rahbar va ikki xodim, bog'lovchi chiziqlar. */
function Staff() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <path d="M80 44 V54 M44 54 H116 M44 54 V62 M116 54 V62" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".45" />
      <circle cx="80" cy="20" r="10" fill="currentColor" />
      <path d="M62 44 A18 13 0 0 1 98 44 Z" fill="currentColor" />
      <circle cx="44" cy="72" r="8" fill="currentColor" opacity=".55" />
      <path d="M30 92 A14 11 0 0 1 58 92 Z" fill="currentColor" opacity=".55" />
      <circle cx="116" cy="72" r="8" fill="currentColor" opacity=".55" />
      <path d="M102 92 A14 11 0 0 1 130 92 Z" fill="currentColor" opacity=".55" />
      <circle cx="96" cy="14" r="6" fill="currentColor" opacity=".35" />
      <path d="M93 14 L95.5 16.5 L99.5 11.5" fill="none" className={s.paperStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Shablonlar — hisobot varag'i: maydonlar, belgilangan qatorlar, tasdiq muhri. */
function Templates() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <rect x="42" y="10" width="60" height="80" rx="6" fill="currentColor" opacity=".3" />
      <rect x="50" y="6" width="60" height="80" rx="6" fill="currentColor" opacity=".85" />
      <rect className={s.paper} x="56" y="14" width="48" height="66" rx="3" />
      <rect x="62" y="21" width="26" height="4" rx="2" fill="currentColor" />
      {[34, 46, 58].map((y) => (
        <g key={y}>
          <rect x="62" y={y} width="7" height="7" rx="1.5" fill="currentColor" opacity=".6" />
          <rect x="73" y={y + 1.5} width="24" height="4" rx="2" fill="currentColor" opacity=".35" />
        </g>
      ))}
      <rect x="62" y="70" width="18" height="4" rx="2" fill="currentColor" opacity=".35" />
      <circle cx="112" cy="70" r="13" fill="currentColor" />
      <path d="M106 70 L110.5 74.5 L118.5 65.5" fill="none" className={s.paperStroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Development — terminal oynasi va graf tugunlari. */
function Dev() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <rect x="16" y="14" width="96" height="70" rx="8" fill="currentColor" opacity=".8" />
      <rect className={s.paper} x="20" y="26" width="88" height="54" rx="4" />
      <circle cx="25" cy="20" r="2.2" className={s.paper} />
      <circle cx="32" cy="20" r="2.2" className={s.paper} />
      <circle cx="39" cy="20" r="2.2" className={s.paper} />
      <path d="M28 38 L35 43 L28 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="40" y="41" width="30" height="4" rx="2" fill="currentColor" opacity=".6" />
      <rect x="28" y="54" width="52" height="4" rx="2" fill="currentColor" opacity=".35" />
      <rect x="28" y="64" width="38" height="4" rx="2" fill="currentColor" opacity=".35" />
      <g stroke="currentColor" strokeWidth="2.5" opacity=".55">
        <path d="M126 30 L142 52 L122 72 Z" fill="none" />
      </g>
      <circle cx="126" cy="30" r="6" fill="currentColor" />
      <circle cx="142" cy="52" r="6" fill="currentColor" opacity=".7" />
      <circle cx="122" cy="72" r="6" fill="currentColor" opacity=".5" />
    </svg>
  );
}

/** TG CRM — yozishma: kiruvchi va chiquvchi xabar pufakchalari, yonida mijoz kartasi (teg bilan). */
function TgCrm() {
  return (
    <svg viewBox={VB} aria-hidden="true">
      <path d="M18 20 h62 a8 8 0 0 1 8 8 v14 a8 8 0 0 1 -8 8 H30 l-10 8 v-8 a8 8 0 0 1 -2 -5 V28 a8 8 0 0 1 8 -8 Z" fill="currentColor" opacity=".3" />
      <rect className={s.paper} x="28" y="29" width="44" height="5" rx="2.5" />
      <rect className={s.paper} x="28" y="38" width="30" height="5" rx="2.5" />
      <path d="M40 62 h58 a8 8 0 0 1 8 8 v8 l8 8 h-14 H48 a8 8 0 0 1 -8 -8 v-8 a8 8 0 0 1 8 -8 Z" fill="currentColor" opacity=".75" />
      <rect className={s.paper} x="50" y="71" width="40" height="5" rx="2.5" />
      <rect className={s.paper} x="110" y="18" width="34" height="46" rx="5" />
      <rect x="110" y="18" width="34" height="46" rx="5" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="127" cy="32" r="6" fill="currentColor" opacity=".6" />
      <rect x="117" y="43" width="20" height="4" rx="2" fill="currentColor" opacity=".45" />
      <rect x="119" y="51" width="16" height="7" rx="3.5" fill="currentColor" opacity=".8" />
    </svg>
  );
}

export const ART: Record<string, () => React.JSX.Element> = {
  erp: Erp,
  lenta: Lenta,
  geo: Geo,
  tgcrm: TgCrm,
  analytics: Analytics,
  staff: Staff,
  templates: Templates,
  jarvis: Jarvis,
  dev: Dev,
};
