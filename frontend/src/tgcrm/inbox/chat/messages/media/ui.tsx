import { useEffect, useRef } from "react";

import type { Media } from "@/tgcrm/api";
import { Icon } from "@/tgcrm/kit";
import { boxSize, fmtDuration, mediaLabel } from "@/tgcrm/lib";

const PLAY = "absolute inset-0 m-auto grid size-12 place-items-center rounded-full bg-black/45 text-white";

function Progress({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  return (
    <span
      className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-black/30"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="block h-full bg-white" style={{ width: `${pct}%` }} />
    </span>
  );
}

/** To'liq ekranli ko'ruvchi: rasm (yuklanguncha — kichik rasm), Esc / fon — yopish */
function Viewer({ src, fallback, onClose, onDownload }: { src: string | null; fallback: string | null; onClose: () => void; onDownload: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
  }, []);
  return (
    <div
      ref={box}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Rasm"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      onClick={onClose}
      className="fixed inset-0 z-80 grid place-items-center bg-black/90 outline-none"
    >
      {src || fallback ? (
        // eslint-disable-next-line @next/next/no-img-element -- himoyalangan API fayli (blob/cookie)
        <img src={src ?? fallback ?? ""} alt="" className="max-h-[92dvh] max-w-[96vw] object-contain" />
      ) : (
        <span className="text-white/80">Yuklanmoqda…</span>
      )}
      <div className="absolute top-3 right-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="grid size-11 cursor-pointer place-items-center rounded-full border-0 bg-white/15 text-white"
          onClick={onDownload}
          aria-label="Yuklab olish"
        >
          <Icon n="download" />
        </button>
        <button
          type="button"
          className="grid size-11 cursor-pointer place-items-center rounded-full border-0 bg-white/15 text-white"
          onClick={onClose}
          aria-label="Yopish"
        >
          <Icon n="x" />
        </button>
      </div>
    </div>
  );
}

function Wave({ bars }: { bars: number[] }) {
  return (
    <span className="flex h-6 items-center gap-[2px]" aria-hidden>
      {bars.map((v, i) => (
        <span key={i} className="w-[3px] rounded-full bg-current opacity-60" style={{ height: `${Math.max(12, (v / 31) * 100)}%` }} />
      ))}
    </span>
  );
}

