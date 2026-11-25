import type { ClipboardEvent, KeyboardEvent, ReactNode, RefObject } from "react";

import type { FileKind, Msg } from "@/tgcrm/api";
import { Icon } from "@/tgcrm/kit";
import { fmtDuration, fmtSize, mediaLabel } from "@/tgcrm/lib";

const ROUND = "grid size-11 flex-none cursor-pointer place-items-center rounded-full border-0";

function KindSwitch({ file, kind, onKind }: { file: File; kind: FileKind; onKind: (k: FileKind) => void }) {
  const img = /^image\/(jpeg|png|webp)$/.test(file.type);
  const vid = file.type === "video/mp4" || file.type === "video/quicktime";
  if (!img && !vid) return null;
  const opts: [FileKind, string][] = [
    [img ? "photo" : "video", img ? "Rasm" : "Video"],
    ["file", "Fayl (siqilmagan)"],
  ];
  return (
    <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Qanday yuborish">
      {opts.map(([k, t]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={kind === k}
          onClick={() => onKind(k)}
          className={`chip !py-1 text-[13px] ${kind === k ? "on" : ""}`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function ComposerView({
  area,
  picker,
  ...p
}: {
  area: RefObject<HTMLTextAreaElement | null>;
  picker: RefObject<HTMLInputElement | null>;
  quick: ReactNode;
  onQuick: () => void;
  text: string;
  max: number;
  reply: Msg | null;
  replyName: string;
  editing: Msg | null;
  onCancelEdit: () => void;
  attach: File | null;
  preview: string | null;
  kind: FileKind;
  recording: number | null;
  canRecord: boolean;
  onKind: (k: FileKind) => void;
  onPick: () => void;
  onPicked: (f: File | undefined) => void;
  onClearAttach: () => void;
  onCancelReply: () => void;
  onChange: (v: string) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onRecStart: () => void;
  onRecStop: () => void;
  onRecCancel: () => void;
}) {
  const over = p.text.length > p.max;
  const can = (!!p.text.trim() || !!p.attach) && !over;
  const editingNow = !!p.editing;
  const replyText = p.reply ? p.reply.text || (p.reply.media ? mediaLabel(p.reply.media).title : "") : "";
  return (
    <div className="border-t border-sep bg-sec px-2 pt-2 pb-2 md:px-4">
      <div className="mx-auto max-w-[780px]">
        {p.quick}
        {p.editing ? (
          <div className="mb-2 flex items-center gap-2 pl-1">
            <Icon n="pencil" cls="flex-none text-link" />
            <div className="min-w-0 flex-1 border-l-[3px] border-link pl-2">
              <span className="block text-[13.5px] font-semibold text-link">Tahrirlash</span>
              <span className="block truncate text-[13.5px] text-sub">{p.editing.text || "\u00a0"}</span>
            </div>
            <button type="button" className="icon-btn" onClick={p.onCancelEdit} aria-label="Tahrirni bekor qilish">
              <Icon n="x" />
            </button>
          </div>
        ) : null}
        {p.reply && !p.editing ? (
          <div className="mb-2 flex items-center gap-2 pl-1">
            <Icon n="undo-2" cls="flex-none text-link" />
            <div className="min-w-0 flex-1 border-l-[3px] border-link pl-2">
              <span className="block truncate text-[13.5px] font-semibold text-link">{p.replyName || "Javob"}</span>
              <span className="block truncate text-[13.5px] text-sub">{replyText || " "}</span>
            </div>
            <button type="button" className="icon-btn" onClick={p.onCancelReply} aria-label="Javobni bekor qilish">
              <Icon n="x" />
            </button>
          </div>
        ) : null}
        {p.attach ? (
          <div className="mb-2 flex items-start gap-3 rounded-xl bg-page p-2">
            {p.preview && p.attach.type.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- mahalliy object URL
              <img src={p.preview} alt="" className="size-16 flex-none rounded-lg object-cover" />
            ) : p.preview ? (
              <video src={p.preview} muted className="size-16 flex-none rounded-lg object-cover" />
            ) : (
              <span className="grid size-16 flex-none place-items-center rounded-lg bg-btn text-btn-fg">
                <Icon n="file-text" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium">{p.attach.name}</span>
              <span className="block text-[12.5px] text-hint tabular-nums">{fmtSize(p.attach.size)}</span>
              <KindSwitch file={p.attach} kind={p.kind} onKind={p.onKind} />
            </div>
            <button type="button" className="icon-btn" onClick={p.onClearAttach} aria-label="Biriktirmani olib tashlash">
              <Icon n="x" />
            </button>
          </div>
        ) : null}
        {p.recording !== null ? (
          <div className="flex items-center gap-2" role="status">
            <button type="button" className="mini danger" onClick={p.onRecCancel}>
              Bekor qilish
            </button>
            <span className="flex flex-1 items-center justify-center gap-2 text-[15px] tabular-nums">
              <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden />
              Ovoz yozilmoqda · {fmtDuration(p.recording / 1000)}
            </span>
            <button type="button" onClick={p.onRecStop} className={`${ROUND} bg-btn text-btn-fg`} aria-label="Ovozli xabarni yuborish">
              <Icon n="send" />
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <input
              ref={picker}
              type="file"
              className="hidden"
              tabIndex={-1}
              onChange={(e) => {
                p.onPicked(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {editingNow ? null : (
              <button
                type="button"
                onClick={p.onQuick}
                className="grid size-11 flex-none cursor-pointer place-items-center rounded-full border-0 bg-transparent text-hint hover:text-link"
                aria-label="Tez javoblar"
                title="Tez javoblar (/)"
              >
                <Icon n="list" />
              </button>
            )}
            {editingNow ? null : (
              <button
                type="button"
                onClick={p.onPick}
                className={`${ROUND} bg-transparent text-hint hover:text-link`}
                aria-label="Fayl biriktirish"
                title="Fayl biriktirish"
              >
                <Icon n="file-plus" />
              </button>
            )}
            <label className="min-w-0 flex-1">
              <span className="sr-only">{p.attach ? "Izoh" : "Xabar"}</span>
              <textarea
                ref={area}
                rows={1}
                value={p.text}
                placeholder={p.attach ? "Izoh qo'shing…" : "Xabar yozing…"}
                onChange={(e) => p.onChange(e.target.value)}
                onKeyDown={p.onKeyDown}
                onPaste={p.onPaste}
                enterKeyHint="send"
                className="block max-h-[168px] min-h-11 w-full resize-none rounded-[22px] border-0 bg-page px-4 py-[10px] text-base leading-[1.4] text-fg outline-none focus-visible:shadow-[0_0_0_2px_var(--focus)]"
              />
            </label>
            {can || !p.canRecord || editingNow ? (
              <button
                type="button"
                onClick={p.onSend}
                disabled={!can}
                className={`${ROUND} bg-btn text-btn-fg transition-opacity disabled:cursor-default disabled:opacity-40`}
                aria-label="Yuborish"
                title="Yuborish (Enter)"
              >
                <Icon n="send" />
              </button>
            ) : (
              <button type="button" onClick={p.onRecStart} className={`${ROUND} bg-btn text-btn-fg`} aria-label="Ovozli xabar yozish" title="Ovozli xabar">
                <Icon n="mic" />
              </button>
            )}
          </div>
        )}
        {over ? (
          <p className="m-0 mt-1 text-right text-[12.5px] text-danger tabular-nums" role="alert">
            {p.text.length} / {p.max} — {p.attach ? "izoh 1024 belgigacha" : "Telegram xabari 4096 belgigacha"}
          </p>
        ) : null}
      </div>
    </div>
  );
}
