import type { AiSettings } from "@/tgcrm/api";
import { Icon } from "@/tgcrm/kit";
import { listTime } from "@/tgcrm/lib";

const NUM = "inp w-20 text-right tabular-nums";
const LOG: Record<string, string> = {
  ai_reply: "Javob",
  ai_order: "Buyurtma",
  ai_handoff: "Menejerga",
  ai_error: "Xato",
};

function Check({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return (
    <li className="item">
      <span className={ok ? "text-ok" : "text-warn"} role="img" aria-label={ok ? "joyida" : "e'tibor"}>
        <Icon n={ok ? "check" : "triangle-alert"} />
      </span>
      <span className="main">
        <span className="t block">{title}</span>
        <span className="s ml block">{detail}</span>
      </span>
    </li>
  );
}

export function AiView({
  data,
  draft,
  err,
  busy,
  saved,
  onDraft,
  onSave,
}: {
  data: AiSettings | null;
  draft: Partial<AiSettings>;
  err: string;
  busy: boolean;
  saved: boolean;
  onDraft: (d: Partial<AiSettings>) => void;
  onSave: (body: Partial<AiSettings>) => void;
}) {
  if (!data) return err ? <p className="sf m-0 !text-danger">{err}</p> : null;
  const v = { ...data, ...draft };
  const ro = !data.can_edit;
  const dirty = Object.keys(draft).length > 0;
  return (
    <section aria-label="AI yordamchi">
      <h2 className="sh m-0">
        <span>AI yordamchi</span>
        <span className="r">
          24 soatda: {data.replies_24h} javob · {data.orders_24h} buyurtma · {data.handoffs_24h} menejerga
          {data.errors_24h ? ` · ${data.errors_24h} xato` : ""}
        </span>
      </h2>
      <ul className="list plain my-0 list-none p-0">
        <Check ok={data.channel.ok} title="Javob kanali" detail={data.channel.detail} />
        <Check
          ok={data.stock.ok}
          title="Omborda bor-yo'qligi (1C)"
          detail={`${data.stock.at ? `Qoldiq: ${listTime(data.stock.at)} · ` : ""}${data.stock.detail}`}
        />
      </ul>
      <div className="list plain">
        <label className="item">
          <span className="main">
            <span className="t block">Mijozlarga avtomatik javob</span>
            <span className="s ml block">Shaxsiy chatlarga darhol javob beradi; narxni aytmaydi — menejerga uzatadi (sizga vazifa va xabar).</span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={v.ai_enabled}
            disabled={ro || busy || (!v.ai_enabled && !data.channel.ok)}
            onChange={(e) => onSave({ ai_enabled: e.target.checked })}
            aria-label="AI yordamchini yoqish"
          />
        </label>
        <label className="field col">
          <span className="!text-[13px] !text-hint">Ko&apos;rsatmalar (firma, ish vaqti, yetkazish, FAQ, uslub)</span>
          <textarea
            className="!min-h-[110px]"
            value={v.ai_instructions}
            disabled={ro}
            maxLength={4000}
            placeholder="Masalan: Ish vaqti 9:00–18:00. Toshkent bo'ylab yetkazamiz. Manzil: … Do'stona, qisqa yoz."
            onChange={(e) => onDraft({ ai_instructions: e.target.value })}
          />
        </label>
        <div className="item flex-wrap gap-y-2">
          <label className="flex items-center gap-2 text-[14px]">
            Kutish, s
            <input
              type="number"
              className={NUM}
              min={3}
              max={600}
              value={v.ai_delay_sec}
              disabled={ro}
              onChange={(e) => onDraft({ ai_delay_sec: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            Siz yozgandan keyin jim, daq
            <input
              type="number"
              className={NUM}
              min={0}
              max={1440}
              value={v.ai_quiet_min}
              disabled={ro}
              onChange={(e) => onDraft({ ai_quiet_min: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            Chatga soatiga
            <input
              type="number"
              className={NUM}
              min={1}
              max={30}
              value={v.ai_max_per_hour}
              disabled={ro}
              onChange={(e) => onDraft({ ai_max_per_hour: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>
      {err ? <p className="sf m-0 !text-danger">{err}</p> : null}
      {!ro ? (
        <div className="btns">
          <button type="button" className="btn" disabled={!dirty || busy} onClick={() => onSave(draft)}>
            {saved ? "Saqlandi" : busy ? "Saqlanmoqda…" : "Saqlash"}
          </button>
        </div>
      ) : null}
      <p className="sf m-0">
        Javoblar Telegram Business bot orqali sizning nomingizdan ketadi — qaysi chatlarda ishlashini Telegram&apos;ning o&apos;zida tanlaysiz (Sozlamalar →
        Telegram Business → Chatbotlar) va chat tepasidagi tugma bilan to&apos;xtatasiz. Guruh, kanal, bot, hamkasblar va «Saqlangan xabarlar»ga javob bermaydi;
        shaxsiy gaplarga (do&apos;st, oila) jim turadi. Har chatda alohida o&apos;chirish mumkin (chat menyusi). AI yozgan xabar CRM&apos;da «AI» belgisi bilan
        ko&apos;rinadi.
      </p>
      {data.log.length ? (
        <details className="mt-1">
          <summary className="sh m-0 cursor-pointer">AI jurnali (oxirgi {data.log.length})</summary>
          <ul className="list plain my-0 list-none p-0">
            {data.log.map((e) => (
              <li key={`${e.at}-${e.kind}`} className="item">
                <span className="main">
                  <span className="t block">
                    {LOG[e.kind] ?? e.kind} · <span className="tabular-nums text-hint">{listTime(e.at)}</span>
                  </span>
                  <span className="s ml block break-words">{e.detail.replace(/^#-?\d+ /, "")}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
