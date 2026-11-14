// Panel (faqat ko'rinish): plitkalar; telefonda — ro'yxatlar, kompyuterda — ikki ustunli jadvallar.
import { CH, d8, num, short, un } from "@/erp/kit/fmt";
import { Tbl } from "@/erp/kit/table";
import { List, Row, Sf, Sh } from "@/erp/kit/ui";
import { Btns, COLS, Qty, TAG, Tile } from "@/erp/warehouse/common";
import type { Cls, Cycle, Dashboard, PickBrief } from "@/erp/warehouse/lib";

const CLS_TAG: Record<Cls, string> = { A: "bg-st-bad/16 text-st-bad", B: "bg-st-work/16 text-st-work", C: "" };

const Tiles = ({ d, onPicks }: { d: Dashboard; onPicks: () => void }) => {
  const s = d.stock;
  return (
    <div className="tiles">
      <Tile l="Birliklar omborda" v={num(s.units, 0)} sub={`${num(s.items, 0)} tovar`} />
      <Tile l="Rulon / bo'lak" v={`${num(s.rolls, 0)} / ${num(s.pieces, 0)}`} />
      {d.picks !== null ? <Tile l="Yig'ish navbati" v={num(d.picks, 0)} k={d.picks ? "" : "ok"} sub="buyurtma" onClick={onPicks} /> : null}
      <Tile
        l="Sanash aniqligi"
        v={d.accuracy === null ? "—" : `${num(d.accuracy, 1)}%`}
        k={d.accuracy === null ? "" : d.accuracy < 97 ? "bad" : "ok"}
        sub={d.counted_positions ? `${d.counted_positions} poz.` : "30 kun"}
      />
      <Tile l="Joyi belgilanmagan" v={num(s.no_loc, 0)} k={s.no_loc ? "bad" : "ok"} sub="birlik" />
      <Tile l={`Uzoq yotgan (${d.slow_days}+ kun)`} v={num(d.slow_units, 0)} k={d.slow_units ? "bad" : ""} sub="birlik" />
      <Tile l="Kesish chiqindisi" v={d.scrap_pct === null ? "—" : `${num(d.scrap_pct, 1)}%`} k={d.scrap_pct !== null && d.scrap_pct > 8 ? "bad" : ""} sub="m², 30 kun" />
      {d.pending_units ? <Tile l="Stikeri bor, hisobda yo'q" v={num(d.pending_units, 0)} k="bad" sub="birlik" /> : null}
      {s.value !== undefined ? <Tile l="Qoldiq tannarxi" v={short(s.value)} sub="so'm" /> : null}
    </div>
  );
};

const LOW_EMPTY = "Minimal qoldiqdan past tovar yo'q (minimum tovar kartochkasida beriladi).";

