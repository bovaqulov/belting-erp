// Tanlash oynalari: mijoz (CRM — foydalanuvchi huquqi bilan: sotuvchi — o'z mijozlari) va tovar (katalog — variant
// bo'yicha qatorlar, narx QQS bilan, erkin qoldiq). Qidiruv yozish to'xtagach (250 ms).
import { useEffect, useState } from "react";

import { api } from "@/erp/kit/env";
import { Empty, List, Loaded, Row, Sheet, useLoad } from "@/erp/kit/ui";

import { sum, type Contact, type ItemHit } from "./lib";

function useDebounced(v: string): string {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v.trim()), 250);
    return () => clearTimeout(t);
  }, [v]);
  return d;
}

export function CustomerPicker({ onPick, onClose }: { onPick: (c: Contact) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const st = useLoad(() => api<Contact[]>(`/app/api/erp/sales/customers?q=${encodeURIComponent(dq)}`), [dq]);
  return (
    <Sheet title="Mijoz" onClose={onClose}>
      <List>
        <div className="field">
          <input type="search" className="!text-left" value={q} placeholder="Nom, STIR yoki telefon" aria-label="Mijoz qidirish" onChange={(e) => setQ(e.target.value)} />
        </div>
      </List>
      <Loaded st={st}>
        {(rs) =>
          rs.length ? (
            <List cls="mt-2">
              {rs.map((c) => (
                <Row
                  key={c.id}
                  icon="users"
                  color="blue"
                  t={c.name}
                  s={[c.inn ? `STIR ${c.inn}` : null, c.phones[0] ? `+${c.phones[0]}` : null, c.address].filter(Boolean).join(" · ")}
                  chev
                  onClick={() => {
                    onPick(c);
                    onClose();
                  }}
                />
              ))}
            </List>
          ) : (
            <Empty icon="users" title="Mijoz topilmadi">
              Yangi mijoz CRM&apos;da qo&apos;shiladi (sotuvchiga biriktirilgan mijozlar ko&apos;rinadi).
            </Empty>
          )
        }
      </Loaded>
    </Sheet>
  );
}

export function ItemPicker({ vat, onPick, onClose }: { vat: string; onPick: (h: ItemHit) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const st = useLoad(() => (dq ? api<ItemHit[]>(`/app/api/erp/sales/items?q=${encodeURIComponent(dq)}&vat=${encodeURIComponent(vat)}`) : Promise.resolve([] as ItemHit[])), [dq, vat]);
  return (
    <Sheet title="Tovar qo'shish" onClose={onClose}>
      <List>
        <div className="field">
          <input type="search" className="!text-left" value={q} placeholder="Nom, belgi (1040 8M), artikul" aria-label="Tovar qidirish" onChange={(e) => setQ(e.target.value)} />
        </div>
      </List>
      <Loaded st={st}>
        {(rs) =>
          rs.length ? (
            <List cls="mt-2">
              {rs.map((h) => (
                <Row
                  key={`${h.item_id}-${h.char_id ?? 0}`}
                  icon="package"
                  color={Number(h.free) > 0 ? "green" : "gray"}
                  t={h.char ? `${h.name} · ${h.char}` : h.name}
                  s={`qoldiq ${sum(h.free)} ${h.unit}${h.sku ? ` · ${h.sku}` : ""}`}
                  val={h.price_vat ? <span className="num">{sum(h.price_vat)}</span> : "narxsiz"}
                  valSmall={h.price_vat ? "QQS bilan" : ""}
                  chev
                  onClick={() => onPick(h)}
                />
              ))}
            </List>
          ) : (
            <Empty icon="search" title={dq ? "Topilmadi" : "Qidiring"}>
              {dq ? "Boshqa so'z bilan qidiring." : "Tovar nomi, remen belgisi yoki artikul."}
            </Empty>
          )
        }
      </Loaded>
    </Sheet>
  );
}