export function MediaView({
  watch,
  ...p
}: {
  watch: (el: HTMLElement | null) => (() => void) | undefined;
  media: Media;
  local: string | null;
  progress: number | null;
  thumb: string | null;
  full: string | null;
  fullFailed: boolean;
  active: boolean;
  viewer: boolean;
  onActivate: () => void;
  onOpen: () => void;
  onClose: () => void;
  onDownload: () => void;
}) {
  const m = p.media;
  const k = m.kind;
  const l = mediaLabel(m);
  const mini = typeof m.mini === "string" ? m.mini : null;
  const preview = p.local ?? p.thumb ?? mini;

  if (k === "photo" || k === "video" || k === "gif" || k === "round") {
    const { w, h } = k === "round" ? { w: 220, h: 220 } : boxSize(m, 320, 340);
    const shape = k === "round" ? "rounded-full" : "rounded-xl";
    const playing = p.active && p.full && k !== "photo";
    return (
      <div ref={watch} className={`relative mb-1 max-w-full overflow-hidden bg-fill ${shape}`} style={{ width: w, aspectRatio: `${w} / ${h}` }}>
        {playing ? (
          <video
            src={p.full ?? undefined}
            className="size-full object-cover"
            autoPlay
            playsInline
            controls={k === "video"}
            loop={k !== "video"}
            muted={k === "gif"}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (k === "photo") p.onOpen();
              else p.onActivate();
            }}
            className="relative block size-full cursor-pointer border-0 bg-transparent p-0"
            aria-label={k === "photo" ? "Rasmni ochish" : `${l.title} — o'ynatish${l.sub ? `, ${l.sub}` : ""}`}
          >
            {mini && !p.local ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URI (xira eskiz)
              <img src={mini} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover blur-md" />
            ) : null}
            {preview && preview !== mini ? (
              // eslint-disable-next-line @next/next/no-img-element -- himoyalangan API fayli
              <img src={preview} alt="" className="absolute inset-0 size-full object-cover" />
            ) : null}
            {!preview ? (
              <span className="absolute inset-0 grid place-items-center text-hint">
                <Icon n={l.icon} cls="!size-7" />
              </span>
            ) : null}
            {k !== "photo" ? (
              <span className={PLAY}>
                {p.active && !p.full && !p.fullFailed ? (
                  <span className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Icon n="play" />
                )}
              </span>
            ) : null}
            {m.duration !== undefined && k !== "photo" ? (
              <span className="absolute top-1.5 left-1.5 rounded-md bg-black/45 px-1.5 text-[12px] text-white tabular-nums">{fmtDuration(m.duration)}</span>
            ) : null}
            {p.fullFailed ? <span className="absolute inset-x-0 bottom-1 text-center text-[12px] text-white drop-shadow">Yuklab bo&apos;lmadi</span> : null}
            <Progress pct={p.progress} />
          </button>
        )}
        {p.viewer ? <Viewer src={p.full} fallback={p.thumb} onClose={p.onClose} onDownload={p.onDownload} /> : null}
      </div>
    );
  }

  if (k === "sticker") {
    const video = m.mime === "video/webm";
    const src = m.animated ? (p.thumb ?? mini) : (p.full ?? p.thumb ?? mini);
    return (
      <div ref={watch} className="mb-1 grid size-[160px] place-items-center" role="img" aria-label={l.title}>
        {video && p.full ? (
          <video src={p.full} autoPlay loop muted playsInline className="size-full object-contain" />
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element -- himoyalangan API fayli
          <img src={src} alt={l.title} className="size-full object-contain" />
        ) : (
          <span className="text-[56px]" aria-hidden>
            {String(m.emoji ?? "🙂")}
          </span>
        )}
      </div>
    );
  }

  if (k === "voice" || k === "audio") {
    const wave = Array.isArray(m.wave) ? (m.wave as number[]) : [];
    return (
      <div ref={watch} className="mb-1 min-w-[220px]">
        {p.active && p.full ? (
          <audio src={p.full} controls autoPlay className="h-10 w-full min-w-[240px]" onClick={(e) => e.stopPropagation()} />
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              p.onActivate();
            }}
            className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent p-0 py-1 text-left text-fg"
            style={{ font: "inherit" }}
            aria-label={`${l.title} — o'ynatish${l.sub ? `, ${l.sub}` : ""}`}
          >
            <span className="grid size-11 flex-none place-items-center rounded-full bg-btn text-btn-fg">
              {p.active && !p.fullFailed ? (
                <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Icon n="play" />
              )}
            </span>
            <span className="min-w-0 flex-1 text-link">
              {k === "voice" && wave.length ? <Wave bars={wave} /> : <span className="block truncate text-[15px] font-medium text-fg">{l.title}</span>}
              <span className="block text-[12.5px] text-hint tabular-nums">{p.fullFailed ? "Yuklab bo'lmadi" : l.sub}</span>
            </span>
          </button>
        )}
      </div>
    );
  }

  if (k === "file") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          p.onDownload();
        }}
        className="relative mb-1 flex min-w-[220px] cursor-pointer items-center gap-3 border-0 bg-transparent p-0 py-1 text-left text-fg"
        style={{ font: "inherit" }}
        aria-label={`${l.title} — yuklab olish`}
      >
        <span className="grid size-11 flex-none place-items-center rounded-full bg-btn text-btn-fg">
          <Icon n={p.progress !== null ? "upload" : "download"} />
        </span>
        <span className="min-w-0">
          <span className="block max-w-[260px] truncate text-[15px] font-medium">{l.title}</span>
          <span className="block text-[12.5px] text-hint tabular-nums">{p.progress !== null ? `${p.progress}% · ${l.sub}` : l.sub}</span>
        </span>
      </button>
    );
  }

  return (
    <div className="mb-1 flex min-w-[200px] items-center gap-3 py-1">
      <span className="grid size-11 flex-none place-items-center rounded-full bg-btn text-btn-fg">
        <Icon n={l.icon} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-medium">{l.title}</span>
        {l.sub ? <span className="block text-[13px] text-hint tabular-nums">{l.sub}</span> : null}
      </span>
    </div>
  );
}
