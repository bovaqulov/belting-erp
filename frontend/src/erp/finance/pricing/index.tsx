// Narx siyosati (Mahsulotlar › Narx siyosati): manba — AppSheet (klinli/poliklinli va tishli remen ilovalari).
// Holat (oxirgi sinxron, eskirgan, bog'langan qatorlar), «Yangilash» (rahbariyat, kalitlar sozlangan bo'lsa),
// sozlamalar — QQS, standart eni, chegirma chegaralari (hamma ko'radi), kurs / qat'iy qo'shimcha / yaxlitlash (formula —
// faqat rahbariyat), katalogga bog'lanmagan AppSheet qatorlari (katalogda yo'q yoki belgi/brend farqi).
import { useState } from "react";

import { toast } from "@/erp/kit/env";
import { dt, num } from "@/erp/kit/fmt";
import { LINK_BTN } from "@/erp/kit/layout";
import { Empty, Icon, List, Loaded, Row, Sf, Sh, useLoad } from "@/erp/kit/ui";
import { TWO } from "@/erp/finance/tw";
import { api, post } from "@/erp/finance/api";
import { famTitle, type Policy, type Unmatched } from "@/erp/finance/lib";

type Edit = Record<string, string>;
const EDIT_FIELDS: [keyof Policy, string, boolean][] = [
  ["usd_rate", "Kurs (USD → so'm)", true],
  ["fixed_add", "Qat'iy qo'shimcha, so'm", true],
  ["round_to", "Yaxlitlash, so'm", true],
  ["vat_pct", "QQS, %", false],
  ["default_width", "Standart eni, mm", false],
  ["max_disc_lead", "Chegirma: rahbariyat, %", false],
  ["max_disc_head", "Chegirma: sotuv rahbari, %", false],
  ["max_disc_seller", "Chegirma: sotuvchi, %", false],
];