export function PanelView({
  d,
  wide,
  picks,
  cyc,
  whName,
  kinds,
  stamp,
  onPicks,
  onPick,
  onCount,
}: {
  d: Dashboard;
  wide: boolean;
  picks: PickBrief[];
  cyc: Cycle | null;
  whName: string;
  kinds: Record<string, string>;
  stamp: string;
  onPicks: () => void;
  onPick: (id: number) => void;
  onCount: () => void;
}) {
  const today = Object.entries(d.today);
  if (!wide)
    return (
      <>
        <div style={{ height: 12 }} />
        <Tiles d={d} onPicks={onPicks} />
        <Sh t="Kam qolgan" r={d.low.length || undefined} />
        {d.low.length ? (
          <List>
            {d.low.map((x) => (
              <Row key={x.name} icon="alert" color="orange" t={x.name} tcls="wrap2" s={`minimum ${num(x.min_qty, 3)} ${un(x.unit)}`} val={<span className="num text-danger">{num(x.qty, 3)}</span>} />
            ))}
          </List>
        ) : (
          <Sf>{LOW_EMPTY}</Sf>
        )}
        <Sh t="Bugun" />
        {today.length ? (
          <List>
            {today.map(([k, n]) => (
              <Row key={k} icon="file" color="gray" t={kinds[k] ?? k} val={<span className="num">{n}</span>} />
            ))}
          </List>
        ) : (
          <Sf>Bugun ombor hujjati yo&apos;q.</Sf>
        )}
        {d.counts.length ? (
          <>
            <Sh t="Oxirgi sanashlar" />
            <List>
              {d.counts.map((c) => (
                <Row
                  key={c.number}
                  icon="clipboard"
                  color={c.diff ? "orange" : "green"}
                  t={<span className="code">{c.number}</span>}
                  s={d8(c.date)}
                  val={c.diff ? <span className="num text-danger">{c.diff} farq</span> : <span className="text-ok">farqsiz</span>}
                  valSmall={`${c.positions} poz.`}
                />
              ))}
            </List>
          </>
        ) : null}
      </>
    );

  const cycRows = cyc ? (Object.entries(cyc.summary) as [Cls, Cycle["summary"][Cls]][]) : [];
  return (
    <>
      <p className="mx-4 mt-0.5 mb-3 text-sm text-hint tabular-nums">{stamp} holati</p>
      <Tiles d={d} onPicks={onPicks} />
      <div className={`${COLS} grid-cols-2`}>
        <div>
          <Sh t="Yig'ish navbati" r={picks.length ? `${picks.length} buyurtma` : undefined} />
          {picks.length ? (
            <>
              <Tbl
                label="Yig'ish navbati"
                rows={picks.slice(0, 12)}
                rowKey={(r) => String(r.id)}
                onRow={(r) => onPick(r.id)}
                cols={[
                  { h: "Buyurtma", f: (r) => (<><span className="code">{r.number}</span><div className="t2">{d8(r.date)}</div></>) },
                  { h: "Mijoz", f: (r) => (<>{r.customer ?? "—"}<div className="t2">{r.names.join(", ")}</div></>) },
                  { h: "Firma", f: (r) => r.firm },
                  { h: "Kanal", f: (r) => (r.channel ? (CH[r.channel] ?? r.channel) : "Ulgurji") },
                  { h: "Qator", n: true, f: (r) => r.lines },
                ]}
              />
              {picks.length > 12 ? (
                <Btns>
                  <button className="btn sec" onClick={onPicks}>
                    Barchasi ({picks.length})
                  </button>
                </Btns>
              ) : null}
            </>
          ) : (
            <Sf>Yig&apos;ishga tayyor buyurtma yo&apos;q.</Sf>
          )}
          <Sh t="Bugun sanash (ABC)" r={cyc ? `${cyc.due_total} tovar · ${whName}` : undefined} />
          {cyc ? (
            <>
              <Tbl
                label="ABC sanash rejasi"
                rows={cycRows}
                rowKey={(r) => r[0]}
                cols={[
                  { h: "Sinf", f: (r) => <span className={`${TAG} font-semibold ${CLS_TAG[r[0]]}`}>{r[0]}</span> },
                  { h: "Oraliq", f: (r) => `har ${r[1].days} kun` },
                  { h: "Tovar", n: true, f: (r) => num(r[1].items, 0) },
                  { h: "Muddati o'tgan", n: true, f: (r) => (r[1].due ? <span className="text-danger">{num(r[1].due, 0)}</span> : <span className="text-ok">0</span>) },
                ]}
              />
              <Btns>
                <button className="btn sec" onClick={onCount}>
                  Sanashni boshlash
                </button>
              </Btns>
            </>
          ) : (
            <Sf>—</Sf>
          )}
        </div>
        <div>
          <Sh t="Kam qolgan" r={d.low.length || undefined} />
          {d.low.length ? (
            <Tbl
              label="Kam qolgan"
              rows={d.low}
              rowKey={(x) => x.name}
              cols={[
                { h: "Tovar", f: (x) => x.name },
                { h: "Minimum", n: true, f: (x) => <Qty v={x.min_qty} u={x.unit} /> },
                { h: "Bor", n: true, f: (x) => <span className="text-danger">{num(x.qty, 3)}</span> },
              ]}
            />
          ) : (
            <Sf>{LOW_EMPTY}</Sf>
          )}
          <Sh t="Bugungi hujjatlar" />
          {today.length ? (
            <Tbl label="Bugungi hujjatlar" rows={today} rowKey={(r) => r[0]} cols={[{ h: "Turi", f: (r) => kinds[r[0]] ?? r[0] }, { h: "Soni", n: true, f: (r) => r[1] }]} />
          ) : (
            <Sf>Bugun ombor hujjati yo&apos;q.</Sf>
          )}
          <Sh t="Oxirgi sanashlar" />
          {d.counts.length ? (
            <Tbl
              label="Oxirgi sanashlar"
              rows={d.counts}
              rowKey={(c) => c.number}
              cols={[
                { h: "Hujjat", f: (c) => <span className="code">{c.number}</span> },
                { h: "Sana", f: (c) => d8(c.date) },
                { h: "Pozitsiya", n: true, f: (c) => c.positions },
                { h: "Farq", n: true, f: (c) => (c.diff ? <span className="text-danger">{c.diff}</span> : <span className="text-ok">farqsiz</span>) },
              ]}
            />
          ) : (
            <Sf>30 kunda inventarizatsiya bo&apos;lmagan.</Sf>
          )}
        </div>
      </div>
    </>
  );
}
