"use client";
// Skaner asosi: bitta doim fokusdagi maydon; USB/Bluetooth skaner klaviatura kabi yozadi (Enter bilan tugaydi). Skanlar
// navbat bilan ishlanadi — server javobini kutayotganda keyingi skan yo'qolmaydi va tartib buzilmaydi. Natija — katta
// xabar (yashil/qizil) + ovoz. Sahifaning istalgan joyida yozilsa (oyna ochiq bo'lmasa) maydon o'zi fokus oladi.
//   const m = useScanMsg();                       // xabar — skan ishlovchisidan OLDIN (ishlovchi m.say ni chaqiradi)
//   const sc = useScanner(async (code) => {...}, m);
//   <ScanBar sc={sc} ph="…" />
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { beep, etg, scanQR } from "@/erp/kit/env";

import { ScanBarView, type Msg, type MsgAct } from "./ui";

export type { Msg, MsgAct };
export type ScanMsgState = {
  msg: Msg;
  say: (ok: boolean | null, title: string, sub?: string, act?: MsgAct) => void;
  clear: () => void;
};
export type Scanner = ScanMsgState & { busy: boolean; submit: (code: string) => void; inp: React.RefObject<HTMLInputElement | null> };

export function useScanMsg(): ScanMsgState {
  const [msg, setMsg] = useState<Msg>(null);
  const say = useCallback((ok: boolean | null, title: string, sub?: string, act?: MsgAct) => setMsg({ ok, title, sub, act }), []);
  const clear = useCallback(() => setMsg(null), []);
  return { msg, say, clear };
}

export function useScanner(handler: (code: string) => Promise<void>, m: ScanMsgState): Scanner {
  const [busy, setBusy] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const fn = useRef(handler);
  useLayoutEffect(() => {
    fn.current = handler;
  });
  const { say } = m;
  const submit = useCallback(
    (code: string) => {
      setBusy(true);
      chain.current = chain.current
        .then(() => fn.current(code))
        .catch((e: unknown) => {
          beep(false);
          say(false, (e as Error).message || String(e));
        })
        .finally(() => setBusy(false));
    },
    [say],
  );
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
  return { ...m, busy, submit, inp };
}

export function ScanBar({ sc, ph }: { sc: Scanner; ph: string }) {
  return <ScanBarView inpRef={sc.inp} ph={ph} busy={sc.busy} msg={sc.msg} cam={!!etg()} onCode={sc.submit} onCamera={() => scanQR((v) => sc.submit(v))} />;
}

/** Skan natijasi xabari alohida (masalan, skaner maydonidan uzoqroqda) */
export { ScanMsg } from "./ui";
