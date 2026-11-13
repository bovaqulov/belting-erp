import { describe as group, expect, it } from "vitest";

import { canManage, fromDept, type Schedule } from "./model";
import { blankSchedule, describe, nextRun, validateSchedule, whenText } from "./schedule.lib";

const S = (p: Partial<Schedule>): Schedule => ({ ...blankSchedule("s"), title: "Hisobot", instruction: "Kunlik savdo hisobotini yubor", ...p });
// 2026-11-13 Ju (juma) 10:00 Toshkent = 05:00 UTC
const NOW = new Date(Date.UTC(2026, 10, 13, 5, 0));

group("describe", () => {
  it("matnlar", () => {
    expect(describe(S({ repeat: "daily", time: "09:00" }))).toBe("Har kuni 09:00");
    expect(describe(S({ repeat: "weekly", days: [5, 1, 3] }))).toBe("Du, Cho, Ju 09:00");
    expect(describe(S({ repeat: "weekly", days: [1, 2, 3, 4, 5] }))).toBe("Ish kunlari 09:00");
    expect(describe(S({ repeat: "monthly", day: 5, time: "10:00" }))).toBe("Har oy 5-kuni 10:00");
    expect(describe(S({ repeat: "once", date: "2026-11-14" }))).toBe("14.11.2026 09:00");
  });
});

group("nextRun (Toshkent)", () => {
  it("bugun o'tib ketgan — ertaga; hali kelmagan — bugun", () => {
    expect(nextRun(S({ time: "09:00" }), NOW)?.toISOString()).toBe("2026-11-14T04:00:00.000Z");
    expect(nextRun(S({ time: "18:30" }), NOW)?.toISOString()).toBe("2026-11-13T13:30:00.000Z");
  });
  it("haftalik: juma o'tgan → dushanba", () => {
    expect(nextRun(S({ repeat: "weekly", days: [1, 5], time: "09:00" }), NOW)?.toISOString()).toBe("2026-11-16T04:00:00.000Z");
  });
  it("oylik, bir martalik, o'chiq", () => {
    expect(nextRun(S({ repeat: "monthly", day: 1 }), NOW)?.toISOString()).toBe("2026-12-01T04:00:00.000Z");
    expect(nextRun(S({ repeat: "once", date: "2026-11-12" }), NOW)).toBeNull();
    expect(nextRun(S({ enabled: false }), NOW)).toBeNull();
  });
  it("whenText", () => {
    expect(whenText(new Date("2026-11-13T13:30:00Z"), NOW)).toBe("bugun 18:30");
    expect(whenText(new Date("2026-11-14T04:00:00Z"), NOW)).toBe("ertaga 09:00");
    expect(whenText(new Date("2026-11-16T04:00:00Z"), NOW)).toBe("16.11 09:00");
  });
});

group("validateSchedule", () => {
  it("xatolar", () => {
    expect(validateSchedule(S({}))).toEqual([]);
    expect(validateSchedule(S({ title: "", time: "25:00" }))).toHaveLength(2);
    expect(validateSchedule(S({ repeat: "weekly", days: [] }))[0]).toMatch(/kun/);
    expect(validateSchedule(S({ repeat: "once", date: "" }))[0]).toMatch(/Sana/);
  });
});

group("model", () => {
  it("canManage: owner/admin, IT, rahbariyat", () => {
    const depts = [{ key: "rahbariyat", sees_all: true }, { key: "it" }, { key: "ombor" }];
    expect(canManage({ user: { role: "admin" } }, depts)).toBe(true);
    expect(canManage({ user: { role: "employee", departments: ["it"] } }, depts)).toBe(true);
    expect(canManage({ user: { role: "employee", departments: ["rahbariyat"] } }, depts)).toBe(true);
    expect(canManage({ user: { role: "employee", departments: ["ombor"] } }, depts)).toBe(false);
    expect(canManage(null, depts)).toBe(false);
  });
  it("fromDept: bo'lim → bo'lim agenti, guruhlar → kanallar", () => {
    const a = fromDept({
      key: "it", title: "", name: "IT", icon: "monitor", color: "#8e8e93", tools: ["web"], model: "m", sees_all: false,
      persona: "p", members: 0, chats: [{ chat_id: -100, title: "IT guruh", dept: "it" }],
    } as never);
    expect(a).toMatchObject({ kind: "dept", scopes: {}, schedules: [], tasks: [] });
    expect(a.channels).toEqual([{ id: "tg-100", type: "telegram_group", ref: "IT guruh", mode: "auto" }]);
  });
});
