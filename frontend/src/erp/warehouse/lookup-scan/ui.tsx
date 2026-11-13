// Skaner bo'limi (faqat ko'rinish): chapda skaner maydoni va izoh, o'ngda (telefonda — pastda) natija kartochkasi.
import type { ReactNode } from "react";

import { Empty, List, Row, Sf } from "@/erp/kit/ui";
import { Pane, Split } from "@/erp/warehouse/common";
import type { ItemHit, ScanCell, ScanItem, ScanUnit } from "@/erp/warehouse/lib";
import type { ItemRef } from "@/erp/warehouse/lookup";

export type Out =
  | { k: "unit"; u: ScanUnit }
  | { k: "item"; it: ScanItem | ItemRef }
  | { k: "cell"; c: ScanCell }
  | { k: "list"; rs: ItemHit[] }
  | { k: "doc"; number: string }
  | null;

const HINT = "Rulon/bo'lak QR stikeri, joy yorlig'i, tovar shtrixkodi yoki 1C kodi. Nom bo'yicha qidirish — 2+ harf yozib Enter.";

export function LookupView({
  wide,
  out,
  outKey,
  bar,
  card,
  onItem,
}: {
  wide: boolean;
  out: Out;
  outKey: number;
  bar: ReactNode;
  card: ReactNode;
  onItem: (it: ItemRef) => void;
}) {
  const body =
    out?.k === "list" ? (
      <List>
        {out.rs.map((x) => (
          <Row key={`${x.item_id}:${x.char_id ?? ""}`} icon="package" color="orange" t={x.name} tcls="wrap2" s={x.sku ?? ""} chev onClick={() => onItem(x)} />
        ))}
      </List>
    ) : out?.k === "doc" ? (
      <List>
        <Row icon="file" color="gray" t={<span className="code">{out.number}</span>} s="Hujjat" />
      </List>
    ) : out ? (
      card
    ) : null;
  return (
    <Split
      wide={wide}
      left={
        <>
          {bar}
          <Sf>
            {HINT}
            {wide ? (
              <>
                <br />
                USB/Bluetooth skaner shu maydonga yozadi — sahifaning istalgan joyida skanerlash mumkin.
              </>
            ) : null}
          </Sf>
        </>
      }
      right={
        <div key={outKey}>
          {body ??
            (wide ? (
              <Pane>
                <Empty icon="scan" title="Natija shu yerda">
                  Birlik, tovar yoki joy ma&apos;lumoti
                </Empty>
              </Pane>
            ) : (
              <Empty icon="scan" title="Skanerlang">
                Natija shu yerda chiqadi
              </Empty>
            ))}
        </div>
      }
    />
  );
}
