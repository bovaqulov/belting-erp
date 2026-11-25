// Kanban (faqat ko'rinish): ochiq bosqich ustunlari, kartochkalar, "Yana N ta", pastda yutildi/yutqazildi zonalari.
import { dtitle, short } from "@/erp/kit/fmt";
import { Empty, Icon } from "@/erp/kit/ui";
import { AvaView, TaskBadge } from "@/erp/crm/badges";
import { boardTotals, isLate, rotLevel, type BoardResp, type Deal } from "@/erp/crm/lib";
import { LINKB, SP } from "@/erp/crm/tw";

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
  const rot = rotLevel(d);
  const title = dtitle(d.title);
  // nom mijoz nomidan yasalgan bo'lsa (tovarsiz bitim) — mijoz qatori takrorlanmaydi
  const sameName = !!d.customer && title.trim().toLowerCase() === d.customer.trim().toLowerCase();
  return (
    <div
      className={`cursor-pointer rounded-lg border-l-[3px] px-2.5 py-2 shadow-1 transition-shadow duration-150 hover:shadow-[0_2px_8px_rgba(0,0,0,.15)] ${ROT[rot] ?? "border-transparent bg-sec"}`}
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
      <div className="line-clamp-2 text-[13.5px] leading-[1.3] font-semibold [overflow-wrap:anywhere]">{title}</div>
      {!sameName || d.sla_late ? (
        <div className={`${C} flex items-center gap-x-1.5`}>
          {d.sla_late ? (
            <span className="flex-none font-semibold text-danger" title={`Bosqich muddati (${d.sla_hours} soat) o'tdi`}>
              ⏱
            </span>
          ) : null}
          <span className="min-w-0 truncate">{sameName ? "" : d.customer || "Mijozsiz"}</span>
        </div>
      ) : null}
      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
        <AvaView name={nameOf(d.owner_tg)} />
        <span className="text-[13px] font-semibold whitespace-nowrap tabular-nums">{d.amount && Number(d.amount) ? short(d.amount) : ""}</span>
        <span className={SP} />
        <TaskBadge d={d} />
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
  onNew,
  kbRef,
  active,
  onScroll,
  onPick,
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
  /** birinchi ("Yangi") ustundagi "+" — yangi bitim oynasi (yangi bitim shu bosqichga tushadi) */
  onNew: () => void;
  /** telefon: ustunlar konteyneri, joriy ustun, surish va tasmadan tanlash */
  kbRef: React.RefObject<HTMLDivElement | null>;
  active: number;
  onScroll: () => void;
  onPick: (i: number) => void;
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
      <nav className="flex flex-none gap-1.5 overflow-x-auto border-b border-sep px-3 py-2 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden" aria-label="Bosqichlar">
        {open.map((s, i) => (
          <button
            key={s.code}
            type="button"
            aria-current={i === active ? "true" : undefined}
            onClick={() => onPick(i)}
            className={`flex h-9 flex-none coarse:h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap ${i === active ? "border-transparent bg-btn font-semibold text-btn-fg" : "border-sep bg-sec text-sub"}`}
          >
            <i className="size-2 flex-none rounded-full" style={{ background: s.color || "#8e8e93" }} aria-hidden="true" />
            {s.name}
            <b className={`tabular-nums ${i === active ? "" : "text-hint"}`}>{s.count}</b>
          </button>
        ))}
      </nav>
      <div ref={kbRef} onScroll={onScroll} className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-5 py-3.5 max-md:snap-x max-md:snap-mandatory max-md:gap-3 max-md:px-3 max-md:py-2 max-md:[scrollbar-width:none]" aria-label="Kanban">
        {open.map((s, i) => {
          const deals = [...s.deals, ...(more[s.code] ?? [])];
          return (
            <section key={s.code} className={`flex min-h-0 flex-[0_0_272px] flex-col rounded-[10px] bg-fill max-md:basis-[calc(100vw-24px)] max-md:snap-center ${over === s.code ? "outline-2 -outline-offset-2 outline-link outline-dashed" : ""}`} data-st={s.code} aria-label={s.name} {...zone(s.code)}>
              <div className="pb-2">
                <div className="h-1 rounded-t-[10px]" style={{ background: s.color || "#8e8e93" }} />
                <div className="flex justify-between gap-1.5 px-3 pt-2 text-[13px] font-semibold [&>span:first-child]:truncate">
                  <span title={s.name}>{s.name}</span>
                  <span className="num">{s.count}</span>
                </div>
                <div className="px-3 pt-0.5 text-xs text-hint tabular-nums">
                  {s.amount && Number(s.amount) ? `${short(s.amount)} so'm` : " "}
                </div>
              </div>
              {i === 0 ? (
                <div className="px-2 pb-1.5">
                  <button
                    type="button"
                    className="flex h-9 w-full items-center justify-center rounded-lg border border-dashed border-sep text-hint transition-colors duration-150 hover:border-link hover:bg-sec hover:text-link focus-visible:border-link focus-visible:text-link coarse:h-11"
                    aria-label={`${s.name}: yangi bitim`}
                    title="Yangi bitim"
                    onClick={onNew}
                  >
                    <Icon n="plus" />
                  </button>
                </div>
              ) : null}
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
