// CRM demo ombori: o'z localStorage kaliti (ombor mantig'i — @/shared/demo).
import { makeStore as kitStore, type KV, type Store } from "@/shared/demo";

export type { KV };
export const DEMO_KEY = "crm.demo.v1";

export const makeStore = <T extends { v: number }>(kv: KV | null, version: number): Store<T> => kitStore<T>(kv, version, DEMO_KEY);
