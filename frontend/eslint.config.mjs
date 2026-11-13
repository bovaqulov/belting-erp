import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ---------------------------------------------------------------- arxitektura qoidalari (ARCHITECTURE.md)
// Bog'liqlik yo'nalishi: shared ← domenlar ← app. Domen boshqa domenni import qilmaydi; ERP modullari bir-birini
// import qilmaydi (umumiy — erp/kit). Qism tashqariga faqat papkasi (index) orqali: "@/…/qism/ui" — taqiq.
// Flat config'da bir faylga oxirgi mos `no-restricted-imports` qo'llanadi, shuning uchun har blok to'liq ro'yxat oladi.
const DOMAINS = ["home", "ai", "erp", "conveyor", "geomap", "analytics"];
const ERP_MODULES = ["kit", "home", "crm", "workshop", "warehouse", "picking", "purchasing", "sales", "finance", "logistics", "marketplace"];

const base = [
  { regex: "^\\.\\./", message: "`../` ishlatilmaydi: boshqa papkadan — `@/…`, bir papka ichida — `./…`." },
  {
    // qismning ko'rinish fayliga to'g'ridan-to'g'ri murojaat (UI to'plamlari — erp/kit/ui, shared/ui/** — mustasno)
    regex: "^@/(?!erp/kit/ui$|shared/).+/ui$",
    message: "Qism faqat papkasi orqali import qilinadi (index.tsx). Kerakli ko'rinish komponentini index.tsx qayta eksport qilsin.",
  },
];
const banDomains = (allowed, why) =>
  DOMAINS.filter((d) => !allowed.includes(d)).map((d) => ({ regex: `^@/${d}(/|$)`, message: why }));
const rule = (patterns) => ({ "no-restricted-imports": ["error", { patterns }] });

const boundaries = [
  { files: ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"], rules: rule(base) },
  { files: ["src/shared/**/*.{ts,tsx}"], rules: rule([...base, ...banDomains([], "shared hech qaysi domenni import qilmaydi.")]) },
  // home → ai/shell: ma'lum qarz (LoginView, Me) — keyinroq shared/auth ga o'tadi
  {
    files: ["src/home/**/*.{ts,tsx}"],
    rules: rule([
      ...base,
      ...banDomains(["home", "ai"], "Domen boshqa domenni import qilmaydi."),
      { regex: "^@/ai/(?!shell(/|$))", message: "home → ai faqat @/ai/shell (ma'lum qarz)." },
    ]),
  },
  ...["ai", "conveyor", "geomap", "analytics"].map((d) => ({
    files: [`src/${d}/**/*.{ts,tsx}`],
    rules: rule([...base, ...banDomains([d], "Domen boshqa domenni import qilmaydi (umumiy narsa — shared).")]),
  })),
  ...ERP_MODULES.map((m) => ({
    files: [`src/erp/${m}/**/*.{ts,tsx}`],
    rules: rule([
      ...base,
      ...banDomains(["erp"], "Domen boshqa domenni import qilmaydi (umumiy narsa — shared)."),
      {
        regex: `^@/erp/(?!kit(/|$)|${m}(/|$))`,
        message: "ERP modullari bir-birini import qilmaydi; umumiy narsa — erp/kit.",
      },
    ]),
  })),
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...boundaries,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "releases/**",
    "current/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
