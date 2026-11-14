// Material sarfi oynasi (faqat ko'rinish): birlik, mavjud/rejada; lenta — bo'lak o'lchami, avtomatik qoldiq hisobi,
// qo'lda qoldiqlar; boshqa material — miqdor.
import { num, un, usz } from "@/erp/kit/fmt";
import { Check, List, Row, Sf, Sh, Sheet } from "@/erp/kit/ui";
import { dimTxt, type CutPreview, type Dim, type Take } from "@/erp/workshop/lib";

export function RestInputs({ rests, set }: { rests: Dim[]; set: (r: Dim[]) => void }) {
  const upd = (i: number, k: keyof Dim, v: string) => set(rests.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  return (
    <>
      {rests.map((r, i) => (
        <List key={i} style={{ marginTop: 8 }}>
          <div className="field">
            <label htmlFor={`rw${i}`}>{i + 1}-qoldiq eni, mm</label>
            <input id={`rw${i}`} inputMode="numeric" value={r.width_mm} onChange={(e) => upd(i, "width_mm", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`rl${i}`}>{i + 1}-qoldiq uzunligi, mm</label>
            <input id={`rl${i}`} inputMode="numeric" value={r.length_mm} onChange={(e) => upd(i, "length_mm", e.target.value)} />
          </div>
          <Row icon="x" color="red" t="Olib tashlash" tap onClick={() => set(rests.filter((_, n) => n !== i))} />
        </List>
      ))}
      <List style={{ marginTop: 8 }}>
        <Row icon="plus" color="blue" t="Qoldiq qo'shish" tap onClick={() => set([...rests, { width_mm: "", length_mm: "" }])} />
      </List>
    </>
  );
}

export function TakeSheetView({
  t,
  extra,
  q,
  w,
  l,
  manual,
  rests,
  cur,
  onQ,
  onW,
  onL,
  onManual,
  onRests,
  onClose,
  onDone,
}: {
  t: Take;
  extra: string;
  q: string;
  w: string;
  l: string;
  manual: boolean;
  rests: Dim[];
  /** joriy o'lcham uchun backend hisobi (yoki xato) */
  cur: { r?: CutPreview; err?: string } | null;
  onQ: (v: string) => void;
  onW: (v: string) => void;
  onL: (v: string) => void;
  onManual: () => void;
  onRests: (r: Dim[]) => void;
  onClose: () => void;
  onDone: () => Promise<boolean | void>;
}) {
  const { u, have, p } = t;
  const wl = u.unit === "m2";
  return (
    <Sheet title="Material sarfi" done="Tasdiqlash" onClose={onClose} onDone={onDone}>
      <List>
        <Row
          icon="layers"
          color="orange"
          t={u.name}
          tcls="wrap2"
          s={[u.code, usz(u), u.loc && "joy " + u.loc]
            .filter(Boolean)
            .join(" · ")}
        />
        <Row
          t="Mavjud"
          val={<span className="num">{num(have, 3)}</span>}
          valSmall={un(u.unit)}
        />
        {p ? (
          <Row
            t="Rejada kerak"
            val={<span className="num">{num(p.left, 3)}</span>}
            valSmall={un(p.unit)}
          />
        ) : (
          <Row
            icon="alert"
            color="orange"
            t="Bu material rejada yo'q"
            s="boshqa material bo'lsa ham olish mumkin"
          />
        )}
      </List>
      {wl ? (
        <>
          <List style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="tw">Olingan bo&apos;lak eni, mm</label>
              <input id="tw" inputMode="numeric" value={w} onChange={(e) => onW(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="tl">Olingan bo&apos;lak uzunligi, mm</label>
              <input id="tl" inputMode="numeric" value={l} onChange={(e) => onL(e.target.value)} />
            </div>
          </List>
          {cur?.err && <Sf><span className="text-danger">{cur.err}</span></Sf>}
          {cur?.r && (
            <>
              <Sh t={manual ? "Avtomatik hisob (tekshirish uchun)" : "Qoldiq — avtomatik"} />
              <List>
                <Row
                  t="Bo'lak"
                  val={<span className="code">{dimTxt(cur.r.piece)}</span>}
                  valSmall={`${num(cur.r.piece.qty, 3)} m²`}
                />
                {cur.r.rests.length ? (
                  cur.r.rests.map((r, i) => (
                    <Row
                      key={`${r.width_mm}x${r.length_mm}x${i}`}
                      t="Qoldiq"
                      s="yangi stiker bilan omborda qoladi"
                      val={<span className="code">{dimTxt(r)}</span>}
                      valSmall={`${num(r.qty, 3)} m²`}
                    />
                  ))
                ) : (
                  <Row t={cur.r.whole ? "Rulon to'liq ishlatiladi" : "Qoldiq yo'q"} />
                )}
                {Number(cur.r.scrap) > 0 && (
                  <Row t="Chiqindi" val={<span className="num">{num(cur.r.scrap, 3)}</span>} valSmall="m²" />
                )}
              </List>
            </>
          )}
          <List style={{ marginTop: 12 }}>
            <Row
              t="Qoldiq noto'g'ri — o'zim o'lchab kiritaman"
              tap
              right={<Check on={manual} />}
              onClick={onManual}
            />
          </List>
          {manual && <RestInputs rests={rests} set={onRests} />}
          <Sf>
            Lenta: bo&apos;lak eni × uzunligi (mm) kiritiladi, qoldiq o&apos;zi hisoblanadi. Rulondagi haqiqiy qoldiq boshqacha
            bo&apos;lsa — o&apos;lchab, qo&apos;lda kiriting; farqi chiqindi sifatida yoziladi.
            {extra}
          </Sf>
        </>
      ) : (
        <>
          <List style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="tq">Sarf, {un(u.unit)}</label>
              <input id="tq" inputMode="decimal" value={q} onChange={(e) => onQ(e.target.value)} />
            </div>
          </List>
          <Sf>
            {u.unit === "mm" ? "Rukavdan shu en kesiladi; qolgan qismi yangi stiker bilan omborda qoladi." : ""}
            {extra}
          </Sf>
        </>
      )}
    </Sheet>
  );
}
