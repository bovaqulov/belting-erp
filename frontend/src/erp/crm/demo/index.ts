// Demo backend (brauzer ichida): rejim qarori, boshlang'ich ma'lumotlar, so'rovlarni bajarish, localStorage ombori.
export { decideMode, decideModeAll, PROBE_PATHS, type CrmMode } from "./mode.lib";
export { DB_VERSION, seed, type Db } from "./seed.lib";
export { handle } from "./server.lib";
export { makeStore, type KV } from "./store.lib";
