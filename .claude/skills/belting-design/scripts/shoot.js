// Belting ERP sahifalarini soxta API ma'lumoti bilan suratga olish (Playwright MCP: browser_run_code_unsafe,
// filename = shu fayl). Haqiqiy API'ga so'rov ketmaydi — /app/api/erp/** soxta javob bilan almashtiriladi.
// Natija: OUT papkasida <sahifa>-<desk|mob>.png. Qaytaradi: sahifa JS xatolari ro'yxati (bo'sh bo'lishi kerak).
// BASE — ishlab turgan web server (sahifa HTML/CSS/JS shu yerdan); OUT — .gitignore'dagi papka.
async (page) => {
  const BASE = "http://127.0.0.1:8770";
  const OUT = "/Users/muhammadali/Desktop/belting_erp/.playwright-mcp/shots/";
  const ONLY = null;            // masalan ["sex", "katalog"] — faqat shular

  const ME = { tg_id: 1, name: "Sinov", roles: ["admin"], firms: [{ id: 1, code: "BR", name: "BR" }, { id: 2, code: "NB", name: "NB" }],
    warehouses: [{ id: 1, code: "ASOSIY", name: "Asosiy ombor", kind: "store" }, { id: 3, code: "SEX", name: "Ishlab chiqarish", kind: "production" }],
    kinds: ["opening", "inventory", "sale", "cut", "writeoff", "transfer"].map((code) => ({ code, title: { uz: code }, can: ["view", "create", "post"] })), see_cost: true };
  const J = (id, phase, o = {}) => ({ id, number: `BR-ST-26-000${id}`, order_number: `BR-BU-26-000${id}`, phase, priority: 0, due: "2026-11-14",
    route: "default", qty: "3", unit: "dona", spec: {}, item: "1040-8M CNFULO", char: "20 mm", size: "20 mm", customer: "Toshkent Tekstil",
    worker: phase === "new" ? null : "Akmal", late: false, ...o });
  const FX = {
    "/me": ME,
    "/dashboard": { roles: ["admin"], pages: [["savdo", "Savdo va CRM"], ["crm", "CRM (kompyuter)"], ["ombor", "Ombor"], ["katalog", "Katalog"], ["sex", "Sex"],
        ["xarid", "Xarid"], ["moliya", "Moliya"], ["mp", "Marketplace"], ["yigish", "Yig'ish (WB)"]].map(([key, title]) => ({ key, title })),
      blocks: [{ title: "Rahbariyat", items: [{ label: "Bugungi sotuv", value: 48250000, unit: "so'm" }, { label: "Oy boshidan", value: 1260400000, unit: "so'm" },
          { label: "Muddati o'tgan qarz", value: 86000000, unit: "so'm", tone: "bad" }, { label: "Ochiq buyurtmalar", value: 23 }]},
        { title: "Sex", items: [{ label: "Navbatda", value: 14 }, { label: "Kechikayotgan", value: 2, tone: "bad" }, { label: "Bugun tayyor", value: 5, tone: "ok" }] }] },
    "/shop/board": { cols: { new: [J(31, "new"), J(32, "new", { item: "Konveyer lenta PVC 2 mm", size: "800 × 12000 mm", qty: "1", lenta_project: 5, late: true, customer: "Qo'qon Don Mahsulotlari" })],
      collecting: [33, 36, 37, 38].map((i) => J(i, "collecting", { route: "rukav", item: "Рукав 450-S5M NOVOBELT", size: "", qty: "30", unit: "mm", char: null, customer: "Wildberries", due: "2026-11-15" })),
      making: [J(34, "making")], ready: [J(35, "ready")] } },
    "/shop/group": { phase: "collecting", phases: ["collecting"], jobs: [33, 36, 37].map((i) => ({ ...J(i, "collecting", { route: "rukav", item: "Рукав 450-S5M NOVOBELT", size: "", qty: "30", unit: "mm", customer: "Wildberries", due: "2026-11-15" }), left: i === 33 ? "0" : "31" })),
      plan: [{ name: "Рукав 450-S5M NOVOBELT", unit: "mm", qty: "93", taken: "31", left: "62", item_id: 9, jobs: 3, cut: "eni 30 mm",
        candidates: [{ loc: "B-03-1", block_name: "Rukavlar", code: "P00000311", width_mm: 240, qty: "240" }] }] },
    "/shop/jobs/": { ...J(33, "collecting"), belt_mark: "1040-8M", brand: "CNFULO", seller_name: "Sherzod", order_note: "Ertaga soat 10:00 gacha", accepted_at: "2026-11-12T10:00:00",
      plan: [{ name: "Рукав 1040-8M CNFULO", unit: "mm", qty: 63, left: "63", taken: "0", item_id: 9, cut: "3 × 20 mm (+1 mm kesish)",
        candidates: [{ loc: "A-01-2", block_name: "Rukavlar", code: "P00000123", width_mm: 120, qty: "120" }, { loc: "A-02-1", block_name: "Rukavlar", code: "P00000098", width_mm: 450, qty: "450" }] }],
      taken: [], log: [{ action: "accept", by: "Akmal", ts: "2026-11-12T10:00:00", data: {} }] },
    "/cat/groups": [{ id: 1, parent_id: null, name: "Rukavlar", attrs: { kind: "material", dims: "w", belt: true }, items: 2 }, { id: 2, parent_id: null, name: "Tishli remenlar", attrs: { kind: "product", belt: true }, items: 3 },
      { id: 3, parent_id: 2, name: "8M", attrs: {}, items: 2 }, { id: 4, parent_id: null, name: "Klinli remenlar", attrs: { kind: "goods", belt: true }, items: 1 }],
    "/cat/items": [
      { id: 10, name: "Рукав 1040-8M CNFULO", kind: "material", unit: "mm", dims: "w", belt_mark: "1040-8M", grp: "Rukavlar", chars: 0, qty: "1320", units: 3 },
      { id: 11, name: "1040-8M CNFULO", kind: "product", unit: "dona", belt_mark: "1040-8M", grp: "8M", parent_grp: "Tishli remenlar", chars: 4, qty: "12", units: 1 },
      { id: 12, name: "SPB-1650 Lp PIX", kind: "goods", unit: "dona", belt_mark: "SPB-1650 Lp", grp: "Klinli remenlar", chars: 0, qty: "0", units: 0 }],
    "/wh/tree": { store: { id: 1, name: "Asosiy ombor" }, loose: [], restricted: false, blocks: [{ id: 1, code: "A", name: "Rukavlar", units: 3, mine: false, staff: [{ tg_id: 5, name: "Akmal" }, { tg_id: 6, name: "Dilshod" }],
      racks: [{ rack: "01", units: 3, cells: [1, 2, 3, 4].map((s) => ({ id: 100 + s, code: `A-01-${s}`, units: s === 2 ? 3 : 0 })) }, { rack: "", units: 0, cells: [{ id: 200, code: "A-POL", units: 0 }] }] }] },
    "/stock/dashboard": { stock: { units: 412, items: 96, rolls: 61, pieces: 18, no_loc: 7, value: 845000000 }, picks: 3, accuracy: 98.4, counted_positions: 52,
      slow_days: 180, slow_units: 11, scrap_pct: 4.2, pending_units: 0, low: [{ name: "Рукав 1600-8M MEGADYNE", min_qty: 2000, qty: 640, unit: "mm" }], today: { opening: 12, cut: 4 }, counts: [] },
    "/stock/cycle": { summary: { A: { items: 18, due: 4, days: 30 }, B: { items: 31, due: 2, days: 90 }, C: { items: 47, due: 0, days: 180 } }, due: [], due_total: 6 },
    "/picks": [{ id: 7, number: "BR-BU-26-00019", date: "2026-11-12", customer: "Andijon Paxta", names: ["850-8M CNFULO"], firm: "BR", channel: "wb", lines: 1 }],
    "/place/recent": [{ id: 90, number: "BR-BQ-26-00012", date: "2026-11-12T22:10:00", author: 1, loc: "A-01-2", firm: "BR", name: "Рукав 1040-8M CNFULO", unit: "mm", qty: "450", lines: 1 }],
    "/wh/unplaced": [{ batch_id: 501, code: "P00000501", width_mm: 380, name: "Рукав 1250-S8M NOVOBELT", unit: "mm", qty: "380", firm: "BR", doc: "BR-KR-26-00004" }],
  };
  const pick = (p) => { const k = Object.keys(FX).sort((a, b) => b.length - a.length).find((x) => p.includes(x)); return k ? FX[k] : []; };
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});   // oldingi ishga tushirishlardan qolgan marshrutlar
  await page.route("**/app/api/erp/**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(pick(new URL(r.request().url()).pathname)) }));
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const shot = async (name, url, w, h, after) => {
    if (ONLY && !ONLY.includes(name.split("-")[0])) return;
    await page.setViewportSize({ width: w, height: h });
    await page.goto("about:blank");
    for (let i = 0; i < 3; i++) {   // oldingi sahifa navigatsiyasi bekor qilsa — qayta
      try { await page.goto(BASE + url, { waitUntil: "domcontentloaded" }); break; } catch (e) { if (i === 2) throw e; await page.waitForTimeout(300); }
    }
    await page.waitForTimeout(900);
    if (after) { await after(); await page.waitForTimeout(500); }
    await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
  };
  await shot("home-mob", "/app/erp", 390, 844);
  await shot("ombor-desk", "/app/erp/ombor", 1440, 900);
  await shot("ombor-mob", "/app/erp/ombor", 390, 844, () => page.click('[data-seg] [data-k="place"]'));
  await shot("katalog-desk", "/app/erp/katalog", 1440, 860);
  await shot("katalogwh-desk", "/app/erp/katalog", 1440, 860, () => page.click('.dk-nav[data-k="wh"]'));
  await shot("sex-desk", "/app/erp/sex", 1440, 820);
  await shot("sexjob-mob", "/app/erp/sex?job=33", 390, 1300);
  const selMob = async () => { await page.click('[data-seg] [data-k="collecting"]'); await page.click('[data-sb="on"]');
    await page.click('#ml [data-j="33"]'); await page.click('[data-sb="like"]'); };
  await shot("sexsel-mob", "/app/erp/sex", 390, 844, selMob);
  await shot("sexsel-desk", "/app/erp/sex", 1440, 820, async () => { await page.click("#selb"); await page.click('.kb [data-j="33"]'); await page.click('.kb [data-j="36"]'); });
  await shot("sexgrp-mob", "/app/erp/sex", 390, 1100, async () => { await selMob(); await page.click("#mainbtn button"); await page.waitForTimeout(600); });
  return errs;
}
