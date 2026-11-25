import { describe, expect, it } from "vitest";

import type { Msg } from "@/tgcrm/api";

import { actionText, boxSize, chatName, defaultKind, initials, layoutRows, mediaLabel } from "./chat.lib";
import { safeHref, segments } from "./entities.lib";
import { dayLabel, listTime, sameDay, statusLine } from "./time.lib";

const m = (id: number, o: Partial<Msg> = {}): Msg => ({
  id,
  date: "2026-11-19T09:00:00Z",
  out: false,
  sender_id: 5,
  text: "x",
  entities: [],
  media: null,
  action: null,
  reply_to: null,
  fwd: null,
  grouped_id: null,
  edit_date: null,
  views: null,
  post_author: "",
  reactions: null,
  deleted: false,
  read: false,
  sent_by: null,
  ...o,
});

describe("entities", () => {
  it("ustma-ust formatlash bo'linadi", () => {
    const s = segments("Salom dunyo!", [
      { type: "bold", offset: 0, length: 11 },
      { type: "italic", offset: 6, length: 5 },
    ]);
    expect(s).toEqual([
      { text: "Salom ", marks: ["b"] },
      { text: "dunyo", marks: ["b", "i"] },
      { text: "!", marks: [] },
    ]);
  });

  it("havolalar xavfsiz", () => {
    expect(segments("bu yerda", [{ type: "texturl", offset: 0, length: 8, url: "javascript:alert(1)" }])).toEqual([{ text: "bu yerda", marks: [] }]);
    expect(segments("belting.uz", [{ type: "url", offset: 0, length: 10 }])[0].href).toBe("https://belting.uz");
    expect(segments("@ali", [{ type: "mention", offset: 0, length: 4 }])[0].href).toBe("https://t.me/ali");
    expect(safeHref("data:text/html,x")).toBeUndefined();
    expect(safeHref("tel:+998901112233")).toBe("tel:+998901112233");
  });

  it("emoji (UTF-16 juftlik) offsetlari to'g'ri", () => {
    const s = segments("👍 ok", [{ type: "bold", offset: 3, length: 2 }]);
    expect(s.map((x) => x.text)).toEqual(["👍 ", "ok"]);
  });

  it("formatlashsiz matn — bitta bo'lak, bo'sh — hech narsa", () => {
    expect(segments("oddiy", [])).toEqual([{ text: "oddiy", marks: [] }]);
    expect(segments("", [])).toEqual([]);
  });
});

describe("vaqt", () => {
  const now = new Date(2026, 10, 19, 15, 0);
  it("ro'yxat vaqti", () => {
    expect(listTime(new Date(2026, 10, 19, 9, 5).toISOString(), now)).toBe("09:05");
    expect(listTime(new Date(2026, 10, 17, 9, 5).toISOString(), now)).toBe("Se"); // 17.11.2026 — seshanba
    expect(listTime(new Date(2026, 9, 3).toISOString(), now)).toBe("03.10");
    expect(listTime(new Date(2025, 0, 3).toISOString(), now)).toBe("03.01.25");
  });
  it("kun va holat", () => {
    expect(dayLabel(new Date(2026, 10, 18, 23).toISOString(), now)).toBe("Kecha");
    expect(dayLabel(new Date(2026, 10, 5).toISOString(), now)).toBe("5-noyabr");
    const base = {
      kind: "user" as const,
      online: false,
      last_seen: null,
      members: null,
      is_self: false,
      deleted: false,
    };
    expect(statusLine({ ...base, online: true }, now)).toBe("onlayn");
    expect(statusLine({ ...base, last_seen: new Date(2026, 10, 19, 8, 7).toISOString() }, now)).toBe("bugun 08:07 da ko'rindi");
    expect(statusLine({ ...base, kind: "supergroup", members: 1250 }, now)).toBe("1 250 a'zo");
    expect(sameDay(new Date(2026, 10, 19, 1).toISOString(), new Date(2026, 10, 19, 23).toISOString())).toBe(true);
  });
});

describe("chat", () => {
  it("nom va bosh harflar", () => {
    expect(initials("Ali Valiyev")).toBe("AV");
    expect(initials("🔥 Belting")).toBe("B");
    expect(initials("𝐅𝐚𝐳𝐥𝐢𝐝𝐝𝐢𝐧 𝐈")).toBe("𝐅𝐈"); // surrogat juftlik bo'linmaydi
    expect(
      chatName({
        title: "",
        username: "",
        phone: "",
        is_self: true,
        deleted: false,
        peer_id: 1,
      }),
    ).toBe("Saqlangan xabarlar");
    expect(
      chatName({
        title: "",
        username: "ali",
        phone: "",
        is_self: false,
        deleted: false,
        peer_id: 1,
      }),
    ).toBe("@ali");
  });

  it("fayl turi", () => {
    expect(defaultKind({ type: "image/jpeg", size: 2e6 })).toBe("photo");
    expect(defaultKind({ type: "image/jpeg", size: 20e6 })).toBe("file"); // katta rasm — siqilmasin
    expect(defaultKind({ type: "image/gif", size: 1e5 })).toBe("file");
    expect(defaultKind({ type: "video/mp4", size: 1e7 })).toBe("video");
    expect(defaultKind({ type: "audio/mpeg", size: 1e6 })).toBe("audio");
    expect(defaultKind({ type: "application/pdf", size: 1e6 })).toBe("file");
  });

  it("media yozuvi va o'lcham", () => {
    expect(mediaLabel({ kind: "file", name: "narx.pdf", size: 2_500_000 })).toEqual({ title: "narx.pdf", sub: "2.4 MB", icon: "file-text" });
    expect(mediaLabel({ kind: "voice", duration: 67 }).sub).toBe("1:07");
    expect(boxSize({ kind: "photo", w: 1280, h: 960 })).toEqual({
      w: 320,
      h: 240,
    });
    expect(actionText({ type: "PhoneCall", duration: 65, reason: "Hangup" }, "")).toBe("Qo'ng'iroq (1:05)");
    expect(actionText({ type: "ChatEditTitle", title: "Sotuv" }, "Ali")).toBe("Ali: guruh nomi o'zgardi «Sotuv»");
  });

  it("xabarlarni guruhlash va kun ajratgichi", () => {
    const sd = (a: string, b: string) => a.slice(0, 10) === b.slice(0, 10);
    const rows = layoutRows(
      [
        m(1),
        m(2, { date: "2026-11-19T09:01:00Z" }),
        m(3, { date: "2026-11-19T09:02:00Z", out: true, sender_id: 777 }),
        m(4, { date: "2026-11-20T09:00:00Z", action: { type: "PinMessage" } }),
      ],
      sd,
    );
    expect(rows.map((r) => r.k)).toEqual(["day", "msg", "msg", "msg", "day", "service"]);
    const msgs = rows.filter((r) => r.k === "msg") as Extract<(typeof rows)[number], { k: "msg" }>[];
    expect(msgs.map((r) => [r.first, r.last])).toEqual([
      [true, false],
      [false, true],
      [true, true],
    ]);
  });
});