function Settings({ p, onSaved }: { p: Policy; onSaved: (p: Policy) => void }) {
  const [e, setE] = useState<Edit>(() => Object.fromEntries(EDIT_FIELDS.filter(([k]) => p[k] !== undefined).map(([k]) => [k, String(p[k] ?? "")])));
  const [busy, setBusy] = useState(false);
  const fields = EDIT_FIELDS.filter(([, , secret]) => !secret || p.can_edit);
  if (!p.can_edit)
    return (
      <List>
        {fields.map(([k, label]) => (
          <Row key={k} t={label} val={<span className="num">{num(Number(p[k] ?? 0), 2)}</span>} />
        ))}
      </List>
    );
  const save = async () => {
    setBusy(true);
    try {
      onSaved(await post<Policy>("/app/api/erp/cat/pricing", e));
      toast("Saqlandi");
    } catch (x) {
      toast((x as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <List cls={TWO}>
        {fields.map(([k, label]) => (
          <div key={k} className="field col">
            <label htmlFor={`pp-${k}`}>{label}</label>
            <input id={`pp-${k}`} inputMode="decimal" value={e[k] ?? ""} onChange={(ev) => setE((o) => ({ ...o, [k]: ev.target.value }))} />
          </div>
        ))}
      </List>
      <Sf>
        Rukavdan kesiladigan remen: ⌈tannarx (USD / 1 mm eni yoki qovurg&apos;a) × eni × kurs × (1 + marja) / yaxlitlash⌉ × yaxlitlash + qat&apos;iy
        qo&apos;shimcha. {p.learn ? "Kurs va qat'iy qo'shimcha har sinxronda AppSheet ma'lumotidan aniqlanadi." : "Kurs qo'lda belgilangan — sinxron o'zgartirmaydi."} Formula
        va tannarx — faqat rahbariyatga ko&apos;rinadi.
      </Sf>
      <div className="btns">
        <button className="btn" disabled={busy} onClick={() => void save()}>
          <Icon n="save" /> Saqlash
        </button>
      </div>
    </>
  );
}

function UnmatchedList() {
  const st = useLoad(() => api<Unmatched[]>("/app/api/erp/cat/pricing/unmatched"), []);
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  return (
    <Loaded st={st}>
      {(rs) => {
        const s = q.trim().toLowerCase();
        const f = rs.filter((r) => !s || `${r.mark} ${r.name ?? ""} ${r.brand ?? ""}`.toLowerCase().includes(s));
        return rs.length ? (
          <>
            <Sh t="Katalogga bog'lanmagan AppSheet qatorlari" r={`${rs.length} ta`} />
            <Sf>Katalogda shu belgi va brendli tovar yo&apos;q (yoki nomida brend/uzunlik tizimi boshqacha). Tovar qo&apos;shilsa yoki tahrirlansa — avtomatik bog&apos;lanadi.</Sf>
            <List>
              <div className="field">
                <input type="search" className="!text-left" value={q} placeholder="Belgi, nom yoki brend" aria-label="Bog'lanmaganlarni qidirish" onChange={(e) => setQ(e.target.value)} />
              </div>
              {(all ? f : f.slice(0, 40)).map((r) => (
                <Row
                  key={r.id}
                  t={r.mark}
                  s={[r.name, famTitle(r.family), r.kind, r.brand].filter(Boolean).join(" · ")}
                  val={r.price ? <span className="num">{num(r.price, 0)}</span> : ""}
                  valSmall={r.price ? "so'm" : ""}
                />
              ))}
            </List>
            {!all && f.length > 40 ? (
              <div className="btns">
                <button className="btn sec" onClick={() => setAll(true)}>
                  Hammasini ko&apos;rsatish ({f.length})
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <Sf>AppSheet qatorlarining hammasi katalogga bog&apos;langan.</Sf>
        );
      }}
    </Loaded>
  );
}

export function Pricing() {
  const st = useLoad(() => api<Policy>("/app/api/erp/cat/pricing"), []);
  const [p, setP] = useState<Policy | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Loaded st={st}>
      {(first) => {
        const cur = p ?? first;
        const sync = async () => {
          setBusy(true);
          try {
            setP(await post<Policy>("/app/api/erp/cat/pricing/sync"));
            toast("Narxlar yangilandi");
          } catch (x) {
            toast((x as Error).message, "bad");
          } finally {
            setBusy(false);
          }
        };
        return (
          <div className="mx-auto max-w-[760px]">
            <Sh
              t="Manba — AppSheet"
              r={
                cur.can_edit && cur.configured ? (
                  <button type="button" className={LINK_BTN} disabled={busy} onClick={() => void sync()}>
                    {busy ? "Yangilanmoqda…" : "Hozir yangilash"}
                  </button>
                ) : null
              }
            />
            {cur.sources ? (
              <List>
                <Row
                  icon={cur.stale ? "alert" : "check"}
                  color={cur.stale ? "orange" : "green"}
                  t={cur.synced ? `Oxirgi sinxron: ${dt(cur.synced)}` : "Hali sinxronlanmagan"}
                  s={cur.sync_note ?? undefined}
                  tcls={cur.stale ? "text-st-work" : ""}
                />
                <Row t="AppSheet qatorlari" val={<span className="num">{num(cur.sources, 0)}</span>} valSmall={`${num(cur.sources_linked, 0)} tasi katalogda`} />
                <Row t="Narxi AppSheet'dan tovarlar" val={<span className="num">{num(cur.items_linked, 0)}</span>} />
              </List>
            ) : (
              <Empty icon="coins" title="AppSheet narxlari hali yuklanmagan">
                {cur.configured ? "«Hozir yangilash» bilan yuklang." : "Server .env fayliga AppSheet kalitlari (APPSHEET_VBELT_*, APPSHEET_TIMING_*) qo'yilgach, narxlar har 30 daqiqada yangilanadi."}
              </Empty>
            )}
            {cur.sources && !cur.configured ? (
              <Sf>Jonli ulanish yo&apos;q: AppSheet kalitlari serverda sozlanmagan — narxlar oxirgi yuklangan nusxadan. Kalitlar qo&apos;yilgach har 30 daqiqada yangilanadi.</Sf>
            ) : cur.stale && cur.sources ? (
              <Sf>
                <span className="text-st-work">Narxlar 1 kundan eski — AppSheet bilan aloqani tekshiring.</span>
              </Sf>
            ) : null}
            <Sh t="Sozlamalar" r={cur.can_edit ? null : "faqat rahbariyat o'zgartiradi"} />
            <Settings key={cur.synced ?? "0"} p={cur} onSaved={setP} />
            <Sf>
              Narx tartibi: kenglik bo&apos;yicha qo&apos;lda qo&apos;yilgan narx → AppSheet (tovar bog&apos;langan bo&apos;lsa) → qo&apos;lda narx. Narxlar QQSsiz, QQS {num(cur.vat_pct, 0)}%
              alohida. CRM&apos;da chegirma chegarasi rolga qarab (yuqoridagi foizlar).
            </Sf>
            <UnmatchedList />
          </div>
        );
      }}
    </Loaded>
  );
}
