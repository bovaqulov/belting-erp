// Bitimlar bo'limi (faqat ko'rinish): qidiruv, yangilash; 300+ kun banneri.
import type { ReactNode, RefObject } from "react";


import { Icon } from "@/erp/kit/ui";
import { HDR2, SP, SRCH, TB } from "@/erp/crm/tw";

export function DealsToolbar({
  q,
  qRef,
  onQ,
  onRefresh,
  extra,
}: {
  q: string;
  qRef: RefObject<HTMLInputElement | null>;
  onQ: (v: string) => void;
  onRefresh: () => void;
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
        <button type="button" className="b ic" title="Yangilash" aria-label="Yangilash" onClick={onRefresh}>
          <Icon n="refresh" />
        </button>
      </div>
    </div>
  );
}

/** 300+ kun tegilmagan ochiq bitimlar ogohlantirishi; active — kanban shu bitimlar bilan cheklangan, "Hammasini ko'rsatish" qaytaradi */
export const IdleBanner = ({ total, active, onReview, onClear }: { total: number; active: boolean; onReview: () => void; onClear: () => void }) => (
  <div className="mx-5 mt-3 flex flex-none flex-wrap items-center gap-2.5 rounded-[10px] bg-[color-mix(in_srgb,var(--warn)_16%,var(--sec))] px-3.5 py-2.5 max-md:mx-3 max-md:mt-2" role="status">
    <Icon n="alert" />
    {active ? (
      <div>
        <b>Faqat 300 kundan ortiq tegilmagan bitimlar ko&apos;rsatilmoqda.</b> Davom etsa — keyingi vazifa qo&apos;ying, bo&apos;lmasa — sababi bilan
        yoping.
      </div>
    ) : (
      <div>
        <b>{total} ta ochiq bitim 300 kundan ortiq tegilmagan.</b> Har birini ko&apos;rib chiqing: davom etsa — keyingi vazifa qo&apos;ying,
        bo&apos;lmasa — sababi bilan yoping.
      </div>
    )}
    <span className={SP} />
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
