// Umumiy: kanallar (bog'langan kartochkalar / boshqariladigan, qoldiq jo'natish holati), bugungi ishlar (yig'ilmagan
// buyurtmalar, javobsiz sharhlar, jo'natish xatolari) va kartochka auditi (muammo → ro'yxat → "Xato emas").
import { useState } from "react";

import { LINK_BTN, WIDE_COLS } from "@/erp/kit/layout";
import { toast } from "@/erp/kit/env";
import { num } from "@/erp/kit/fmt";
import { Empty, List, Loaded, Row, Sf, Sh, Sheet, useLoad } from "@/erp/kit/ui";
import { api, P, post } from "@/erp/marketplace/api";
import { useMk } from "@/erp/marketplace/context";
import { CHN, issueDetail, SEV_COLOR, sourcesText, type AuditSum, type Issue, type OrderCh, type Overview as O, type View } from "@/erp/marketplace/lib";

export function Overview({ onGo }: { onGo: (v: View) => void }) {
  const st = useLoad(() => api<O>(`${P}/overview`), []);
  const [issue, setIssue] = useState<AuditSum | null>(null);
  return (
    <Loaded st={st}>
      {(o) => (
        <>
          <Channels o={o} onGo={(ch) => onGo({ home: false, ch, sec: "products" })} />
          <Sf>Qoldiq manbasi — {sourcesText(o.sources)}. Omborda ERP inventarizatsiyasi o&apos;tkazilgach, manba o&apos;zi ERP&apos;ga o&apos;tadi.</Sf>
          <div className={WIDE_COLS}>
            <div>
              <Sh t="Bugun" />
              <Today o={o} onGo={onGo} />
            </div>
            <div>
              <Audit items={o.audit} onOpen={setIssue} onRan={() => void st.reload()} />
            </div>
          </div>
          {issue ? <IssueSheet a={issue} onClose={() => setIssue(null)} onMuted={() => void st.reload()} /> : null}
        </>
      )}
    </Loaded>
  );
}

function Channels({ o, onGo }: { o: O; onGo: (ch: OrderCh) => void }) {
  return (
    <div className="tiles mt-3 !grid-cols-3 [&_.l]:[overflow-wrap:anywhere] max-[420px]:[&_.tile]:p-2.5 max-[420px]:[&_.v]:text-[19px] [&_.v_small]:ml-0.5">
      {(Object.entries(o.channels) as [OrderCh, O["channels"][OrderCh]][]).map(([k, c]) => {
        const managed = c.n - c.off;
        const full = c.linked >= managed;
        return (
          <button key={k} type="button" className={`tile !flex w-full cursor-pointer flex-col border-0 text-left [font:inherit] ${full ? "ok" : ""}`} onClick={() => onGo(k)} aria-label={`${c.name}: ${c.linked} / ${managed} bog'langan`}>
            <div className="l">{c.name}</div>
            <div className="v num">
              {num(c.linked, 0)}
              <small> / {num(managed, 0)}</small>
            </div>
            <div className="l">bog&apos;langan · {c.push_stock ? "qoldiq avtomatik" : "qoldiq o'chiq"}</div>
          </button>
        );
      })}
    </div>
  );
}

function Today({ o, onGo }: { o: O; onGo: (v: View) => void }) {
  return (
    <List>
      <Row
        icon="inbox"
        color={o.orders.soon ? "red" : "blue"}
        t="Yig'ilmagan buyurtmalar"
        tcls="wrap2"
        val={num(o.orders.n, 0)}
        valSmall={o.orders.soon ? `${o.orders.soon} tasi muddatga yaqin` : ""}
        chev
        onClick={() => onGo({ home: false, ch: "wb", sec: "orders" })}
      />
      <Row
        icon="message"
        color={o.reviews.bad ? "red" : "purple"}
        t="Javobsiz sharh va savollar"
        tcls="wrap2"
        val={num(o.reviews.n, 0)}
        valSmall={o.reviews.bad ? `${o.reviews.bad} ta salbiy` : ""}
        chev
        onClick={() => onGo({ home: false, ch: "wb", sec: "reviews" })}
      />
      <Row
        icon="alert"
        color={o.push_errors ? "red" : "gray"}
        t="Jo'natish xatolari (24 soat)"
        val={num(o.push_errors, 0)}
        chev
        onClick={() => onGo({ home: false, ch: "wb", sec: "stock" })}
      />
    </List>
  );
}

function Audit({ items, onOpen, onRan }: { items: AuditSum[]; onOpen: (a: AuditSum) => void; onRan: () => void }) {
  const { admin } = useMk();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    toast("Audit ishlamoqda… (1–2 daqiqa)", "info");
    try {
      const r = await post<{ cards: number }>(`${P}/audit/run`);
      toast(`Tekshirildi: ${num(r.cards, 0)} ta kartochka`);
      onRan();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Sh
        t="Kartochka auditi"
        r={
          admin ? (
            <button type="button" className={LINK_BTN} disabled={busy} onClick={() => void run()}>
              Hozir tekshirish
            </button>
          ) : null
        }
      />
      <List>
        {items.length ? (
          items.map((a) => (
            <Row key={`${a.code}|${a.channel}`} icon="alert" color={SEV_COLOR[a.severity]} t={a.text} s={CHN[a.channel]} val={num(a.n, 0)} chev onClick={() => onOpen(a)} />
          ))
        ) : (
          <Row icon="check" color="green" t="Muammo topilmadi" />
        )}
      </List>
    </>
  );
}

function IssueSheet({ a, onClose, onMuted }: { a: AuditSum; onClose: () => void; onMuted: () => void }) {
  const st = useLoad(() => api<Issue[]>(`${P}/audit?code=${encodeURIComponent(a.code)}&ch=${a.channel}`), [a.code, a.channel]);
  const [gone, setGone] = useState<number[]>([]);
  const mute = async (id: number) => {
    try {
      await post(`${P}/audit/${id}/mute`);
      setGone((g) => [...g, id]);
      toast("Belgilandi");
      onMuted();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <Sheet title={`${a.text} · ${CHN[a.channel]}`} onClose={onClose}>
      <Loaded st={st}>
        {(rs) => {
          const left = rs.filter((x) => !gone.includes(x.id));
          return left.length ? (
            <>
              <List>
                {left.map((x) => (
                  <Row
                    key={x.id}
                    t={x.title || x.ext_id}
                    tcls="wrap2"
                    s={issueDetail(x)}
                    scls="ml"
                    right={
                      <button type="button" className="chip" onClick={() => void mute(x.id)}>
                        Xato emas
                      </button>
                    }
                  />
                ))}
              </List>
              <Sf>«Xato emas» — bu kartochkada shu muammo boshqa ko&apos;rsatilmaydi.</Sf>
            </>
          ) : (
            <Empty icon="check" title="Ro'yxat bo'sh" />
          );
        }}
      </Loaded>
    </Sheet>
  );
}
