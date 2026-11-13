// Demo holatini saqlash: modul o'z localStorage kaliti bilan (CRM — crm.demo.v1, Marketplace — mk.demo.v1), versiyali.
// Har o'qish/yozish try/catch ichida; storage ishlamasa (maxfiy oyna, bloklangan, kvota) — xotirada davom etadi.

export type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

export type Store<T> = { load(seed: () => T): T; save(v: T): void; clear(): void };

export function makeStore<T extends { v: number }>(kv: KV | null, version: number, key: string): Store<T> {
  let mem: string | null = null; // storage ishlamasa — shu yerda
  const read = (): string | null => {
    if (kv) {
      try {
        return kv.getItem(key);
      } catch {
        /* xotiraga */
      }
    }
    return mem;
  };
  const write = (s: string) => {
    mem = s;
    if (kv) {
      try {
        kv.setItem(key, s);
      } catch {
        /* xotirada qoladi */
      }
    }
  };
  return {
    load(seed) {
      const raw = read();
      if (raw) {
        try {
          const v = JSON.parse(raw) as T;
          if (v && v.v === version) return v;
        } catch {
          /* buzilgan — qaytadan */
        }
      }
      const fresh = seed();
      write(JSON.stringify(fresh));
      return fresh;
    },
    save(v) {
      write(JSON.stringify(v));
    },
    clear() {
      mem = null;
      if (kv) {
        try {
          kv.removeItem(key);
        } catch {
          /* e'tiborsiz */
        }
      }
    },
  };
}
