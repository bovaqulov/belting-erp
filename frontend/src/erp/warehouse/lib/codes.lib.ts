// Joy kodlari (backend codes.py bilan bir xil): ombor → bino → xona → stellaj → qator → qavat; har daraja o'z kodiga ega:
//   AO  ombor · AO1  bino · AO1-A  xona · AO1-A-02  stellaj · AO1-A-02-03  qator · AO1-A-02-03-C  joy (qavat harf, A — pastki).
// I va O yo'q — 1 va 0 bilan adashmasin. Sof funksiyalar — test qilinadi.
export const FLOORS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const MAX_FLOORS = FLOORS.length;
export const MAX_ROWS = 99;

export const floorLetter = (f: number): string => FLOORS[f - 1] ?? "?";
const pad = (n: number) => String(n).padStart(2, "0");
export const bldCode = (wh: string, n: number) => `${wh}${n}`;
export const blkCode = (bld: string, letter: string) => `${bld}-${letter}`;
export const rackCode = (blk: string, n: number) => `${blk}-${pad(n)}`;
export const rowCode = (rk: string, q: number) => `${rk}-${pad(q)}`;
export const cellCode = (rk: string, q: number, f: number) => `${rowCode(rk, q)}-${floorLetter(f)}`;
/** tokcha yorlig'idagi qisqa kod: 03-C */
export const shortCode = (q: number, f: number) => `${pad(q)}-${floorLetter(f)}`;
