// Ombor umumiy ko'rinish bo'laklari: ikki ustun (kompyuter), panel quti, natija bloki, miqdor, teglar, plitkalar.
import type { ReactNode } from "react";

import { num, un } from "@/erp/kit/fmt";
import { Icon } from "@/erp/kit/ui";

/** Ikki ustun to'ri (kompyuter) va yopishqoq ustun */
export const COLS = "mt-1 grid items-start gap-6 [&>*]:min-w-0 [&>div>.sh:first-child]:!pt-1.5";
const COLS_K = { l: "grid-cols-[minmax(340px,5fr)_minmax(0,7fr)]", r: "grid-cols-[minmax(0,8fr)_minmax(340px,4fr)]", e: "grid-cols-2" };
export const STICKY = "sticky top-4 max-h-[calc(100vh-32px)] overflow-y-auto pb-3 [scrollbar-width:thin]";
/** Teg (joy, firma, ombor, sinf) */
export const TAG = "my-px mr-[3px] inline-block whitespace-nowrap rounded-md bg-fill px-[7px] py-px text-xs text-sub";

/** Kompyuterda — ikki ustun: l — chap tor va yopishqoq (skaner, forma), r — o'ng tor va yopishqoq (tafsilot),
 *  e — teng; telefonda — ketma-ket */
export const Split = ({ wide, left, right, kind = "l" }: { wide: boolean; left: ReactNode; right: ReactNode; kind?: "l" | "r" | "e" }) =>
  wide ? (
    <div className={`${COLS} ${COLS_K[kind]}`}>
      <div className={kind === "l" ? STICKY : undefined}>{left}</div>
      <div className={kind === "r" ? STICKY : undefined}>{right}</div>
    </div>
  ) : (
    <>
      {left}
      {right}
    </>
  );

/** Kompyuterdagi bo'sh/izoh qutisi (o'ng ustun) */
export const Pane = ({ children }: { children: ReactNode }) => <div className="mx-4 rounded-[14px] bg-sec [&_.empty]:!px-8 [&_.empty]:!py-14">{children}</div>;

/** Amal natijasi: katta belgi, sarlavha, matn (yashil — muvaffaqiyat, sariq — farq bor) */
export const Done = ({ ok, title, children }: { ok: boolean; title: string; children?: ReactNode }) => (
  <div className={`empty [&_b.code]:text-xl ${ok ? "[&_.ei]:bg-st-done/14 [&_.ei]:text-st-done" : "[&_.ei]:bg-st-work/14 [&_.ei]:text-st-work"}`} role="status">
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
    <span className="ml-[3px] text-[.86em] text-hint">{un(u)}</span>
  </span>
);

/** Teglar: birinchi n tasi + "+k" */
export const Tags = ({ xs, n = 3, code }: { xs: string[]; n?: number; code?: boolean }) =>
  xs.length ? (
    <>
      {xs.slice(0, n).map((x) => (
        <span key={x} className={`${TAG} ${code ? "code" : ""}`}>
          {x}
        </span>
      ))}
      {xs.length > n ? <span className={TAG}>+{xs.length - n}</span> : null}
    </>
  ) : (
    <span className="text-hint">—</span>
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
    <button type="button" className={`tile !flex w-full cursor-pointer flex-col border-0 text-left text-inherit [font:inherit] hover:shadow-[inset_0_0_0_1px_var(--link)] ${k}`} onClick={onClick}>
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
