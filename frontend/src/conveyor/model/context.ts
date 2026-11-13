"use client";
import { createContext, useContext } from "react";

import type { Lenta } from "./controller";

export const LentaContext = createContext<Lenta | null>(null);

/** Sahifa boshqaruvchisi (holat + amallar). Qayta chizish — ConveyorApp (har emit() da butun daraxt). */
export function useLenta(): Lenta {
  const L = useContext(LentaContext);
  if (!L) throw new Error("LentaContext yo'q");
  return L;
}
