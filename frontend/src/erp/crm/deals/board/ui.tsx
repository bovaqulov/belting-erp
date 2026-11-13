// Kanban (faqat ko'rinish): ochiq bosqich ustunlari, kartochkalar, "Yana N ta", pastda yutildi/yutqazildi zonalari.
import { dtitle, num, short } from "@/erp/kit/fmt";
import { Empty } from "@/erp/kit/ui";
import { AvaView, Tags, TaskBadge } from "@/erp/crm/badges";
import { boardTotals, days, isLate, rotLevel, type BoardResp, type Deal } from "@/erp/crm/lib";

/** Ustun/zona uchun sudrash hodisalari (konteyner beradi) */
export type Zone = {
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
};

function Card({ d, nameOf, onOpen, onDrag }: { d: Deal; nameOf: (tg?: number | null) => string; onOpen: (id: number) => void; onDrag: (d: Deal | null) => void }) {
  const st = days(d.stage_since || d.created);
  const idle = days(d.touched || d.updated);
  const rot = rotLevel(d);
  return (
    <div
      className={`card2 ${rot}`}
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
        (e.currentTarget as HTMLElement).classList.add("drag");
        onDrag(d);
      }}
      onDragEnd={(e) => {
        (e.currentTarget as HTMLElement).classList.remove("drag");
        onDrag(null);
      }}
    >
      <div className="t">{dtitle(d.title)}</div>
      <div className="c">
        {d.customer || "Mijozsiz"}
        <Tags d={d} />
      </div>
      <div className="f">
        <AvaView name={nameOf(d.owner_tg)} />
        <span className="amt num">{d.amount && Number(d.amount) ? short(d.amount) : ""}</span>
        <span className="sp" />
        <TaskBadge d={d} />
      </div>
      <div className="c" style={{ marginTop: 4 }}>
        {st ? `bosqichda ${st} kun` : "bugun o'tdi"}
        {idle ? (
          <>
            {" · "}
            <span className={rot ? `idle ${rot === "rot2" ? "bad" : ""}` : ""}>{idle} kun tegilmagan</span>
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
      <div className="ckb" aria-label="Kanban">
        {open.map((s) => {
          const deals = [...s.deals, ...(more[s.code] ?? [])];
          return (
            <section key={s.code} className={`col ${over === s.code ? "over" : ""}`} data-st={s.code} aria-label={s.name} {...zone(s.code)}>
              <div className="ch">
                <div className="cbar" style={{ background: s.color || "#8e8e93" }} />
                <div className="cn">
                  <span title={s.name}>{s.name}</span>
                  <span className="num">{s.count}</span>
                </div>
                <div className="cs">
                  {s.amount && Number(s.amount) ? `${short(s.amount)} so'm` : " "}
                  {Number(s.weighted) && (s.probability ?? 100) < 100 ? (
                    <span title={`Vaznli: summa × ehtimollik ${num(s.probability, 0)}%`}> · ≈ {short(s.weighted)}</span>
                  ) : null}
                  {s.rotten ? (
                    <span className="idle bad" title="Chirigan bitimlar">
                      {" · "}
                      {s.rotten} chirigan
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="cb">
                {deals.map((d) => (
                  <Card key={d.id} d={d} nameOf={nameOf} onOpen={onOpen} onDrag={onDrag} />
                ))}
                {!deals.length ? <div className="cempty">Bitim yo&apos;q</div> : null}
                {s.count > deals.length ? (
                  <button type="button" className="more" onClick={() => onMore(s.code, deals.length)}>
                    Yana {s.count - deals.length} ta
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      <div className={`drop ${drag ? "on" : ""}`} aria-hidden={!drag}>
        {closed.map((s) => (
          <div key={s.code} className={`dz ${s.kind} ${over === s.code ? "over" : ""}`} {...zone(s.code)}>
            {s.name}
          </div>
        ))}
      </div>
    </>
  );
}
