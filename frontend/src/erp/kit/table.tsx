// Kompyuter jadvali (ERP kit; uslubi — kit.css .tblw/.tbl) (faqat keng ekranda; telefonda — ro'yxat qatorlari). Qator bosilsa — klaviatura bilan ham ochiladi.
import type { ReactNode } from "react";

import "./kit.css";

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
    <div className="tblw">
      <table className="tbl" aria-label={label}>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={i} className={c.n ? "n" : undefined} style={c.w ? { width: c.w } : undefined}>
                {c.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((x, i) => (
            <tr
              key={rowKey(x)}
              className={[onRow ? "tap" : "", sel !== undefined && sel === rowKey(x) ? "picked" : ""].join(" ").trim() || undefined}
              aria-selected={sel !== undefined ? sel === rowKey(x) : undefined}
              tabIndex={onRow ? 0 : undefined}
              onClick={onRow ? () => onRow(x) : undefined}
              onKeyDown={onRow ? (e) => e.key === "Enter" && onRow(x) : undefined}
            >
              {cols.map((c, j) => (
                <td key={j} className={c.n ? "n" : undefined}>
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
