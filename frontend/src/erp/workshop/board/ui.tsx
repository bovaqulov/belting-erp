// Sex taxtasi (faqat ko'rinish): sarlavha (ochiq/kechikkan, soat, tanlash), 4 ustun (kompyuter/TV), telefonda —
// bosqich tablari va ro'yxat; tanlov paneli, asosiy tugma (birga qabul / yig'ish / tayyor).
import type { CSSProperties } from "react";

import { d8, hhmm } from "@/erp/kit/fmt";
import { Check, Empty, Icon, List, MainButton, Row, Seg } from "@/erp/kit/ui";
import { Due, SizeOf } from "@/erp/workshop/common";
import { ord, PH, PHC, PHN, rukavSize, same, type Board, type Job, type Phase } from "@/erp/workshop/lib";

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
      <div className="hidden items-baseline gap-4 px-6 pt-[18px] pb-3 min-[1024px]:flex">
        <h1 className="m-0 text-[30px] font-bold tracking-[-0.02em]">Sex</h1>
        <div className="flex items-baseline gap-3.5 text-[15px] text-sub [&>span]:whitespace-nowrap">
          <span>{openN} ta ochiq zakaz</span>
          {late ? <span className="st bad">{late} kechikkan</span> : null}
          {err ? (
            // fon yangilanishi yiqildi — ekrandagi zakazlar eskirgan bo'lishi mumkin (TV'da soat yuraveradi)
            <span className="st bad" role="status">
              Yangilanmadi · {at ? hhmm(new Date(at)) : "—"}
            </span>
          ) : null}
        </div>
        <span className="code ml-auto text-[30px] text-sub">{clock}</span>
        <button
          className="btn sec ml-4 w-auto flex-none self-center px-4 py-[9px] text-[15px]"
          id="selb"
          onClick={() => (selm ? onOff() : onSelm())}
        >
          {selm ? "Tanlashni tugatish" : "Bir nechtasini tanlash"}
        </button>
      </div>
      <div className="large min-[1024px]:hidden">
        Sex
        <small>
          {openN} ta ochiq
          {late ? (
            <>
              {" · "}
              <span className="text-danger">{late} kechikkan</span>
            </>
          ) : null}
        </small>
      </div>

      <div className="hidden grid-cols-4 items-start gap-4 px-6 pt-1 pb-6 has-main:pb-24 min-[1024px]:grid">
        {PH.map((p) => (
          <section key={p} className="min-h-[140px] rounded-2xl border-t-4 border-(--pc) bg-sec px-2.5 pb-2.5" style={{ "--pc": `var(--st-${PHC[p]})` } as CSSProperties} aria-label={PHN[p]}>
            <h3 className="m-0 flex items-baseline justify-between px-1 pt-3 pb-2.5 text-base font-bold text-(--pc)">
              {PHN[p]}
              {selm && p !== "ready" && cols[p].length ? (
                <button
                  className="mr-2.5 ml-auto cursor-pointer border-0 bg-transparent px-1.5 py-1 text-[13px] leading-none font-medium text-link"
                  onClick={() => onSelAll(p, cols[p])}
                >
                  hammasi
                </button>
              ) : null}
              <span className="code text-[22px] text-fg">{cols[p].length}</span>
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
              <div className="px-1 pt-1 pb-2 text-sm text-hint">
                {p === "new" ? "Yangi zakaz yo'q" : "—"}
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="min-[1024px]:hidden">
        <Seg
          items={PH.map(
            (p) =>
              [p, `${PHN[p]} ${cols[p].length || ""}`] as [Phase, string],
          )}
          cur={tab}
          onPick={onTab}
        />
        {tab !== "ready" && cols[tab].length > 1 ? (
          <div className="mx-4 mt-2 flex min-h-10 items-center gap-1 text-[15px] text-sub [&_b]:mr-auto [&_b]:text-fg [&_b]:tabular-nums [&_button]:cursor-pointer [&_button]:rounded-lg [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-2 [&_button]:text-[15px] [&_button]:text-link [&_button:only-child]:ml-auto">
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
                        <span className={j.late ? "text-danger" : ""}>
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
      className={`mb-2 cursor-pointer rounded-xl border-l-4 px-[13px] pt-[11px] pb-2.5 transition-shadow duration-150 ${j.late ? "border-st-bad" : j.priority ? "border-st-work" : "border-transparent"} ${on ? "bg-[color-mix(in_srgb,var(--link)_7%,var(--page))] shadow-[var(--shadow-1),inset_0_0_0_2px_var(--link)]" : "bg-page shadow-1 hover:shadow-[var(--shadow-1),inset_0_0_0_1px_var(--link)]"} [&_.ck]:mr-2 [&_.ck]:inline-grid [&_.ck]:align-[-4px]`}
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
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="code text-lg whitespace-nowrap">
          {can ? (
            <>
              <Check on={on} />{" "}
            </>
          ) : null}
          {ord(j)}
        </span>
        <Due j={j} />
      </div>
      <div className="mt-1 line-clamp-2 text-[15px] leading-[1.3]">{j.item}</div>
      {j.size || j.route === "rukav" ? (
        <div className="code mt-0.5 text-[30px] leading-[1.1] [&_small]:ml-0.5 [&_small]:text-[17px] [&_small]:font-medium [&_small]:text-sub">
          <SizeOf j={j} />
        </div>
      ) : null}
      <div className="mt-1.5 flex justify-between gap-2 text-[13.5px] text-sub [&_svg.i]:size-[15px] [&_svg.i]:align-[-2px] [&>span:first-child]:min-w-0 [&>span:first-child]:truncate">
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
