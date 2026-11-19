// Bitimlar bo'limi (faqat ko'rinish): qidiruv, yangilash; 300+ kun banneri.
import type { ReactNode, RefObject } from "react";


import { Icon } from "@/erp/kit/ui";
import { HDR2, SP, SRCH, TB } from "@/erp/crm/tw";

export function DealsToolbar({
  q,
  qRef,
  onQ,
  extra,
}: {
  q: string;
  qRef: RefObject<HTMLInputElement | null>;
  onQ: (v: string) => void;
  /** qo'shimcha tugmalar (Telegram) */
  extra?: ReactNode;
}) {
  return (
    <div data-hdr2="" className={HDR2}>
      <div className={TB}>
        <div className={SRCH}>
          <Icon n="search" />
          <input
            ref={qRef}
            className="inp"
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="Bitim, mijoz, STIR, telefon yoki #raqam"
            aria-label="Bitim qidirish"
            type="search"
          />
        </div>
        <span className={SP} />
        {extra}
      </div>
    </div>
  );
}

/** 300+ kun tegilmagan ochiq bitimlar ogohlantirishi; active — kanban shu bitimlar bilan cheklangan, "Hammasini ko'rsatish" qaytaradi */
export const IdleBanner = ({ total, active, onReview, onClear }: { total: number; active: boolean; onReview: () => void; onClear: () => void }) => (
  <div className="mx-5 mt-3 flex flex-none items-center gap-2.5 rounded-[10px] bg-[color-mix(in_srgb,var(--warn)_16%,var(--sec))] px-3.5 py-2.5 max-md:mx-3 max-md:mt-2 max-md:gap-2 max-md:px-2.5 max-md:py-1.5 max-md:text-[13px] max-md:[&_svg.i]:size-4 max-md:[&_.b]:h-8 max-md:[&_.b]:px-2.5 max-md:[&_.b]:text-[12.5px]" role="status">
    <Icon n="alert" />
    {/* telefonda — bir qator: qisqa matn va tugma */}
    <div className="min-w-0 flex-1 md:hidden">
      <b>{active ? "Faqat harakatsiz bitimlar" : `${total} ta bitim 300+ kun tegilmagan`}</b>
    </div>
    {active ? (
      <div className="max-md:hidden">
        <b>Faqat 300 kundan ortiq tegilmagan bitimlar ko&apos;rsatilmoqda.</b> Davom etsa — keyingi vazifa qo&apos;ying, bo&apos;lmasa — sababi bilan
        yoping.
      </div>
    ) : (
      <div className="max-md:hidden">
        <b>{total} ta ochiq bitim 300 kundan ortiq tegilmagan.</b> Har birini ko&apos;rib chiqing: davom etsa — keyingi vazifa qo&apos;ying,
        bo&apos;lmasa — sababi bilan yoping.
      </div>
    )}
    <span className={`${SP} max-md:hidden`} />
    {active ? (
      <button type="button" className="b" onClick={onClear}>
        Hammasini ko&apos;rsatish
      </button>
    ) : (
      <button type="button" className="b pri" onClick={onReview}>
        Ko&apos;rib chiqish
      </button>
    )}
  </div>
);
