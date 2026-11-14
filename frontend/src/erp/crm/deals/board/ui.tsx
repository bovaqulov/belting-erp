// Kanban (faqat ko'rinish): ochiq bosqich ustunlari, kartochkalar, "Yana N ta", pastda yutildi/yutqazildi zonalari.
import { dtitle, num, short } from "@/erp/kit/fmt";
import { Empty } from "@/erp/kit/ui";
import { AvaView, Tags, TaskBadge } from "@/erp/crm/badges";
import { boardTotals, days, isLate, rotLevel, type BoardResp, type Deal } from "@/erp/crm/lib";
import { idle as idleCls, LINKB, SP } from "@/erp/crm/tw";

/** Ustun/zona uchun sudrash hodisalari (konteyner beradi) */
export type Zone = {
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
};

const C = "mt-0.5 truncate text-[12.5px] text-hint";
/** chirish darajasi: chap chiziq rangi (rot2 — qizil fon ham) */
const ROT: Record<string, string> = { rot: "!border-l-warn bg-sec", rot2: "!border-l-danger bg-[color-mix(in_srgb,var(--danger)_7%,var(--sec))]" };

function Card({ d, nameOf, onOpen, onDrag }: { d: Deal; nameOf: (tg?: number | null) => string; onOpen: (id: number) => void; onDrag: (d: Deal | null) => void }) {
  const st = days(d.stage_since || d.created);
  const idle = days(d.touched || d.updated);
  const rot = rotLevel(d);
  return (
    <div
      className={`cursor-pointer rounded-lg border-l-[3px] px-2.5 py-[9px] shadow-1 transition-shadow duration-150 hover:shadow-[0_2px_8px_rgba(0,0,0,.15)] ${ROT[rot] ?? "border-transparent bg-sec"}`}
      draggable
      role="button"
      tabIndex={0}
      data-id={d.id}
      style={{ borderLeftColor: isLate(d.next_task) ? "var(--danger)" : undefined }}
      onClick={() => onOpen(d.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(d.id))}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(d.id));
        (e.currentTarget as HTMLElement).classList.add("opacity-40");
        onDrag(d);
      }}
      onDragEnd={(e) => {
        (e.currentTarget as HTMLElement).classList.remove("opacity-40");
        onDrag(null);
      }}
    >
      <div className="line-clamp-2 leading-[1.3] font-medium [overflow-wrap:anywhere]">{dtitle(d.title)}</div>
      <div className={C}>
        {d.customer || "Mijozsiz"}
        <Tags d={d} />
      </div>
      <div className="mt-[7px] flex items-center gap-1.5 text-xs">
        <AvaView name={nameOf(d.owner_tg)} />
        <span className="text-[13px] font-semibold tabular-nums">{d.amount && Number(d.amount) ? short(d.amount) : ""}</span>
        <span className={SP} />
        <TaskBadge d={d} />
      </div>
      <div className={`${C} !mt-1`}>
        {st ? `bosqichda ${st} kun` : "bugun o'tdi"}
        {idle ? (
          <>
            {" · "}
            <span className={rot ? idleCls(rot === "rot2") : ""}>{idle} kun tegilmagan</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function BoardView({
  r,
  more,
  drag,
  over,
  zone,
  nameOf,
  onOpen,
  onDrag,
  onMore,
}: {
  r: BoardResp;
  /** "Yana N ta" bilan qo'shilgan kartochkalar (bosqich → bitimlar) */
  more: Record<string, Deal[]>;
  drag: Deal | null;
  over: string;
  zone: (code: string) => Zone;
  nameOf: (tg?: number | null) => string;
  onOpen: (id: number) => void;
  onDrag: (d: Deal | null) => void;
  onMore: (code: string, offset: number) => void;
}) {
  const { open, closed } = boardTotals(r.stages);
  if (!open.length)
    return (
      <Empty icon="layers" title="Bosqichlar yo'q">
        Bu voronkada ochiq bosqich topilmadi.
      </Empty>
    );
  return (
    <>
      <div className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-5 py-3.5 max-md:snap-x max-md:snap-mandatory max-md:scroll-px-3 max-md:px-3 max-md:py-2.5" aria-label="Kanban">
        {open.map((s) => {
          const deals = [...s.deals, ...(more[s.code] ?? [])];
          return (
            <section key={s.code} className={`flex min-h-0 flex-[0_0_272px] flex-col rounded-[10px] bg-fill max-md:basis-[min(300px,84vw)] max-md:snap-start ${over === s.code ? "outline-2 -outline-offset-2 outline-link outline-dashed" : ""}`} data-st={s.code} aria-label={s.name} {...zone(s.code)}>
              <div className="pb-2">
                <div className="h-1 rounded-t-[10px]" style={{ background: s.color || "#8e8e93" }} />
                <div className="flex justify-between gap-1.5 px-3 pt-2 text-[13px] font-semibold [&>span:first-child]:truncate">
                  <span title={s.name}>{s.name}</span>
                  <span className="num">{s.count}</span>
                </div>
                <div className="px-3 pt-0.5 text-xs text-hint tabular-nums">
                  {s.amount && Number(s.amount) ? `${short(s.amount)} so'm` : " "}
                  {Number(s.weighted) && (s.probability ?? 100) < 100 ? (
                    <span title={`Vaznli: summa × ehtimollik ${num(s.probability, 0)}%`}> · ≈ {short(s.weighted)}</span>
                  ) : null}
                  {s.rotten ? (
                    <span className={idleCls(true)} title="Chirigan bitimlar">
                      {" · "}
                      {s.rotten} chirigan
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
                {deals.map((d) => (
                  <Card key={d.id} d={d} nameOf={nameOf} onOpen={onOpen} onDrag={onDrag} />
                ))}
                {!deals.length ? <div className="px-1 py-1.5 text-[12.5px] text-hint">Bitim yo&apos;q</div> : null}
                {s.count > deals.length ? (
                  <button type="button" className={LINKB} onClick={() => onMore(s.code, deals.length)}>
                    Yana {s.count - deals.length} ta
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      <div className={`fixed inset-x-0 bottom-0 z-40 flex gap-2.5 bg-sec px-5 py-3 shadow-[0_-4px_16px_rgba(0,0,0,.18)] transition-transform duration-150 max-md:px-3 max-md:pt-2 max-md:pb-[calc(8px+var(--safe-b))] ${drag ? "translate-y-0" : "translate-y-full"}`} aria-hidden={!drag}>
        {closed.map((s) => (
          <div key={s.code} className={`flex-1 rounded-[10px] border-2 border-dashed p-3.5 text-center font-semibold ${s.kind === "won" ? "border-ok text-ok" : s.kind === "lost" ? "border-danger text-danger" : "border-sep"} ${over === s.code ? "bg-fill" : ""}`} {...zone(s.code)}>
            {s.name}
          </div>
        ))}
      </div>
    </>
  );
}
