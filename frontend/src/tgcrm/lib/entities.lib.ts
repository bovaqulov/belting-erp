// Telegram formatlash (entities) → bo'laklar. offset/length — UTF-16 birligida; JS satrlari ham UTF-16, shuning uchun
// to'g'ridan-to'g'ri slice. Ustma-ust tushgan entity'lar chegaralarda bo'linadi. Sof funksiyalar.
import type { Entity } from "@/tgcrm/api";

export type Mark = "b" | "i" | "u" | "s" | "code" | "pre" | "spoiler" | "quote" | "link" | "mention" | "tag";
export type Seg = { text: string; marks: Mark[]; href?: string };

const MARK: Record<string, Mark> = {
  bold: "b",
  italic: "i",
  underline: "u",
  strike: "s",
  code: "code",
  pre: "pre",
  spoiler: "spoiler",
  blockquote: "quote",
  url: "link",
  texturl: "link",
  email: "link",
  phone: "link",
  mention: "mention",
  mentionname: "mention",
  hashtag: "tag",
  cashtag: "tag",
  botcommand: "tag",
};

/** Faqat xavfsiz sxemalar: http(s), mailto, tel, tg. javascript: va boshqalari — havola emas. */
export function safeHref(raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  if (/^(https?:|mailto:|tel:|tg:)/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return undefined; // boshqa sxema (javascript:, data: …)
  if (/^[\w.-]+\.[a-z]{2,}([/:?#]|$)/i.test(s)) return `https://${s}`; // "belting.uz/katalog"
  return undefined;
}

function hrefOf(e: Entity, text: string): string | undefined {
  const t = text.slice(e.offset, e.offset + e.length);
  if (e.type === "texturl") return safeHref(e.url ?? "");
  if (e.type === "url") return safeHref(t);
  if (e.type === "email") return `mailto:${t}`;
  if (e.type === "phone") return `tel:${t.replace(/[^\d+]/g, "")}`;
  if (e.type === "mention") return `https://t.me/${t.replace(/^@/, "")}`;
  return undefined;
}

export function segments(text: string, entities: Entity[] | null | undefined): Seg[] {
  if (!text) return [];
  const ents = (entities ?? []).filter((e) => MARK[e.type] && e.length > 0 && e.offset < text.length);
  if (!ents.length) return [{ text, marks: [] }];
  const cuts = new Set([0, text.length]);
  for (const e of ents) {
    cuts.add(Math.max(0, e.offset));
    cuts.add(Math.min(text.length, e.offset + e.length));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Seg[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a === b) continue;
    const on = ents.filter((e) => e.offset <= a && e.offset + e.length >= b);
    const marks = [...new Set(on.map((e) => MARK[e.type]))];
    const linkEnt = on.find((e) => MARK[e.type] === "link" || e.type === "mention");
    const href = linkEnt ? hrefOf(linkEnt, text) : undefined;
    const seg: Seg = {
      text: text.slice(a, b),
      marks: href || !marks.includes("link") ? marks : marks.filter((m) => m !== "link"),
    };
    if (href) seg.href = href;
    const prev = out[out.length - 1];
    if (prev && prev.href === seg.href && prev.marks.join() === seg.marks.join()) prev.text += seg.text;
    else out.push(seg);
  }
  return out;
}
