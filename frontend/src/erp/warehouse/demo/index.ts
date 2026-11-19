// Demo ombor backend (brauzer ichida): boshlang'ich ma'lumotlar, so'rovlarni bajarish. Rejim va saqlash — @/shared/demo.
export { DB_VERSION, seed, type Db } from "./seed.lib";
export { handle } from "./server.lib";

/** Ishga tushishda tekshiriladigan so'rovlar: ikkalasi javob bersa — haqiqiy backend */
export const PROBE_PATHS = ["/app/api/erp/me", "/app/api/erp/stock/dashboard"] as const;
export const DEMO_KEY = "wh.demo.v1";
/** Demo belgisida ko'rsatiladigan sinov kodlari (skaner maydoniga yozib Enter) */
export const DEMO_CODES = "P00000101 (rulon), A-1-01-1 (javon), 4780100000042 (remen), 00123 (1C kodi)";
