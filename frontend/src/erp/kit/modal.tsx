"use client";
// Markaziy oyna (kompyuter) / pastdan oyna (telefon) va Promise bilan tanlov/so'rov — erp_crm.html modal()/choose().
// Escape va fon bosilsa yopiladi; "Saqlash" onOk false qaytarsa — oyna ochiq qoladi; xato → toast.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { toast } from "./env";
import { Icon } from "./ui";

export function Modal({
  title,
  ok = "Saqlash",
  danger,
  wide,
  onOk,
  onClose,
  children,
}: {
  title: string;
  ok?: string;
  danger?: boolean;
  wide?: boolean;
  onOk?: () => Promise<boolean | void> | boolean | void;
  onClose: () => void;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const hid = useId();
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", key, true);
    const t = setTimeout(() => box.current?.querySelector<HTMLElement>("[data-mb] input:not([type=checkbox]),[data-mb] textarea,[data-mb] select,[data-mb] .opt")?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", key, true);
      clearTimeout(t);
    };
  }, []);
  const run = async () => {
    if (!onOk || busy) return;
    setBusy(true);
    try {
      if ((await onOk()) !== false) closeRef.current();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div
      className="fixed inset-0 z-70 grid place-items-center bg-black/40 p-4 max-[599px]:[place-items:end_stretch] max-[599px]:p-0"
      data-modal=""
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`flex max-h-[min(88vh,88dvh)] w-full flex-col rounded-2xl bg-page shadow-2 max-[599px]:max-h-[92dvh] max-[599px]:rounded-t-[14px] max-[599px]:rounded-b-none ${wide ? "min-[600px]:w-[min(720px,100%)]" : "min-[600px]:w-[min(520px,100%)]"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hid}
        ref={box}
      >
        <div className="flex items-center justify-between gap-2 border-b border-sep py-2.5 pr-2.5 pl-[18px] text-base font-bold">
          <span id={hid}>{title}</span>
          <button
            type="button"
            className="grid min-h-9 min-w-9 cursor-pointer place-items-center rounded-lg border-0 bg-transparent p-1.5 text-hint hover:bg-fill coarse:min-h-11 coarse:min-w-11"
            onClick={onClose}
            aria-label="Yopish"
          >
            <Icon n="x" />
          </button>
        </div>
        <div
          data-mb=""
          className="overflow-y-auto overscroll-contain px-[18px] py-3.5 [&_label.l]:mt-2.5 [&_label.l]:mb-1 [&_label.l]:block [&_label.l]:text-[12.5px] [&_label.l]:text-hint [&_label.l:first-child]:mt-0 [&>.inp]:w-full [&>.sel]:w-full"
          onKeyDown={(e) => {
            if (e.key === "Enter" && onOk && (e.target as HTMLElement).tagName === "INPUT" && (e.target as HTMLInputElement).type !== "checkbox") {
              e.preventDefault();
              void run();
            }
          }}
        >
          {children}
        </div>
        {onOk ? (
          <div className="flex justify-end gap-2 border-t border-sep px-[18px] pt-3 pb-[calc(12px+var(--safe-b))] max-[599px]:[&_.b]:flex-1">
            <button type="button" className="b" onClick={onClose}>
              Bekor
            </button>
            <button type="button" className={`b ${danger ? "danger" : "pri"}`} disabled={busy} onClick={() => void run()}>
              {ok}
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export type Opt<V> = { value: V; label: string; sub?: string; color?: string | null };
type AskOpts = { label?: string; placeholder?: string; multiline?: boolean; ok?: string; value?: string };
type Pending =
  | { k: "choose"; title: string; opts: Opt<unknown>[]; res: (v: unknown) => void }
  | { k: "ask"; title: string; o: AskOpts; res: (v: string | null) => void };

/** Promise bilan tanlov va matn so'rovi: const { node, choose, ask } = useDialogs(); ... {node} ni render qiling. */
export function useDialogs() {
  const [p, setP] = useState<Pending | null>(null);
  const choose = useCallback(
    <V,>(title: string, opts: Opt<V>[]): Promise<V | null> =>
      new Promise((res) => setP({ k: "choose", title, opts: opts as Opt<unknown>[], res: res as (v: unknown) => void })),
    [],
  );
  const ask = useCallback((title: string, o: AskOpts = {}): Promise<string | null> => new Promise((res) => setP({ k: "ask", title, o, res })), []);
  let node: ReactNode = null;
  if (p?.k === "choose")
    node = (
      <Modal
        title={p.title}
        onClose={() => {
          p.res(null);
          setP(null);
        }}
      >
        {p.opts.map((o, i) => (
          <button
            key={i}
            type="button"
            className="opt"
            onClick={() => {
              p.res(o.value);
              setP(null);
            }}
          >
            {o.color ? <span className="dot" style={{ background: o.color }} /> : null}
            <span>
              <span>{o.label}</span>
              {o.sub ? <span className="s" style={{ display: "block" }}>{o.sub}</span> : null}
            </span>
          </button>
        ))}
        {!p.opts.length ? <div className="sf">Tanlov yo&apos;q</div> : null}
      </Modal>
    );
  else if (p?.k === "ask") node = <AskModal p={p} done={() => setP(null)} />;
  return { node, choose, ask };
}

function AskModal({ p, done }: { p: Extract<Pending, { k: "ask" }>; done: () => void }) {
  const [v, setV] = useState(p.o.value ?? "");
  return (
    <Modal
      title={p.title}
      ok={p.o.ok ?? "Saqlash"}
      onClose={() => {
        p.res(null);
        done();
      }}
      onOk={() => {
        p.res(v);
        done();
        return false; // done() oynani o'zi yopdi
      }}
    >
      {p.o.label ? <label className="l">{p.o.label}</label> : null}
      {p.o.multiline ? (
        <textarea className="inp" value={v} placeholder={p.o.placeholder} onChange={(e) => setV(e.target.value)} />
      ) : (
        <input className="inp" value={v} placeholder={p.o.placeholder} onChange={(e) => setV(e.target.value)} />
      )}
    </Modal>
  );
}
