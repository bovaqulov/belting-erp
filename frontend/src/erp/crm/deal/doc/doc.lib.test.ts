import { describe, expect, it } from "vitest";

import { docHtml, docTitle } from "./doc.lib";

const D = {
  id: 1,
  deal_id: 7,
  deal_title: "#7 SPB",
  number: "BR-TT-26-00001",
  kind: "quote",
  date: "2026-11-16",
  total: "1900000",
  lines: [{ name: "Ремень <SPB> 1650", unit: "dona", qty: "10", price: "185000", discount: "0", amount: "1850000" }],
  meta: { customer: "Chinoz & Co", sub: "1850000", logistics: "50000" },
};

describe("doc.lib", () => {
  it("sarlavha va HTML: qatorlar, narxlash, xavfsiz matn", () => {
    expect(docTitle(D)).toBe("Tijorat taklifi BR-TT-26-00001");
    const h = docHtml(D);
    expect(h).toContain("Ремень &lt;SPB&gt; 1650");
    expect(h).toContain("Chinoz &amp; Co");
    expect(h).toContain("Logistika");
    expect(h).toContain("1 900 000 so'm");
    expect(h).not.toContain("Chegirma 0");
    expect(h).not.toContain("QQS");
    expect(h).not.toContain("<th class=\"n\">Chegirma</th>"); // chegirmasiz — ustun yo'q
    expect(docHtml(D, "https://x/logo.png")).toContain('<img src="https://x/logo.png"');
  });
});
