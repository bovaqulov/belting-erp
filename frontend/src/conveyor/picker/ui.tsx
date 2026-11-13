// Tanlash oynasi (faqat ko'rinish): qidiruv maydoni, variantlar ro'yxati (joriysi belgilangan).
import type { RefObject } from "react";

import { c, EmptyRow, Icon } from "@/conveyor/kit";

type T = (uz: string, ru: string) => string;

export function PickerView({
  t,
  q,
  qRef,
  items,
  cur,
  onQ,
  onPick,
}: {
  t: T;
  q: string;
  qRef: RefObject<HTMLInputElement | null>;
  items: { name: string; note?: string }[];
  cur: unknown;
  onQ: (v: string) => void;
  onPick: (name: string) => void;
}) {
  return (
    <>
      <div className={c("search")}>
        <Icon name="search" />
        <input ref={qRef} id="pq" placeholder={t("Qidirish…", "Поиск…")} autoComplete="off" value={q} onChange={(e) => onQ(e.currentTarget.value)} />
      </div>
      <div className={c("list")} id="pl">
        {items.length ? (
          items.map((x, i) => (
            <div key={i} className={c("item tap", x.name === cur && "on")} data-n={x.name} onClick={() => onPick(x.name)}>
              <div className={c("main")}>
                <div className={c("t")}>{x.name}</div>
                {x.note ? <div className={c("s")}>{x.note}</div> : null}
              </div>
              {x.name === cur ? <Icon name="check" /> : null}
            </div>
          ))
        ) : (
          <EmptyRow text={t("Topilmadi", "Не найдено")} />
        )}
      </div>
    </>
  );
}
