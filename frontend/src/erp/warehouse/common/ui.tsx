// Ombor umumiy ko'rinish bo'laklari: ikki ustun (kompyuter), panel quti, natija bloki, miqdor, teglar, plitkalar.
import type { ReactNode } from "react";

import { num, un } from "@/erp/kit/fmt";
import { Icon } from "@/erp/kit/ui";

/** Kompyuterda — ikki ustun: l — chap tor va yopishqoq (skaner, forma), r — o'ng tor va yopishqoq (tafsilot),
 *  e — teng; telefonda — ketma-ket */
export const Split = ({ wide, left, right, kind = "l" }: { wide: boolean; left: ReactNode; right: ReactNode; kind?: "l" | "r" | "e" }) =>
  wide ? (
    <div className={`wh-cols ${kind}`}>
      <div className={kind === "l" ? "wh-sticky" : undefined}>{left}</div>
      <div className={kind === "r" ? "wh-sticky" : undefined}>{right}</div>
    </div>
  ) : (
    <>
      {left}
      {right}
    </>
  );

/** Kompyuterdagi bo'sh/izoh qutisi (o'ng ustun) */
export const Pane = ({ children }: { children: ReactNode }) => <div className="wh-pane">{children}</div>;

/** Amal natijasi: katta belgi, sarlavha, matn (yashil — muvaffaqiyat, sariq — farq bor) */
export const Done = ({ ok, title, children }: { ok: boolean; title: string; children?: ReactNode }) => (
  <div className={`empty wh-done ${ok ? "ok" : "warn"}`} role="status">
    <div className="ei">
      <Icon n={ok ? "check" : "alert"} />
    </div>
    <b className="code">{title}</b>
    {children}
  </div>
);

/** Miqdor + birlik: "12,5 m²" (birlik xiraroq) */
export const Qty = ({ v, u, cls = "" }: { v: number | string; u: string; cls?: string }) => (
  <span className={`num ${cls}`}>
    {num(v, 3)}
    <span className="wh-u">{un(u)}</span>
  </span>
);

/** Teglar: birinchi n tasi + "+k" */
export const Tags = ({ xs, n = 3, code }: { xs: string[]; n?: number; code?: boolean }) =>
  xs.length ? (
    <>
      {xs.slice(0, n).map((x) => (
        <span key={x} className={`wh-tag ${code ? "code" : ""}`}>
          {x}
        </span>
      ))}
      {xs.length > n ? <span className="wh-tag">+{xs.length - n}</span> : null}
    </>
  ) : (
    <span className="hint-t">—</span>
  );

/** Panel plitkasi; onClick bo'lsa — bosiladigan (tugma) */
export const Tile = ({ l, v, sub, k = "", onClick }: { l: string; v: ReactNode; sub?: string; k?: "" | "ok" | "bad"; onClick?: () => void }) => {
  const body = (
    <>
      <div className="l">{l}</div>
      <div className="v num">
        {v}
        {sub ? <small> {sub}</small> : null}
      </div>
    </>
  );
  return onClick ? (
    <button type="button" className={`tile wh-tile-btn ${k}`} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={`tile ${k}`}>{body}</div>
  );
};

/** Bitta qatorli tugmalar bloki */
export const Btns = ({ children }: { children: ReactNode }) => <div className="btns">{children}</div>;

/** "P00000101 · 800×12500 mm · BLT" — kod .code bilan, qolgani oddiy matn */
export const CodeAnd = ({ code, rest }: { code?: string | null; rest: (string | null | undefined | false)[] }) => {
  const r = rest.filter(Boolean).join(" · ");
  return (
    <>
      {code ? <span className="code">{code}</span> : null}
      {code && r ? " · " : ""}
      {r}
    </>
  );
};
