// Kompyuter jadvali (ERP kit; uslub — Tailwind) (faqat keng ekranda; telefonda — ro'yxat qatorlari). Qator bosilsa — klaviatura bilan ham ochiladi.
import type { ReactNode } from "react";

const TH = "sticky top-0 z-1 whitespace-nowrap border-b border-sep bg-sec px-2.5 py-[9px] text-xs font-semibold text-hint";
const TD = "border-b border-sep px-2.5 py-2 align-top group-last/tr:border-b-0";
const NUM = "whitespace-nowrap text-right tabular-nums";

export type Col<T> = { h: ReactNode; f: (x: T, i: number) => ReactNode; n?: boolean; w?: string };

/** sel — tanlangan qator kaliti (rowKey bilan bir xil): ajratib ko'rsatiladi, aria-selected */
export function Tbl<T>({
  cols,
  rows,
  onRow,
  rowKey,
  label,
  sel,
}: {
  cols: Col<T>[];
  rows: T[];
  onRow?: (x: T) => void;
  rowKey: (x: T) => string;
  label: string;
  sel?: string;
}) {
  return (
    <div className="mx-4 overflow-x-auto rounded-xl bg-sec">
      <table className="w-full border-collapse text-[13.5px] [&_.badge]:mt-1" aria-label={label}>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={i} className={`${TH} ${c.n ? NUM : "text-left"}`} style={c.w ? { width: c.w } : undefined}>
                {c.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((x, i) => (
            <tr
              key={rowKey(x)}
              className={`group/tr ${onRow ? "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-link" : ""} ${sel !== undefined && sel === rowKey(x) ? "[&>td]:bg-link/14" : onRow ? "hover:[&>td]:bg-fill" : ""}`}
              aria-selected={sel !== undefined ? sel === rowKey(x) : undefined}
              tabIndex={onRow ? 0 : undefined}
              onClick={onRow ? () => onRow(x) : undefined}
              onKeyDown={onRow ? (e) => e.key === "Enter" && onRow(x) : undefined}
            >
              {cols.map((c, j) => (
                <td key={j} className={`${TD} ${c.n ? NUM : ""}`}>
                  {c.f(x, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
