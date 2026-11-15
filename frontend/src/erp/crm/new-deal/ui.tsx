// Yangi bitim oynasi (faqat ko'rinish): mijoz qidiruvi va natijalari, nom, summa, mas'ul, manba, ehtiyoj.
import type { RefObject } from "react";

import { Modal } from "@/erp/kit/modal";
import { SRC, type Customer, type Meta } from "@/erp/crm/lib";
import type { TgChat } from "@/erp/crm/telegram/tg.lib";

export type DealForm = { title: string; amount: string; owner: string; source: string; need: string };

export function NewDealView({
  cq,
  cp,
  shown,
  v,
  titleRef,
  userList,
  users,
  set,
  tgChat,
  tgHits,
  onPickTg,
  onClearTg,
  onCq,
  onPick,
  onClose,
  onOk,
}: {
  cq: string;
  cp: Customer | null;
  /** qidiruv natijalari (mijoz tanlanmagan bo'lsa) */
  shown: Customer[] | null;
  v: DealForm;
  titleRef: RefObject<HTMLInputElement | null>;
  userList: Meta["users"];
  users: Record<number, string>;
  set: (k: keyof DealForm) => (e: { target: { value: string } }) => void;
  /** tanlangan Telegram chati (bitim mijoziga biriktiriladi) */
  tgChat: TgChat | null;
  /** mijoz maydoni bo'yicha o'z Telegram chatlari */
  tgHits: TgChat[];
  onPickTg: (c: TgChat) => void;
  onClearTg: () => void;
  onCq: (v: string) => void;
  onPick: (c: Customer) => void;
  onClose: () => void;
  onOk: () => Promise<boolean | void>;
}) {
  return (
    <Modal title="Yangi bitim" ok="Yaratish" onClose={onClose} onOk={onOk}>
      <label className="l" htmlFor="nd-c">
        Mijoz
      </label>
      <input
        id="nd-c"
        className="inp"
        value={cq}
        placeholder="Nom, STIR yoki telefon bilan qidiring"
        autoComplete="off"
        onChange={(e) => onCq(e.target.value)}
      />
      {shown && (shown.length || !tgChat) ? (
        <div className="dd">
          {shown.map((c) => (
            <button
              key={c.id}
              type="button"
              className="opt"
              onClick={() => onPick(c)}
            >
              <span>
                <span>{c.name}</span>
                <span className="s" style={{ display: "block" }}>
                  {[c.inn && "STIR " + c.inn, (c.phones || [])[0] && "+" + c.phones![0], c.owner_tg != null && users[c.owner_tg]].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          ))}
          {!shown.length && !tgChat ? <div className="opt text-hint">Topilmadi — «Yaratish» bosilsa yangi mijoz qo&apos;shiladi</div> : null}
        </div>
      ) : null}
      {tgHits.length ? (
        <div className="dd">
          <div className="opt s pointer-events-none">Telegram chatlaridan</div>
          {tgHits.map((c) => (
            <button key={c.id} type="button" className="opt" onClick={() => onPickTg(c)}>
              <span>
                <span>✈️ {c.title}</span>
                <span className="s" style={{ display: "block" }}>
                  {[c.username && "@" + c.username, c.customer ? `mijoz: ${c.customer.name}` : "yangi mijoz bo'ladi"].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {tgChat ? (
        <div className="sf flex items-start gap-2">
          <span className="min-w-0 flex-1 leading-[1.4]">
            ✈️ Telegram: <b>{tgChat.title}</b>
            {tgChat.username ? ` (@${tgChat.username})` : ""} — chat bitim mijoziga biriktiriladi.
            {!cp && cq.trim() ? (
              <>
                {" "}
                Yangi mijoz «<b>{cq.trim()}</b>» nomi bilan yaratiladi.
              </>
            ) : null}
          </span>
          <button type="button" className="b h-7 flex-none px-2 text-xs" onClick={onClearTg}>
            Olib tashlash
          </button>
        </div>
      ) : null}
      {cp ? <div className="sf text-ok">Tanlandi: {cp.name}</div> : null}
      <label className="l" htmlFor="nd-t">
        Bitim nomi
      </label>
      <input id="nd-t" ref={titleRef} className="inp" value={v.title} placeholder="Masalan: SPB 1650 remen — 10 dona" onChange={set("title")} />
      <label className="l" htmlFor="nd-a">
        Summa
      </label>
      <input id="nd-a" className="inp" value={v.amount} inputMode="decimal" placeholder="0" onChange={set("amount")} />
      <label className="l" htmlFor="nd-o">
        Mas&apos;ul
      </label>
      <select id="nd-o" className="sel" value={v.owner} onChange={set("owner")}>
        {userList.map((u) => (
          <option key={u.tg_id} value={u.tg_id}>
            {u.name}
          </option>
        ))}
      </select>
      <label className="l" htmlFor="nd-s">
        Manba
      </label>
      <select id="nd-s" className="sel" value={v.source} onChange={set("source")}>
        {Object.entries(SRC)
          .filter(([k]) => k)
          .map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
      </select>
      <label className="l" htmlFor="nd-n">
        Ehtiyoj
      </label>
      <textarea id="nd-n" className="inp" value={v.need} placeholder="Mijozga nima kerak?" onChange={set("need")} />
    </Modal>
  );
}
