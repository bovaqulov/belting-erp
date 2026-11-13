// Sex taxtasi (faqat ko'rinish): sarlavha (ochiq/kechikkan, soat, tanlash), 4 ustun (kompyuter/TV), telefonda —
// bosqich tablari va ro'yxat; tanlov paneli, asosiy tugma (birga qabul / yig'ish / tayyor).
import { d8, hhmm } from "@/erp/kit/fmt";
import { Check, Empty, Icon, List, MainButton, Row, Seg } from "@/erp/kit/ui";
import { Due, SizeOf } from "@/erp/workshop/common";
import { ord, PH, PHN, rukavSize, same, type Board, type Job, type Phase } from "@/erp/workshop/lib";

export function BoardScreen({
  b,
  err,
  at,
  clock,
  selm,
  sel,
  selp,
  tab,
  onTab,
  onSelm,
  onOff,
  onSelAll,
  onOpen,
  onAccept,
  onCollect,
  onReady,
}: {
  b: Board;
  /** fon yangilanishi yiqildi — ekrandagi zakazlar eskirgan bo'lishi mumkin */
  err: string;
  at: number;
  clock: string;
  selm: boolean;
  sel: Set<number>;
  selp: Phase | null;
  tab: Phase;
  onTab: (p: Phase) => void;
  onSelm: () => void;
  onOff: () => void;
  onSelAll: (p: Phase, jobs: Job[]) => void;
  onOpen: (j: Job) => void;
  onAccept: (ids: number[]) => void;
  onCollect: (ids: number[]) => void;
  onReady: (ids: number[]) => void;
}) {
  const cols = b.cols;
  const openN =
    cols.new.length + cols.collecting.length + cols.making.length;
  const late = [...cols.new, ...cols.collecting, ...cols.making].filter(
    (j) => j.late,
  ).length;
  // yangilangan taxtada yo'qolgan (boshqa ishchi olgan) zakazlar tanlovga kirmaydi
  const ids = selp
    ? [...sel].filter((i) => cols[selp].some((j) => j.id === i))
    : [];
  const n = ids.length;
  return (
    <>
      <div className="boardhead">
        <h1>Sex</h1>
        <div className="meta">
          <span>{openN} ta ochiq zakaz</span>
          {late ? <span className="st bad">{late} kechikkan</span> : null}
          {err ? (
            // fon yangilanishi yiqildi — ekrandagi zakazlar eskirgan bo'lishi mumkin (TV'da soat yuraveradi)
            <span className="st bad" role="status">
              Yangilanmadi · {at ? hhmm(new Date(at)) : "—"}
            </span>
          ) : null}
        </div>
        <span className="code clock">{clock}</span>
        <button
          className="btn sec mini selb"
          id="selb"
          onClick={() => (selm ? onOff() : onSelm())}
        >
          {selm ? "Tanlashni tugatish" : "Bir nechtasini tanlash"}
        </button>
      </div>
      <div className="large mob">
        Sex
        <small>
          {openN} ta ochiq
          {late ? (
            <>
              {" · "}
              <span className="bad-t">{late} kechikkan</span>
            </>
          ) : null}
        </small>
      </div>

      <div className="kb">
        {PH.map((p) => (
          <section key={p} className={`kcol ${p}`} aria-label={PHN[p]}>
            <h3>
              {PHN[p]}
              {selm && p !== "ready" && cols[p].length ? (
                <button
                  className="all"
                  onClick={() => onSelAll(p, cols[p])}
                >
                  hammasi
                </button>
              ) : null}
              <span className="n">{cols[p].length}</span>
            </h3>
            {cols[p].length ? (
              cols[p].map((j) => (
                <Card
                  key={j.id}
                  j={j}
                  selm={selm}
                  on={sel.has(j.id)}
                  open={onOpen}
                />
              ))
            ) : (
              <div className="kempty">
                {p === "new" ? "Yangi zakaz yo'q" : "—"}
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="mob">
        <Seg
          items={PH.map(
            (p) =>
              [p, `${PHN[p]} ${cols[p].length || ""}`] as [Phase, string],
          )}
          cur={tab}
          onPick={onTab}
        />
        {tab !== "ready" && cols[tab].length > 1 ? (
          <div className="selbar">
            {selm ? (
              <>
                <b>
                  {selp === tab && n
                    ? `${n} ta tanlandi`
                    : "Zakazlarni belgilang"}
                </b>
                {selp === tab && n === 1 ? (
                  <button
                    data-sb="like"
                    onClick={() => {
                      const f = cols[tab].find((j) => sel.has(j.id))!;
                      onSelAll(
                        tab,
                        cols[tab].filter((j) => same(j, f)),
                      );
                    }}
                  >
                    O&apos;xshashlari
                  </button>
                ) : null}
                <button
                  data-sb="all"
                  onClick={() => onSelAll(tab, cols[tab])}
                >
                  Hammasi
                </button>
                <button data-sb="off" onClick={onOff}>
                  Bekor
                </button>
              </>
            ) : (
              <button data-sb="on" onClick={onSelm}>
                <Icon n="check" /> Bir nechtasini tanlash
              </button>
            )}
          </div>
        ) : null}
        <div id="ml">
          {cols[tab].length ? (
            <List>
              {cols[tab].map((j) => {
                const s = selm && tab !== "ready";
                return (
                  <Row
                    key={j.id}
                    icon={s ? undefined : "factory"}
                    lead={s ? <Check on={sel.has(j.id)} /> : undefined}
                    color={
                      j.late
                        ? "red"
                        : tab === "ready"
                          ? "green"
                          : "purple"
                    }
                    t={`${ord(j)} · ${j.item}`}
                    tcls="wrap2"
                    s={[rukavSize(j), j.customer, j.worker]
                      .filter(Boolean)
                      .join(" · ")}
                    val={
                      j.due ? (
                        <span className={j.late ? "bad-t" : ""}>
                          {d8(j.due)}
                        </span>
                      ) : (
                        ""
                      )
                    }
                    chev={!s}
                    role={s ? "checkbox" : undefined}
                    checked={sel.has(j.id)}
                    onClick={() => onOpen(j)}
                    data={{ j: j.id }}
                  />
                );
              })}
            </List>
          ) : (
            <Empty icon="factory" title="Bo'sh">
              {tab === "new"
                ? "Yangi buyurtma kelganda shu yerda chiqadi"
                : ""}
            </Empty>
          )}
        </div>
      </div>

      {n && selp === "new" ? (
        <MainButton text={`${n} ta zakazni qabul qilish`} onClick={() => onAccept(ids)} />
      ) : n && selp === "collecting" ? (
        <MainButton text={`${n} ta zakazni yig'ish`} onClick={() => onCollect(ids)} />
      ) : n && selp === "making" ? (
        <MainButton text={`${n} ta zakaz tayyor`} color="#31b545" onClick={() => onReady(ids)} />
      ) : null}
    </>
  );
}

function Card({
  j,
  selm,
  on,
  open,
}: {
  j: Job;
  selm: boolean;
  on: boolean;
  open: (j: Job) => void;
}) {
  const can = selm && j.phase !== "ready";
  return (
    <div
      className={`jc ${j.late ? "late" : j.priority ? "prio" : ""} ${on ? "on" : ""}`}
      tabIndex={0}
      role={can ? "checkbox" : "button"}
      aria-checked={can ? on : undefined}
      aria-label={ord(j)}
      data-j={j.id}
      onClick={() => open(j)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(j);
        }
      }}
    >
      <div className="top1">
        <span className="code no">
          {can ? (
            <>
              <Check on={on} />{" "}
            </>
          ) : null}
          {ord(j)}
        </span>
        <Due j={j} />
      </div>
      <div className="it">{j.item}</div>
      {j.size || j.route === "rukav" ? (
        <div className="code sz">
          <SizeOf j={j} />
        </div>
      ) : null}
      <div className="mt">
        <span>{j.customer || ""}</span>
        <span>
          {j.lenta_project ? (
            <>
              <Icon n="layers" />{" "}
            </>
          ) : null}
          {j.worker || ""}
        </span>
      </div>
    </div>
  );
}
