// Jarvis chat — Telegram uslubidagi pufakchalar, Tailwind utility sinflari. Telefonda yozish maydoni pastki tab-panel ustida.
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const c = {
  wrap: "flex min-h-[calc(100dvh-150px)] flex-col max-[641px]:min-h-[calc(100dvh-160px)]",
  agent: "mx-4 mt-3 flex items-center gap-3 rounded-xl bg-sec px-3 py-2 [&_select]:min-w-0 [&_select]:flex-1 [&_select]:cursor-pointer [&_select]:!pr-7 [&_select]:font-semibold",
  new: "flex-none",
  chev: "pointer-events-none -ml-7 grid flex-none rotate-90 text-hint opacity-60",
  feed: "flex flex-1 flex-col gap-2 p-4",
  row: "flex max-w-full items-end gap-2",
  /** foydalanuvchi xabari: o'ngda, tugma rangida */
  me: "ch-me justify-end",
  bubble:
    "max-w-[min(78%,560px)] rounded-2xl rounded-bl-md bg-sec px-3 py-2 leading-[1.45] whitespace-pre-wrap [overflow-wrap:anywhere] [.ch-me_&]:rounded-bl-2xl [.ch-me_&]:rounded-br-md [.ch-me_&]:bg-btn [.ch-me_&]:text-btn-fg",
  err: "text-sm text-danger",
  tools: "mb-1.5 flex flex-wrap gap-1",
  tool: "inline-flex items-center gap-1 rounded-md bg-[rgba(127,127,127,.14)] px-2 py-0.5 text-xs text-sub [&_svg]:size-3",
  /** "yozmoqda" uch nuqtasi */
  typing:
    "inline-flex h-5 items-center gap-1 px-0.5 [&_i]:size-1.5 [&_i]:animate-typing [&_i]:rounded-full [&_i]:bg-hint [&_i:nth-child(2)]:[animation-delay:.15s] [&_i:nth-child(3)]:[animation-delay:.3s] reduce:[&_i]:animate-none reduce:[&_i]:opacity-60",
  empty:
    "flex flex-1 flex-col items-center justify-center gap-2.5 px-4 py-8 text-center [&_h2]:mt-1.5 [&_h2]:mb-0 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:m-0 [&_p]:max-w-[360px] [&_p]:text-sm [&_p]:text-sub",
  sugg: `mt-2 flex flex-wrap justify-center gap-2 [&_button]:min-h-9 [&_button]:cursor-pointer [&_button]:rounded-2xl [&_button]:border-0 [&_button]:bg-sec [&_button]:px-3.5 [&_button]:py-2 [&_button]:text-sm [&_button]:text-fg [&_button:active]:opacity-70 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-focus`,
  /** yozish maydoni: kompyuterda ekran pastida, telefonda pastki tab-panel ustida */
  composer:
    "sticky bottom-0 z-5 flex items-end gap-2 bg-[linear-gradient(to_top,var(--page)_70%,transparent)] px-4 pt-2 pb-3 max-[641px]:bottom-[calc(62px+env(safe-area-inset-bottom))] [&_textarea]:!max-h-40 [&_textarea]:!min-h-11 [&_textarea]:flex-1 [&_textarea]:resize-none [&_textarea]:rounded-[22px] [&_textarea]:bg-sec [&_textarea]:!px-3.5 [&_textarea]:!py-[11px] [&_textarea]:leading-[1.35]",
  send: `grid size-11 flex-none cursor-pointer place-items-center rounded-full border-0 bg-btn text-btn-fg disabled:cursor-default disabled:opacity-45 [&_svg]:size-5 ${FOCUS}`,
  /** to'xtatish (send bilan birga) */
  stop: "!bg-[rgba(127,127,127,.25)] !text-fg",
} as const;

export default c;
