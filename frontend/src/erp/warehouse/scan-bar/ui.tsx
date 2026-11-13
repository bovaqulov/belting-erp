// Skaner maydoni va natija xabari (faqat ko'rinish). Kamera tugmasi — faqat Telegram ichida (kompyuterda — USB skaner).
import type { RefObject } from "react";

import { Icon } from "@/erp/kit/ui";

/** act — xabar yonidagi tugma (masalan, yangi stiker PDF) */
export type MsgAct = { label: string; icon?: string; onClick: () => void };
export type Msg = { ok: boolean | null; title: string; sub?: string; act?: MsgAct } | null;

export const ScanMsg = ({ msg }: { msg: Msg }) =>
  msg ? (
    <div className={`wh-msg ${msg.ok === null ? "" : msg.ok ? "ok" : "bad"}`} role={msg.ok === false ? "alert" : "status"}>
      {msg.ok === null ? null : <Icon n={msg.ok ? "check" : "alert"} />}
      <div className="tx">
        {msg.title}
        {msg.sub ? <small>{msg.sub}</small> : null}
      </div>
      {msg.act ? (
        <span className="sp">
          <button type="button" className="mini pri" onClick={msg.act.onClick}>
            {msg.act.icon ? <Icon n={msg.act.icon} /> : null} {msg.act.label}
          </button>
        </span>
      ) : null}
    </div>
  ) : null;

export function ScanBarView({
  inpRef,
  ph,
  busy,
  msg,
  cam,
  onCode,
  onCamera,
}: {
  inpRef: RefObject<HTMLInputElement | null>;
  ph: string;
  busy: boolean;
  msg: Msg;
  cam: boolean;
  onCode: (code: string) => void;
  onCamera: () => void;
}) {
  return (
    <>
      <div className={`scanbar wh-scan ${busy ? "busy" : ""}`}>
        <div className="search">
          <Icon n="scan" />
          <input
            ref={inpRef}
            placeholder={ph}
            aria-label={ph}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const v = e.currentTarget.value.trim();
              e.currentTarget.value = "";
              if (v) onCode(v);
            }}
          />
        </div>
        {cam ? (
          <button type="button" className="cam" aria-label="Kamera bilan skanerlash" onClick={onCamera}>
            <Icon n="scan" />
          </button>
        ) : null}
      </div>
      <div aria-live="polite">
        <ScanMsg msg={msg} />
      </div>
    </>
  );
}
