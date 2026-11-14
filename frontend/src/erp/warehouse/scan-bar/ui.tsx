// Skaner maydoni va natija xabari (faqat ko'rinish). Kamera tugmasi — faqat Telegram ichida (kompyuterda — USB skaner).
import type { RefObject } from "react";

import { Icon } from "@/erp/kit/ui";

/** act — xabar yonidagi tugma (masalan, yangi stiker PDF) */
export type MsgAct = { label: string; icon?: string; onClick: () => void };
export type Msg = { ok: boolean | null; title: string; sub?: string; act?: MsgAct } | null;

// uzoqdan ko'rinadigan katta xabar: yashil — to'g'ri, qizil — xato (kattaroq)
const MSG = "mx-4 mt-2.5 mb-2 flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-[17px] font-semibold leading-[1.3] [overflow-wrap:anywhere] [&>svg.i]:size-[26px] [&>svg.i]:flex-none";
const MSG_OK = "bg-[color-mix(in_srgb,var(--st-done)_16%,var(--page))] text-st-done";
const MSG_BAD = "bg-[color-mix(in_srgb,var(--st-bad)_16%,var(--page))] text-st-bad text-[19px]";

export const ScanMsg = ({ msg }: { msg: Msg }) =>
  msg ? (
    <div className={`${MSG} ${msg.ok === null ? "bg-sec" : msg.ok ? MSG_OK : MSG_BAD}`} role={msg.ok === false ? "alert" : "status"}>
      {msg.ok === null ? null : <Icon n={msg.ok ? "check" : "alert"} />}
      <div className="min-w-0 flex-1">
        {msg.title}
        {msg.sub ? <small className="mt-0.5 block text-[13px] font-medium text-sub">{msg.sub}</small> : null}
      </div>
      {msg.act ? (
        <span className="flex flex-none gap-1.5">
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
      <div className={`scanbar ${busy ? "[&_input]:opacity-55" : ""}`}>
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
