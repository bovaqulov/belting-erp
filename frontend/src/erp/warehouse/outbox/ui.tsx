// Internetsiz navbat chizig'i (faqat ko'rinish)
import { Icon } from "@/erp/kit/ui";

const BTN = "min-h-11 shrink-0 cursor-pointer rounded-[10px] border-0 bg-transparent px-2 text-[15px] font-semibold text-link";

export function OutboxView({ pending, failed, onSend, onFailed }: { pending: number; failed: number; onSend: () => void; onFailed: () => void }) {
  return (
    <div className="mx-4 mb-2 flex flex-col gap-1 rounded-[14px] bg-sec px-3 py-1.5" role="status" aria-live="polite">
      {pending ? (
        <div className="flex items-center gap-2.5">
          <span className="text-warn [&_svg.i]:size-5">
            <Icon n="clock" />
          </span>
          <span className="min-w-0 flex-1 text-[15px]">
            <b className="tabular-nums">{pending}</b> amal navbatda — internet qaytganda o&apos;zi yuboriladi
          </span>
          <button type="button" className={BTN} onClick={onSend}>
            Yuborish
          </button>
        </div>
      ) : null}
      {failed ? (
        <div className="flex items-center gap-2.5">
          <span className="text-danger [&_svg.i]:size-5">
            <Icon n="alert" />
          </span>
          <span className="min-w-0 flex-1 text-[15px]">
            <b className="tabular-nums">{failed}</b> amal server tomonidan rad etildi
          </span>
          <button type="button" className={BTN} onClick={onFailed}>
            Ko&apos;rish
          </button>
        </div>
      ) : null}
    </div>
  );
}
