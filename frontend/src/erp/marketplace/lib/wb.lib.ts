// WB postavkalari (FBS): turlar. Kabinetdagi tartib: yig'ish → yuk joylari (QR qutiga) → yetkazib berishga topshirish.
import type { Order, PickRow } from "./orders.lib";

export type Supply = { id: string; name: string; createdAt: string; closedAt: string | null; done: boolean };
export type Box = { id: string; orders: string[] };
export type SupplyDetail = { supply: Supply; orders: Order[]; boxes: Box[]; picking: PickRow[]; picked_all: boolean; step: 1 | 2 | 3 };

/** Bosqich: 3 — topshirilgan; 2 — hammasi yig'ilgan yoki yuk joyi bor; 1 — yig'ilmoqda */
export const supplyStep = (closed: boolean, pickedAll: boolean, boxes: number): 1 | 2 | 3 => (closed ? 3 : pickedAll || boxes ? 2 : 1);
