import { describe, expect, it } from "vitest";

import { chatTime, chOf, dayLabel, lastLine, unreadTotal, type TgChats } from "./tg.lib";

const NOW = new Date(2026, 10, 14, 15, 30).getTime();
const at = (d: number, h = 9, m = 5) => new Date(2026, 10, 14 - d, h, m).toISOString();

describe("tg.lib", () => {
  it("chatTime: bugun — soat, kecha, shu yil — kun.oy, boshqa yil — yil bilan", () => {
    expect(chatTime(at(0), NOW)).toBe("09:05");
    expect(chatTime(at(1), NOW)).toBe("kecha");
    expect(chatTime(at(3), NOW)).toBe("11.11");
    expect(chatTime(new Date(2025, 0, 2).toISOString(), NOW)).toBe("02.01.25");
    expect(chatTime(null, NOW)).toBe("");
  });
  it("dayLabel", () => {
    expect(dayLabel(at(0), NOW)).toBe("Bugun");
    expect(dayLabel(at(1), NOW)).toBe("Kecha");
    expect(dayLabel(at(3), NOW)).toBe("11 noyabr");
  });
  it("lastLine va unreadTotal (faqat o'z chatlari)", () => {
    expect(lastLine({ last_text: "ok", last_out: true })).toBe("Siz: ok");
    const r = { chats: [{ seller_tg: 1, unread: 2 }, { seller_tg: 2, unread: 5 }, { seller_tg: 1, unread: 1 }] } as TgChats;
    expect(unreadTotal(r, 1)).toBe(3);
    expect(unreadTotal(undefined, 1)).toBe(0);
    // kanallar bo'lsa — barcha kanallar yig'indisi (WhatsApp / Instagram ham)
    const all = { ...r, channels: { tg: { enabled: true, unread: 3 }, wa: { enabled: true, unread: 2 }, ig: { enabled: false, unread: 0 } } } as TgChats;
    expect(unreadTotal(all, 1)).toBe(5);
  });
  it("chOf: kanal ma'lumoti (yo'q bo'lsa — Telegram)", () => {
    expect([chOf("wa").name, chOf(undefined).name, chOf("ig").icon]).toEqual(["WhatsApp", "Telegram", "instagram"]);
  });
});
