// Bitim paneli (faqat ko'rinish): ramka (o'ngdan; telefonda to'liq ekran), yuklanish/xato holati, sarlavha (nom,
// voronka, bosqich strelkalari, yakunlash, bosqich ko'rsatmasi), chapda — maydonlar va hujjatlar, o'ngda — tovarlar va tarix.
import type { ReactNode, RefObject } from "react";

import { d8, dnum, dt, dtitle, num } from "@/erp/kit/fmt";
import { Empty, Icon, Skeleton } from "@/erp/kit/ui";
import { DST, KIND, SRC, type DealDetail, type Meta, type Stage } from "@/erp/crm/lib";

export function DrawerFrame({
  on,
  title,
  panelRef,
  onClose,
  children,
}: {
  on: boolean;
  title: string;
  panelRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className={`ov ${on ? "on" : ""}`} onClick={onClose} />
      <div className={`drw ${on ? "on" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={panelRef}>
        {children}
      </div>
    </>
  );
}

export const DrawerLoading = ({ err, onRetry, onClose }: { err: string; onRetry: () => void; onClose: () => void }) => (
  <>
    <div className="dh">
      <div className="tt">
        <span className="sp" />
        <button type="button" className="x" onClick={onClose} aria-label="Yopish">
          <Icon n="x" />
        </button>
      </div>
    </div>
    {err ? (
      <Empty icon="alert" title="Bitimni ochib bo'lmadi">
        {err}
        <div className="btns">
          <button className="btn sec" onClick={onRetry}>
            Qayta urinish
          </button>
        </div>
      </Empty>
    ) : (
      <div style={{ paddingTop: 16 }}>
        <Skeleton />
      </div>
    )}
  </>
);

export function DealBodyView({
  d,
  st,
  pipe,
  pipelines,
  users,
  opn,
  cur,
  isOpen,
  amount,
  touched,
  inStage,
  items,
  activity,
  onClose,
  onSave,
  onPipe,
  onMove,
  onFinish,
  onAmount,
  onAmountBlur,
  onPdf,
}: {
  d: DealDetail;
  st: Stage | undefined;
  pipe: string;
  pipelines: Meta["pipelines"];
  users: Meta["users"];
  /** joriy voronkaning ochiq bosqichlari */
  opn: Stage[];
  cur: number;
  isOpen: boolean;
  amount: string;
  touched: number | null;
  inStage: number | null;
  /** o'ng ustun: tovarlar va tarix (konteynerlar) */
  items: ReactNode;
  activity: ReactNode;
  onClose: () => void;
  onSave: (field: string, value: unknown) => void;
  onPipe: (code: string) => void;
  onMove: (code: string) => void;
  onFinish: () => void;
  onAmount: (v: string) => void;
  onAmountBlur: () => void;
  onPdf: (docId: number) => void;
}) {
  return (
    <>
      <div className="dh">
        <div className="tt">
          <input
            defaultValue={dtitle(d.title)}
            aria-label="Bitim nomi"
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== dtitle(d.title)) onSave("title", v);
            }}
          />
          <span className="id num">#{d.id}</span>
          <a className="b ic" href={`/app/erp/savdo?mobile=1&deal=${d.id}`} target="_blank" rel="noreferrer" title="Telefon ko'rinishida" aria-label="Telefon ko'rinishida">
            <Icon n="link" />
          </a>
          <button type="button" className="x" onClick={onClose} aria-label="Yopish">
            <Icon n="x" />
          </button>
        </div>
        <div className="prow">
          <select className="sel sm" aria-label="Voronka" value={pipe} onChange={(e) => onPipe(e.target.value)}>
            {pipelines.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
          {!isOpen && st ? (
            <span className="pill">
              <i style={{ background: st.color || "#888" }} />
              {st.name}
              {d.lost_reason ? " · " + d.lost_reason : ""}
            </span>
          ) : null}
        </div>
        <div className="chrow">
          <div className="chev" role="group" aria-label="Bosqichlar">
            {opn.map((s, i) => {
              const done = isOpen && i <= cur;
              return (
                <button
                  key={s.code}
                  type="button"
                  className={`chv ${done ? "done" : ""} ${s.code === d.stage ? "cur" : ""}`}
                  style={done ? { background: s.color || "var(--link)" } : undefined}
                  aria-current={s.code === d.stage ? "step" : undefined}
                  title={s.name}
                  onClick={() => onMove(s.code)}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
          <button type="button" className="b fin" onClick={onFinish}>
            <Icon n="check" /> Yakunlash
          </button>
        </div>
        {isOpen && st?.guide ? (
          <div className="guide">
            <b>Bu bosqichda:</b>
            {st.guide}
          </div>
        ) : null}
      </div>
      <div className="db">
        <div className="dl">
          <div className="box">
            <h4>Bitim haqida</h4>
            <div className="fr">
              <span>Mijoz</span>
              <div>
                {d.counterparty_id ? (
                  <a href={`/app/erp/savdo?customer=${d.counterparty_id}`} target="_blank" rel="noreferrer">
                    {d.customer || "—"}
                  </a>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <label className="fr">
              <span>Summa</span>
              <input
                inputMode="decimal"
                value={amount}
                placeholder="0"
                onChange={(e) => onAmount(e.target.value)}
                onBlur={onAmountBlur}
              />
            </label>
            <label className="fr">
              <span>Yopilish sanasi</span>
              <input type="date" defaultValue={d.close_date || ""} onChange={(e) => onSave("close_date", e.target.value || null)} />
            </label>
            <label className="fr">
              <span>Ehtimollik</span>
              <input
                inputMode="decimal"
                defaultValue={d.probability != null ? String(d.probability) : ""}
                placeholder={st?.probability != null ? `${num(st.probability, 0)}% (bosqich)` : "%"}
                onBlur={(e) => e.target.value !== (d.probability != null ? String(d.probability) : "") && onSave("probability", dnum(e.target.value) || null)}
              />
            </label>
            <label className="fr">
              <span>Mas&apos;ul</span>
              <select defaultValue={d.owner_tg != null ? String(d.owner_tg) : ""} onChange={(e) => onSave("owner_tg", e.target.value || null)}>
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.tg_id} value={u.tg_id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="fr">
              <span>Manba</span>
              <select defaultValue={d.source || ""} onChange={(e) => onSave("source", e.target.value || null)}>
                {Object.entries(SRC).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
                {d.source && !(d.source in SRC) ? <option value={d.source}>{d.source}</option> : null}
              </select>
            </label>
            <label className="fr top">
              <span>Ehtiyoj</span>
              <textarea defaultValue={d.need || ""} placeholder="Mijozga nima kerak?" onBlur={(e) => e.target.value !== (d.need || "") && onSave("need", e.target.value)} />
            </label>
            <div className="fr">
              <span>Ochilgan</span>
              <div>{dt(d.created)}</div>
            </div>
            <div className="fr">
              <span>Oxirgi faollik</span>
              <div>
                {dt(d.touched || d.updated)}
                {touched ? ` · ${touched} kun oldin` : ""}
              </div>
            </div>
            <div className="fr">
              <span>Bosqichda</span>
              <div>
                {dt(d.stage_since)}
                {inStage ? ` · ${inStage} kun` : ""}
              </div>
            </div>
            {d.closed ? (
              <div className="fr">
                <span>Yopilgan</span>
                <div>{dt(d.closed)}</div>
              </div>
            ) : null}
            {d.bx_id ? (
              <div className="fr">
                <span>Bitrix</span>
                <div className="code">#{d.bx_id}</div>
              </div>
            ) : null}
          </div>
          <div className="box">
            <h4>
              Hujjatlar <span>{d.docs.length || ""}</span>
            </h4>
            {d.docs.map((x) => (
              <div
                key={x.id}
                className="dlr"
                role="link"
                tabIndex={0}
                onClick={(e) => !(e.target as HTMLElement).closest("[data-pdf]") && window.open(`/app/erp/savdo?mobile=1&deal=${d.id}&doc=${x.id}`, "_blank")}
                onKeyDown={(e) => e.key === "Enter" && window.open(`/app/erp/savdo?mobile=1&deal=${d.id}&doc=${x.id}`, "_blank")}
              >
                <Icon n={x.kind === "order" ? "cart" : "file"} />
                <div className="m">
                  <div>
                    <span className="code">{x.number || "qoralama"}</span> · {KIND[x.kind] || x.kind}
                  </div>
                  <div className="s">
                    {d8(x.date)} · {x.status === "draft" ? "qoralama" : (x.state && DST[x.state]) || "o'tkazilgan"}
                  </div>
                </div>
                <b className="num">{num(x.total, 0)}</b>
                {["quote", "order"].includes(x.kind) ? (
                  <button type="button" className="b ic" data-pdf title="PDF" aria-label="PDF" onClick={() => onPdf(x.id)}>
                    <Icon n="download" />
                  </button>
                ) : null}
              </div>
            ))}
            {!d.docs.length ? (
              <div className="dlr static">
                <span className="s">Hujjat yo&apos;q — tovarlardan taklif yoki buyurtma tuzing</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="dr">
          {items}
          {activity}
        </div>
      </div>
    </>
  );
}
