// Demo backend (brauzer ichida): boshlang'ich ma'lumotlar, so'rovlarni bajarish. Rejim va ombor — @/shared/demo.
export { DB_VERSION, seed, type Db } from "./seed.lib";
export { handle } from "./server.lib";

/** Ishga tushishda tekshiriladigan so'rovlar: ikkalasi javob bersa — haqiqiy backend */
export const PROBE_PATHS = ["/app/api/erp/me", "/app/api/erp/cat/groups"] as const;
export const DEMO_KEY = "acc.demo.v1";
