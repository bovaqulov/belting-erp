// CRM Telegram paneli (faqat ko'rinish): chatlar ro'yxati, yozishma, javob maydoni, ulash yo'riqnomasi.
// Kompyuterda (xl+) kanban yonida doimiy ustun; kichik ekranda — o'ngdan chiquvchi panel (yopish tugmasi bilan).
import { Fragment, type ReactNode, type RefObject } from "react";

import { Empty, Icon } from "@/erp/kit/ui";
import { AvaView } from "@/erp/crm/badges";
import { SUM } from "@/erp/crm/tw";

import { chatTime, dayKey, dayLabel, fileSize, KIND_LABEL, lastLine, msgTime, type TgChat, type TgChats, type TgMsg } from "./tg.lib";

const IB =
  "grid size-8 flex-none cursor-pointer place-items-center rounded-lg border-0 bg-transparent p-0 text-hint hover:bg-fill hover:text-fg coarse:size-11 [&_svg.i]:size-[18px] focus-visible:outline-2 focus-visible:outline-focus";

/** Panel qobig'i: sarlavha + mazmun */
export function TgShell({
  open,
  title,
  sub,
  actions,
  onBack,
  onClose,
  children,
}: {
  open: boolean;
  title: ReactNode;
  sub?: ReactNode;
  /** sarlavhadagi qo'shimcha tugmalar (chat: "Bitim ochish") */
  actions?: ReactNode;
  onBack?: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label="Telegram yozishmalari"
      className={`flex min-h-0 flex-col border-l border-sep bg-sec xl:w-[360px] xl:flex-none 2xl:w-[400px] max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-40 max-xl:w-[min(420px,100vw)] max-xl:shadow-2 ${open ? "" : "max-xl:hidden"}`}
    >
      <div className="flex min-h-[52px] flex-none items-center gap-1.5 border-b border-sep px-2.5">
        {onBack ? (
          <button type="button" className={IB} onClick={onBack} aria-label="Chatlar ro'yxatiga qaytish" title="Orqaga">
            <Icon n="arrow-left" />
          </button>
        ) : (
          <span className="grid size-8 flex-none place-items-center text-[#2aabee] [&_svg.i]:size-5">
            <Icon n="send-tg" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{title}</div>
          {sub ? <div className="truncate text-xs text-hint">{sub}</div> : null}
        </div>
        {actions}
        <button type="button" className={`${IB} xl:hidden`} onClick={onClose} aria-label="Telegram panelini yopish" title="Yopish">
          <Icon n="x" />
        </button>
      </div>
      {children}
    </aside>
  );
}

/** Ulanmagan: qanday ulash (yozishmalar shaxsiy — har kim o'z Telegram'ini ulaydi) */
export function TgConnect({ bot }: { bot: string }) {
  return (
    <div className="flex-1 overflow-auto p-4 text-[13.5px] leading-[1.5]">
      <Empty icon="send-tg" title="Telegram ulanmagan">
        Mijozlar bilan yozishmalaringiz shu yerda ko&apos;rinishi uchun CRM botini ulang. Ularni faqat siz ko&apos;rasiz.
      </Empty>
      <ol className="m-0 mt-1 flex list-none flex-col gap-2 p-0 [counter-reset:s] [&>li]:flex [&>li]:gap-2.5 [&>li]:before:grid [&>li]:before:size-6 [&>li]:before:flex-none [&>li]:before:place-items-center [&>li]:before:rounded-full [&>li]:before:bg-fill [&>li]:before:text-xs [&>li]:before:font-semibold [&>li]:before:content-[counter(s)] [&>li]:before:[counter-increment:s]">
        <li>Telegram → Sozlamalar → Telegram Business → Chat-botlar.</li>
        <li>
          Botni kiriting:{" "}
          {bot ? (
            <a className="font-semibold text-link" href={`https://t.me/${bot}`} target="_blank" rel="noreferrer">
              @{bot}
            </a>
          ) : (
            "CRM boti"
          )}
          .
        </li>
        <li>Qaysi chatlarni ko&apos;rishini tanlang. CRM&apos;dan javob yozish uchun «Xabarlarga javob berish» ni yoqing.</li>
      </ol>
      <p className={`${SUM} mt-3`}>Bot faqat ulangandan keyingi xabarlarni ko&apos;radi; eski yozishmalar ko&apos;chirilmaydi.</p>
    </div>
  );
}

/** Chatlar ro'yxati */
export function TgList({
  r,
  me,
  q,
  onQ,
  onOpen,
}: {
  r: TgChats;
  me: number;
  q: string;
  onQ: (v: string) => void;
  onOpen: (c: TgChat) => void;
}) {
  return (
    <>
      {r.connection && !r.connection.can_reply ? (
        <div className="flex-none border-b border-sep bg-[color-mix(in_srgb,var(--warn)_14%,var(--sec))] px-3 py-2 text-xs leading-[1.4]" role="status">
          Faqat o&apos;qish: javob yozish uchun Telegram Business → Chat-botlar → «Xabarlarga javob berish» ni yoqing.
        </div>
      ) : null}
      <div className="relative flex-none px-2.5 py-2 [&_svg.i]:pointer-events-none [&_svg.i]:absolute [&_svg.i]:top-1/2 [&_svg.i]:left-[19px] [&_svg.i]:size-4 [&_svg.i]:-translate-y-1/2 [&_svg.i]:text-hint">
        <Icon n="search" />
        <input className="inp w-full !pl-8" type="search" value={q} placeholder="Ism yoki @username" aria-label="Chat qidirish" onChange={(e) => onQ(e.target.value)} />
      </div>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-auto p-0 pb-3">
        {r.chats.length ? (
          r.chats.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3 py-2 text-left text-fg hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus coarse:min-h-14"
                onClick={() => onOpen(c)}
              >
                <span className="flex-none [&>span]:!size-10 [&>span]:!text-sm">
                  <AvaView name={c.title} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <b className="min-w-0 flex-1 truncate font-semibold">{c.title}</b>
                    <span className="flex-none text-xs text-hint tabular-nums">{chatTime(c.last_at)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-sub">{lastLine(c) || "—"}</span>
                    {c.unread ? (
                      <span className={`min-w-5 flex-none rounded-full px-1.5 text-center text-xs leading-5 font-semibold text-white tabular-nums ${c.seller_tg === me ? "bg-[#2aabee]" : "bg-hint"}`} aria-label={`${c.unread} ta o'qilmagan`}>
                        {c.unread}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          ))
        ) : (
          <li className={`${SUM} px-4 py-6 text-center`}>{q ? "Hech narsa topilmadi" : "Hozircha yozishma yo'q — mijoz yozganda shu yerda paydo bo'ladi."}</li>
        )}
      </ul>
    </>
  );
}

/** Xabar fayli: rasm/stiker — rasm, video/GIF — video, ovoz/audio — pleyer, hujjat — yuklab olish, joylashuv — xarita */
function Media({ m, onView }: { m: TgMsg; onView: (url: string, alt: string) => void }) {
  const md = m.media;
  if (!md) return null;
  if (md.lat != null && md.lon != null)
    return (
      <a className="mb-1 block text-[13px] font-medium text-link underline" href={`https://maps.google.com/?q=${md.lat},${md.lon}`} target="_blank" rel="noreferrer">
        📍 Xaritada ochish
      </a>
    );
  if (!md.url || md.animated) return null;
  const ratio = md.width && md.height ? `${md.width} / ${md.height}` : undefined;
  const box = "mb-1 block max-h-[320px] w-[260px] max-w-full rounded-xl bg-fill object-cover";
  if (m.kind === "sticker" && md.mime?.startsWith("image/"))
    // eslint-disable-next-line @next/next/no-img-element -- statik eksport, fayl backend orqali
    return <img src={md.url} alt={m.text || KIND_LABEL.sticker} loading="lazy" className="mb-1 block size-32 object-contain" />;
  if (m.kind === "photo") {
    const url = md.url;
    // CRM ichida ochiladi (yangi tab emas — chatdan chiqib ketmaslik uchun)
    return (
      <button type="button" className="mb-1 block cursor-zoom-in border-0 bg-transparent p-0" onClick={() => onView(url, m.text || "Rasm")} aria-label="Rasmni kattalashtirish">
        {/* eslint-disable-next-line @next/next/no-img-element -- statik eksport, fayl backend orqali */}
        <img src={url} alt={m.text || KIND_LABEL.photo} loading="lazy" className={box} style={{ aspectRatio: ratio }} />
      </button>
    );
  }
  if (m.kind === "animation" || m.kind === "sticker")
    return <video src={md.url} autoPlay loop muted playsInline className={m.kind === "sticker" ? "mb-1 block size-32" : box} style={{ aspectRatio: ratio }} />;
  if (m.kind === "video" || m.kind === "video_note")
    return <video src={md.url} controls preload="metadata" playsInline className={m.kind === "video_note" ? "mb-1 block size-48 rounded-full object-cover" : box} style={{ aspectRatio: ratio }} />;
  if (m.kind === "voice" || m.kind === "audio") return <audio src={md.url} controls preload="none" className="mb-1 block h-10 w-[240px] max-w-full" />;
  return (
    <a href={md.url} className="mb-1 flex items-center gap-2 rounded-lg bg-fill px-2.5 py-2 text-[13px] text-fg no-underline coarse:min-h-11">
      <span aria-hidden="true">📄</span>
      <span className="min-w-0 flex-1 truncate font-medium">{md.name || "Fayl"}</span>
      <span className="flex-none text-xs text-hint">{fileSize(md.size)}</span>
    </a>
  );
}

/** Iqtibos bosilganda — asl xabarga aylantirish va qisqa ajratib ko'rsatish */
function jump(ref: number) {
  const el = document.getElementById(`tgm-${ref}`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  el.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 700, iterations: 2 });
}

function Bubble({ m, onView, onReply }: { m: TgMsg; onView: (url: string, alt: string) => void; onReply?: (m: TgMsg) => void }) {
  // fayl ko'rsatilsa — tur nomi shart emas; ko'rsatib bo'lmaydigan tur — nomi bilan
  const shown = !!(m.media && (m.media.url || m.media.lat != null) && !m.media.animated);
  const media = m.kind !== "text" && !shown ? KIND_LABEL[m.kind] || "Fayl" : "";
  const sub = m.out ? "opacity-80" : "text-hint";
  const rp = m.reply;
  return (
    <div id={`tgm-${m.id}`} className={`group flex items-center gap-1 ${m.out ? "flex-row-reverse" : ""}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-1.5 leading-[1.4] whitespace-pre-wrap [overflow-wrap:anywhere] ${m.out ? "rounded-br-md bg-btn text-btn-fg" : "rounded-bl-md bg-page"} ${m.deleted ? "border border-dashed border-danger/60 opacity-75" : ""}`}
      >
        {rp ? (
          <button
            type="button"
            className={`mb-1 block w-full cursor-pointer rounded-md border-0 border-l-[3px] px-2 py-1 text-left text-[12.5px] leading-[1.3] ${m.out ? "border-white/70 bg-white/15 text-btn-fg" : "border-link bg-fill text-fg"} ${rp.ref ? "" : "cursor-default"}`}
            onClick={() => rp.ref && jump(rp.ref)}
            title={rp.ref ? "Asl xabarga o'tish" : "Asl xabar CRM'da yo'q (ulanishdan oldingi)"}
          >
            <span className={`block font-semibold ${m.out ? "" : "text-link"}`}>{rp.out ? "Siz" : "Mijoz"}</span>
            <span className="line-clamp-2">{rp.text || KIND_LABEL[rp.kind] || "Xabar"}</span>
          </button>
        ) : null}
        <Media m={m} onView={onView} />
        {media ? <div className={`text-[12.5px] font-medium ${m.out ? "opacity-85" : "text-link"}`}>📎 {media}</div> : null}
        {m.text ? <span>{m.text}</span> : null}
        <span className={`float-right mt-1 ml-2 text-[11px] tabular-nums ${sub}`}>
          {m.via_crm ? "CRM · " : ""}
          {msgTime(m.date)}
        </span>
        {m.deleted ? (
          <div className={`clear-both pt-0.5 text-[11px] font-semibold ${m.out ? "" : "text-danger"}`}>🗑 {m.out ? "Siz o'chirdingiz" : "Mijoz o'chirdi"}{m.deleted_at ? ` · ${msgTime(m.deleted_at)}` : ""} — CRM&apos;da saqlandi</div>
        ) : null}
        {m.edited || m.history?.length ? (
          <details className={`clear-both pt-0.5 text-[11px] ${sub}`}>
            <summary className="cursor-pointer select-none">tahrirlangan{m.history?.length ? ` · ${m.history.length} ta oldingi variant` : ""}</summary>
            {m.history?.length ? (
              <ol className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
                {m.history.map((h, i) => (
                  <li key={i} className={`rounded-md px-2 py-1 ${m.out ? "bg-white/15" : "bg-fill"}`}>
                    <span className="font-semibold tabular-nums">{msgTime(h.at)}</span> · <span className="whitespace-pre-wrap">{h.text || KIND_LABEL[h.kind ?? ""] || "—"}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-1">Oldingi matn saqlanmagan (tarix shu o&apos;zgarishdan keyin yuritiladi).</div>
            )}
          </details>
        ) : null}
      </div>
      {onReply && !m.deleted ? (
        <button
          type="button"
          className="grid size-8 flex-none cursor-pointer place-items-center rounded-full border-0 bg-transparent text-hint opacity-0 group-hover:opacity-100 hover:bg-fill hover:text-fg focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus coarse:size-10 coarse:opacity-100"
          onClick={() => onReply(m)}
          aria-label="Javob yozish"
          title="Javob yozish (reply)"
        >
          ↩
        </button>
      ) : null}
    </div>
  );
}

/** Yozishma: kun ajratgichlari bilan xabarlar, pastda javob maydoni (yoki nega yozib bo'lmasligi) */
export function TgThreadView({
  msgs,
  chat,
  me,
  text,
  sending,
  endRef,
  file,
  onText,
  onSend,
  onPick,
  onClearFile,
  onLocation,
  onView,
  replyTo,
  onReply,
  onCancelReply,
}: {
  msgs: TgMsg[];
  chat: TgChat;
  me: number;
  text: string;
  sending: boolean;
  endRef: RefObject<HTMLDivElement | null>;
  /** yuborishga tayyorlangan fayl (rasm — ko'rinish bilan) */
  file: { name: string; size: number; preview: string | null } | null;
  onText: (v: string) => void;
  onSend: () => void;
  onPick: (f: File) => void;
  onClearFile: () => void;
  onLocation: () => void;
  /** rasmni CRM ichida ochish */
  onView: (url: string, alt: string) => void;
  /** javob beriladigan xabar (reply) */
  replyTo: TgMsg | null;
  onReply: (m: TgMsg) => void;
  onCancelReply: () => void;
}) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto bg-[color-mix(in_srgb,var(--page)_55%,var(--sec))] px-3 py-3" aria-live="polite">
        {msgs.length ? (
          msgs.map((m, i) => (
            <Fragment key={m.id}>
              {i === 0 || dayKey(msgs[i - 1].date) !== dayKey(m.date) ? (
                <div className="my-1 self-center rounded-full bg-fill px-2.5 py-0.5 text-xs text-sub">{dayLabel(m.date)}</div>
              ) : null}
              <Bubble m={m} onView={onView} onReply={chat.can_send ? onReply : undefined} />
            </Fragment>
          ))
        ) : (
          <div className={`${SUM} m-auto`}>Xabarlar yo&apos;q</div>
        )}
        <div ref={endRef} />
      </div>
      {chat.can_send ? (
        <form
          className="flex flex-none flex-wrap items-end gap-1.5 border-t border-sep p-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
        >
          {replyTo ? (
            <div className="flex w-full items-center gap-2 rounded-lg border-l-[3px] border-link bg-fill px-2 py-1 text-[13px]">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-link">↩ Javob: {replyTo.out ? "o'zingizning xabaringizga" : "mijoz xabariga"}</span>
                <span className="block truncate text-sub">{replyTo.text || KIND_LABEL[replyTo.kind] || "Xabar"}</span>
              </span>
              <button type="button" className={IB} onClick={onCancelReply} aria-label="Javobni bekor qilish" title="Bekor qilish">
                <Icon n="x" />
              </button>
            </div>
          ) : null}
          {file ? (
            <div className="flex w-full items-center gap-2 rounded-lg bg-fill px-2 py-1.5 text-[13px]">
              {file.preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- mahalliy blob ko'rinishi
                <img src={file.preview} alt="" className="size-10 flex-none rounded-md object-cover" />
              ) : (
                <span className="grid size-10 flex-none place-items-center rounded-md bg-sec" aria-hidden="true">
                  📄
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{file.name}</span>
                <span className="text-xs text-hint">{fileSize(file.size)} · izoh — pastda (ixtiyoriy)</span>
              </span>
              <button type="button" className={IB} onClick={onClearFile} aria-label="Faylni olib tashlash" title="Olib tashlash">
                <Icon n="x" />
              </button>
            </div>
          ) : null}
          <label className={`${IB} cursor-pointer`} title="Fayl yoki rasm biriktirish" aria-label="Fayl yoki rasm biriktirish">
            <Icon n="file-plus" />
            <input
              type="file"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPick(f);
                e.target.value = "";
              }}
            />
          </label>
          <button type="button" className={IB} onClick={onLocation} disabled={sending} aria-label="Joylashuvni yuborish" title="Joylashuvni yuborish">
            <Icon n="map" />
          </button>
          <textarea
            className="inp max-h-32 !min-h-10 flex-1 !resize-none !h-auto !py-2 leading-[1.35] [field-sizing:content]"
            rows={1}
            value={text}
            placeholder={file ? "Izoh (ixtiyoriy)…" : "Javob yozing… (Enter — yuborish)"}
            aria-label="Javob matni"
            onChange={(e) => onText(e.target.value)}
            onPaste={(e) => {
              const f = e.clipboardData.files?.[0]; // rasm nusxalab qo'yildi
              if (f) {
                e.preventDefault();
                onPick(f);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <button
            type="submit"
            className="grid size-10 flex-none cursor-pointer place-items-center rounded-full border-0 bg-btn text-btn-fg disabled:cursor-default disabled:opacity-45 coarse:size-11 [&_svg.i]:size-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            disabled={sending || (!text.trim() && !file)}
            aria-label="Yuborish"
            title="Yuborish"
          >
            <Icon n="send" />
          </button>
        </form>
      ) : (
        <div className="flex-none border-t border-sep px-3 py-2.5 text-center text-xs text-hint">
          {chat.seller_tg !== me ? "Faqat o'qish" : "Bot javob yoza olmaydi — Telegram Business'da «Xabarlarga javob berish» ni yoqing"}
        </div>
      )}
    </>
  );
}

/** Kichik ekranda panelni ochish tugmasi (asboblar panelida) */
export const TgButton = ({ unread, onClick }: { unread: number; onClick: () => void }) => (
  <button type="button" className="b xl:hidden" onClick={onClick} aria-label={`Telegram${unread ? `, ${unread} ta o'qilmagan` : ""}`}>
    <Icon n="send-tg" /> Telegram
    {unread ? <b className="ml-0.5 min-w-5 rounded-full bg-[#2aabee] px-1.5 text-center text-xs leading-5 text-white tabular-nums">{unread}</b> : null}
  </button>
);

/** Rasmni ko'rish oynasi (CRM ichida): fonga bosish, Esc yoki × — yopiladi; asl hajm (yangi tab) va yuklab olish */
export function TgLightbox({ url, alt, closeRef, onClose }: { url: string; alt: string; closeRef: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const btn = "grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-white/15 text-white no-underline hover:bg-white/25 coarse:size-11 [&_svg.i]:size-5";
  return (
    <div className="mdl fixed inset-0 z-[70] flex flex-col bg-black/85" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      <div className="flex flex-none items-center justify-end gap-2 p-3" onClick={(e) => e.stopPropagation()}>
        <a className={btn} href={url} target="_blank" rel="noreferrer" title="Asl hajmda (yangi oynada)" aria-label="Asl hajmda ochish">
          <Icon n="zoom-in" />
        </a>
        <a className={btn} href={url} download title="Yuklab olish" aria-label="Yuklab olish">
          <Icon n="download" />
        </a>
        <button ref={closeRef} type="button" className={btn} onClick={onClose} title="Yopish (Esc)" aria-label="Yopish">
          <Icon n="x" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- statik eksport, fayl backend orqali */}
        <img src={url} alt={alt} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      </div>
    </div>
  );
}
