import { describe, expect, it } from "vitest";

import { validateTask } from "./task.lib";

const t = (title: string, instruction: string) => ({ id: "tk1", title, instruction, due: "", status: "new" as const });

describe("validateTask", () => {
  it("nom va yetarli ko'rsatma — xato yo'q", () => {
    expect(validateTask(t("Akt", "Navoiy GMK bo'yicha qarzdorlik aktini tayyorla"))).toEqual([]);
  });
  it("nomsiz va qisqa ko'rsatma — ikkala xato", () => {
    expect(validateTask(t(" ", "qisqa"))).toHaveLength(2);
  });
});
