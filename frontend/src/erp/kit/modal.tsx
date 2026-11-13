"use client";
// Markaziy oyna (kompyuter) / pastdan oyna (telefon) va Promise bilan tanlov/so'rov — erp_crm.html modal()/choose().
// Escape va fon bosilsa yopiladi; "Saqlash" onOk false qaytarsa — oyna ochiq qoladi; xato → toast.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { toast } from "./env";
import { Icon } from "./ui";

import "./kit.css";

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
    const t = setTimeout(() => box.current?.querySelector<HTMLElement>(".mb input:not([type=checkbox]),.mb textarea,.mb select,.mb .opt")?.focus(), 30);
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
    <div className="mdl" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={hid} ref={box}>
        <div className="mh">
          <span id={hid}>{title}</span>
          <button type="button" className="x" onClick={onClose} aria-label="Yopish">
            <Icon n="x" />
          </button>
        </div>
        <div
          className="mb"
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
          <div className="mf">
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
