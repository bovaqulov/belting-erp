"use client";
// Skaner asosi: bitta doim fokusdagi maydon; USB/Bluetooth skaner klaviatura kabi yozadi (Enter bilan tugaydi). Skanlar
// navbat bilan ishlanadi — server javobini kutayotganda keyingi skan yo'qolmaydi va tartib buzilmaydi. Natija — katta
// xabar (yashil/qizil) + ovoz. Sahifaning istalgan joyida yozilsa (oyna ochiq bo'lmasa) maydon o'zi fokus oladi.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { beep, etg, scanQR } from "@/erp/kit/env";

import { ScanBarView, type Msg, type MsgAct } from "./ui";

export type { Msg, MsgAct };
export type Scanner = {
  busy: boolean;
  msg: Msg;
  say: (ok: boolean | null, title: string, sub?: string, act?: MsgAct) => void;
  clear: () => void;
  submit: (code: string) => void;
  inp: React.RefObject<HTMLInputElement | null>;
};

export function useScanner(handler: (code: string) => Promise<void>): Scanner {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const inp = useRef<HTMLInputElement>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const fn = useRef(handler);
  useLayoutEffect(() => {
    fn.current = handler;
  });
  const say = useCallback((ok: boolean | null, title: string, sub?: string, act?: MsgAct) => setMsg({ ok, title, sub, act }), []);
  const clear = useCallback(() => setMsg(null), []);
  const submit = useCallback((code: string) => {
    setBusy(true);
    chain.current = chain.current
      .then(() => fn.current(code))
      .catch((e: unknown) => {
        beep(false);
        setMsg({ ok: false, title: (e as Error).message || String(e) });
      })
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    if (!etg()) setTimeout(() => inp.current?.focus(), 50);
    const key = (e: KeyboardEvent) => {
      const a = document.activeElement?.tagName ?? "";
      if (["INPUT", "TEXTAREA", "SELECT"].includes(a) || e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector(".mdl, .sheet.on")) return;
      inp.current?.focus();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  return { busy, msg, say, clear, submit, inp };
}

export function ScanBar({ sc, ph }: { sc: Scanner; ph: string }) {
  return <ScanBarView inpRef={sc.inp} ph={ph} busy={sc.busy} msg={sc.msg} cam={!!etg()} onCode={sc.submit} onCamera={() => scanQR((v) => sc.submit(v))} />;
}

/** Skan natijasi xabari alohida (masalan, skaner maydonidan uzoqroqda) */
export { ScanMsg } from "./ui";
