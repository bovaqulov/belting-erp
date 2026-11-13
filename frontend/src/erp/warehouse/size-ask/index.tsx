"use client";
// O'lcham so'rash oynasi (Promise bilan): konveyer lenta — eni × uzunligi (mm), rukav — eni (mm), rulon — uzunlik.
// const { node, askSize } = useSizeAsk(); ... {node} ni render qiling.
import { useCallback, useState, type ReactNode } from "react";

import { toast } from "@/erp/kit/env";
import { dnum } from "@/erp/kit/fmt";
import type { Size, SizePre } from "@/erp/warehouse/context";
import type { Dims } from "@/erp/warehouse/lib";

import { SizeModal } from "./ui";

type Pending = { title: string; dims: Exclude<Dims, null>; unit: string; pre: SizePre; res: (v: Size | null) => void };

export function useSizeAsk(): { node: ReactNode; askSize: (title: string, dims: Exclude<Dims, null>, unit: string, pre?: SizePre) => Promise<Size | null> } {
  const [p, setP] = useState<Pending | null>(null);
  const askSize = useCallback(
    (title: string, dims: Exclude<Dims, null>, unit: string, pre: SizePre = {}) => new Promise<Size | null>((res) => setP({ title, dims, unit, pre, res })),
    [],
  );
  const node = p ? (
    <SizeModal
      key={p.title}
      title={p.title}
      dims={p.dims}
      unit={p.unit}
      pre={p.pre}
      onCancel={() => {
        p.res(null);
        setP(null);
      }}
      onOk={(a, b) => {
        const g = (s: string) => Number(dnum(s));
        const r: Size = p.dims === "wl" ? { w: g(a), l: g(b) } : { q: g(a) };
        if (p.dims === "wl" ? !(r.w! > 0 && r.l! > 0) : !(r.q! > 0)) {
          toast("O'lchamni kiriting", "bad");
          return false;
        }
        p.res(r);
        setP(null);
        return true;
      }}
    />
  ) : null;
  return { node, askSize };
}
