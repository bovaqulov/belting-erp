// O'lcham oynasi (faqat ko'rinish): bir yoki ikki raqamli maydon, izoh. Enter — tayyor.
import { useState } from "react";

import { un } from "@/erp/kit/fmt";
import { Modal } from "@/erp/kit/modal";
import type { SizePre } from "@/erp/warehouse/context";
import type { Dims } from "@/erp/warehouse/lib";

export function SizeModal({
  title,
  dims,
  unit,
  pre,
  onOk,
  onCancel,
}: {
  title: string;
  dims: Exclude<Dims, null>;
  unit: string;
  pre: SizePre;
  onOk: (a: string, b: string) => boolean;
  onCancel: () => void;
}) {
  const [a, setA] = useState(String((dims === "wl" ? pre.w : pre.q) ?? ""));
  const [b, setB] = useState(String(pre.l ?? ""));
  return (
    <Modal title={title} ok={pre.done ?? "Tayyor"} onClose={onCancel} onOk={() => {
        onOk(a, b);
        return false; // oynani ota (useSizeAsk) o'zi yopadi
      }}
    >
      {dims === "wl" ? (
        <div className="wh-two">
          <div>
            <label className="l" htmlFor="sz-w">
              Eni, mm
            </label>
            <input id="sz-w" className="inp code" inputMode="decimal" placeholder="masalan 600" value={a} onChange={(e) => setA(e.target.value)} />
          </div>
          <div>
            <label className="l" htmlFor="sz-l">
              Uzunligi, mm
            </label>
            <input id="sz-l" className="inp code" inputMode="decimal" placeholder="masalan 3250" value={b} onChange={(e) => setB(e.target.value)} />
          </div>
        </div>
      ) : (
        <>
          <label className="l" htmlFor="sz-q">
            {dims === "w" ? "Eni, mm" : `Uzunligi, ${un(unit)}`}
          </label>
          <input id="sz-q" className="inp code" inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} />
        </>
      )}
      {pre.hint ? <p className="wh-hint">{pre.hint}</p> : null}
    </Modal>
  );
}
