// Hujjat oynasi (faqat ko'rinish): sarlavha va holat, mijoz, qatorlar, narxlash, jami; yuborish (mijoz chatlari, Didox);
// chop etish / PDF / tasdiqlash.
import { useState } from "react";

import { dt, num } from "@/erp/kit/fmt";
import { Modal } from "@/erp/kit/modal";
import { Icon, Loaded } from "@/erp/kit/ui";
import { DST, priced, type DocFull } from "@/erp/crm/lib";
import { chOf, type TgChat } from "@/erp/crm/telegram/tg.lib";

import { docTitle } from "./doc.lib";

/** Didox holati rangi: 0 qoralama — sariq, 1/2 kutilmoqda — ko'k, 3 imzolangan — yashil, 4+ — qizil */
const dxTone = (s: number | null) =>
  s === 3 ? "bg-ok/15 text-ok" : s === 0 ? "bg-warn/15 text-warn" : s === 1 || s === 2 ? "bg-link/15 text-link" : "bg-danger/15 text-danger";

function SendBox({
  d,
  chats,
  busy,
  onSend,
  onDidox,
  onDidoxStatus,
}: {
  d: DocFull;
  chats: TgChat[];
  busy: string;
  onSend: (c: TgChat) => void;
  onDidox: (subtype: number) => void;
  onDidoxStatus: () => void;
}) {
  const dx = d.didox;
  const [sub, setSub] = useState<number>(d.kind === "order" ? 4 : 6);
  const head = "mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-sub [&_svg.i]:size-[15px]";
  return (
    <div className="grid gap-3 rounded-xl border border-sep p-3.5 min-[700px]:grid-cols-2">
      <div className="min-w-0">
        <div className={head}>
          <Icon n="send" /> Mijozga chat orqali
        </div>
        {chats.length ? (
          <div className="flex flex-col gap-1.5">
            {chats.map((c) => {
              const ch = chOf(c.channel);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="b h-9 min-w-0 justify-start gap-2 px-2.5 text-[13px] coarse:h-11"
                  disabled={!!busy || !c.can_send}
                  title={c.can_send ? `PDF ${ch.name} orqali yuboriladi` : "Bu chatga yozib bo'lmaydi"}
                  onClick={() => onSend(c)}
                >
                  <span className="contents [&_svg.i]:size-4" style={{ color: ch.color }}>
                    <Icon n={ch.icon} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{c.title}</span>
                  <span className="flex-none text-[11.5px] text-hint">{busy === `send-${c.id}` ? "yuborilmoqda…" : c.channel === "ig" ? "matn" : "PDF"}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="m-0 text-[12.5px] leading-[1.45] text-hint">Bu mijozga biriktirilgan chat yo&apos;q. Chat mijozga biriktirilsa, hujjat shu yerdan bir bosishda yuboriladi.</p>
        )}
      </div>
      <div className="min-w-0">
        <div className={head}>
          <Icon n="shield-check" /> Didox (elektron hujjat)
          {dx?.status != null ? <span className={`ml-auto rounded-full px-2 py-px text-[11px] font-semibold ${dxTone(dx.status)}`}>{dx.status_text}</span> : null}
        </div>
        {!dx?.enabled ? (
          <p className="m-0 text-[12.5px] leading-[1.45] text-hint">
            Didox hali ulanmagan — administrator kalitlarni (partner token, STIR, parol) qo&apos;shgach, hujjat shu yerdan Didox&apos;ga yuboriladi.
          </p>
        ) : dx.id ? (
          <div className="flex flex-col gap-1.5 text-[12.5px]">
            <span className="text-hint">
              ID: <span className="font-code text-sub">{dx.id}</span>
              {dx.at ? ` · ${dt(dx.at)}` : ""}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="b h-8 gap-1 px-2.5 text-[12.5px] coarse:h-11" disabled={!!busy} onClick={onDidoxStatus}>
                <Icon n="refresh" /> Holatni yangilash
              </button>
              <a className="b pri h-8 gap-1 px-2.5 text-[12.5px] no-underline coarse:h-11" href={dx.url} target="_blank" rel="noreferrer">
                <Icon n="link" /> Didox&apos;da imzolash
              </a>
            </div>
            {dx.status === 0 ? <span className="text-hint">Qoralama tayyor — Didox kabinetida E-IMZO bilan imzolab mijozga yuboring.</span> : null}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <select className="sel h-9 w-full text-[13px]" value={sub} aria-label="Didox hujjat turi" onChange={(e) => setSub(Number(e.target.value))}>
              {dx.subtypes.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="button" className="b pri h-9 gap-1.5 text-[13px] coarse:h-11" disabled={!!busy || !d.meta?.inn} onClick={() => onDidox(sub)}>
              <Icon n="upload" /> {busy === "didox" ? "Yaratilmoqda…" : "Didox'ga qoralama"}
            </button>
            {!d.meta?.inn ? <span className="text-[12px] text-warn">Mijoz STIRi yo&apos;q — mijoz kartochkasida kiriting.</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function DocView({
  st,
  busy,
  chats,
  onClose,
  onPrint,
  onPdf,
  onConfirm,
  onSend,
  onDidox,
  onDidoxStatus,
}: {
  st: { data: DocFull | undefined; err: string; net?: boolean; reload?: () => Promise<void> };
  /** bajarilayotgan amal kaliti ("" — bo'sh) */
  busy: string;
  chats: TgChat[];
  onClose: () => void;
  onPrint: (d: DocFull) => void;
  onPdf: (d: DocFull) => void;
  onConfirm: () => void;
  onSend: (c: TgChat) => void;
  onDidox: (subtype: number) => void;
  onDidoxStatus: () => void;
}) {
  const d = st.data;
  return (
    <Modal title={d ? docTitle(d) : "Hujjat"} wide onClose={onClose}>
      <Loaded st={st}>
        {(d) => {
          const m = d.meta || {};
          const p = priced(Number(m.sub || 0), m);
          const draft = d.status === "draft";
          return (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${draft ? "bg-warn/15 text-warn" : "bg-ok/15 text-ok"}`}>
                  {draft ? "Qoralama" : (d.state && DST[d.state]) || "O'tkazilgan"}
                </span>
                <span className="text-hint">{d.date}</span>
                <span className="min-w-0 truncate text-hint">· {d.deal_title}</span>
              </div>
              <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-xl bg-sec px-3.5 py-2.5 text-[13px] [&>span]:text-hint">
                <span>Mijoz</span>
                <b className="font-medium">{m.customer || "—"}</b>
                {m.inn ? (
                  <>
                    <span>STIR</span>
                    <span className="!text-fg tabular-nums">{m.inn}</span>
                  </>
                ) : null}
                {m.location ? (
                  <>
                    <span>Yetkazish</span>
                    <span className="!text-fg">{m.location}</span>
                  </>
                ) : null}
              </div>
              {m.restored ? <p className="m-0 text-xs text-hint">Eski hujjat: qatorlar bitimning hozirgi tovarlaridan ko&apos;rsatilmoqda.</p> : null}
              <ul className="m-0 list-none rounded-xl border border-sep p-0">
                {d.lines.map((x, i) => (
                  <li key={i} className="flex items-start gap-3 border-t border-sep px-3.5 py-2.5 first:border-t-0">
                    <span className="w-5 flex-none pt-px text-xs text-hint tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] leading-snug font-medium break-words">{x.name}</span>
                      <span className="block text-xs text-hint tabular-nums">
                        {num(x.qty, 3)} {x.unit || ""} × {num(x.price, 0)}
                        {Number(x.discount) ? ` · −${num(x.discount, 2)}%` : ""}
                      </span>
                    </span>
                    <b className="flex-none text-[13.5px] whitespace-nowrap tabular-nums">{num(x.amount, 0)}</b>
                  </li>
                ))}
                {!d.lines.length ? <li className="px-3.5 py-3 text-[13px] text-hint">Qatorlar yo&apos;q</li> : null}
              </ul>
              <div className="ml-auto w-full max-w-[340px] text-[13px] [&>div]:flex [&>div]:justify-between [&>div]:py-0.5 [&_b]:tabular-nums">
                <div>
                  <span className="text-hint">Tovarlar</span>
                  <b className="font-normal">{num(p.sub, 0)}</b>
                </div>
                {p.disc ? (
                  <div>
                    <span className="text-hint">Chegirma {num(m.discount, 2)}%</span>
                    <b className="font-normal text-danger">−{num(p.disc, 0)}</b>
                  </div>
                ) : null}
                {p.mark ? (
                  <div>
                    <span className="text-hint">Ustama {num(m.markup, 2)}%</span>
                    <b className="font-normal text-ok">+{num(p.mark, 0)}</b>
                  </div>
                ) : null}
                {p.log ? (
                  <div>
                    <span className="text-hint">Logistika</span>
                    <b className="font-normal">+{num(p.log, 0)}</b>
                  </div>
                ) : null}
                <div className="mt-1 border-t border-sep pt-1.5 text-[15px]">
                  <span className="font-semibold">Jami</span>
                  <b>{num(d.total, 0)} so&apos;m</b>
                </div>
              </div>
              <SendBox d={d} chats={chats} busy={busy} onSend={onSend} onDidox={onDidox} onDidoxStatus={onDidoxStatus} />
              <div className="flex flex-wrap justify-end gap-2 border-t border-sep pt-3 max-[599px]:[&_.b]:flex-1">
                <button type="button" className="b gap-1.5" onClick={() => onPrint(d)}>
                  <Icon n="printer" /> Chop etish
                </button>
                <button type="button" className="b gap-1.5" disabled={!!busy} onClick={() => onPdf(d)}>
                  <Icon n="download" /> PDF yuklab olish
                </button>
                {draft && d.kind === "order" ? (
                  <button type="button" className="b pri gap-1.5" disabled={!!busy} onClick={onConfirm}>
                    <Icon n="check" /> Tasdiqlash
                  </button>
                ) : null}
              </div>
            </div>
          );
        }}
      </Loaded>
    </Modal>
  );
}
