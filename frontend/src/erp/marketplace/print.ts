// Chop etish oynasi (brauzer): tanlanma ro'yxati (A4) va stikerlar (termoprinter 58×40, chekkasiz).
// Printer sozlamasida qog'oz 58×40 va masshtab 100% bo'lsin. Matn faqat esc() orqali — HTML in'ektsiya yo'q.
import { toast } from "@/erp/kit/env";
import { num } from "@/erp/kit/fmt";
import { splitVat, VAT, type PickRow } from "@/erp/marketplace/lib";

export const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function printWin(title: string, body: string, label = false): void {
  const w = window.open("", "_blank");
  if (!w) {
    toast("Brauzer yangi oynani blokladi — ruxsat bering", "bad");
    return;
  }
  const page = label
    ? `@page{size:58mm 40mm;margin:0} html,body{width:58mm;margin:0;padding:0}
      .st{width:58mm;height:40mm;overflow:hidden;page-break-after:always;break-after:page;display:flex;align-items:center;justify-content:center}
      .st:last-child{page-break-after:auto;break-after:auto} .st img{width:58mm;height:40mm;object-fit:contain;display:block}`
    : `@page{size:A4;margin:10mm}`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font-family:system-ui,sans-serif;margin:0} ${page}
    table{border-collapse:collapse;width:100%;font-size:12px} td,th{border:1px solid #999;padding:4px 6px;text-align:left}
    td.n{text-align:right;white-space:nowrap} h2{font-size:16px;margin:10px 0}</style></head><body>${body}
    <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}

/** Tanlanma ro'yxati: omborda bir yurishda olish uchun — tovar bo'yicha, belgilash ustuni bilan */
export function pickingHtml(name: string, n: number, rows: PickRow[]): string {
  /** dona narxi (bir nechta buyurtmada farq qilsa — oraliq); net — QQSsiz */
  const price = (p: PickRow, net = false) => {
    if (!p.prices.length) return "—";
    const f = (x: number) => (net ? splitVat(x).net : x);
    const lo = f(Math.min(...p.prices)),
      hi = f(Math.max(...p.prices));
    return Math.round(lo) === Math.round(hi) ? num(lo, 0) : `${num(lo, 0)}–${num(hi, 0)}`;
  };
  const tr = rows
    .map(
      (p, i) =>
        `<tr><td>${i + 1}</td><td>${esc(p.title)}${p.mode === "sleeve" ? " <b>(rukavdan kesiladi)</b>" : ""}</td><td>${esc(p.vendor_code)}</td>` +
        `<td>${p.width_mm ? `${num(p.width_mm)} mm` : ""}</td><td><b>${p.qty}</b></td><td class="n">${price(p)}</td><td class="n">${price(p, true)}</td>` +
        `<td class="n"><b>${p.sum ? num(p.sum, 0) : "—"}</b></td><td style="font-size:10px">${p.orders.map(esc).join(", ")}</td><td></td></tr>`,
    )
    .join("");
  const qty = rows.reduce((a, p) => a + p.qty, 0);
  const sum = rows.reduce((a, p) => a + p.sum, 0);
  const vat = splitVat(sum);
  return `<h2>Tanlanma ro'yxati · ${esc(name)} · ${n} buyurtma</h2>
    <table><tr><th>#</th><th>Tovar</th><th>Artikul</th><th>Kenglik</th><th>Soni</th><th>Narx, so'm</th><th>QQSsiz narx, so'm</th><th>Jami, so'm</th><th>Buyurtmalar</th><th>✓</th></tr>
    ${tr}<tr><td></td><td colspan="3"><b>Jami (QQS bilan)</b></td><td><b>${qty}</b></td><td colspan="2"></td><td class="n"><b>${num(sum, 0)}</b></td><td colspan="2"></td></tr>
    <tr><td></td><td colspan="6">shu jumladan QQS ${VAT * 100}%</td><td class="n">${num(vat.vat, 0)}</td><td colspan="2"></td></tr>
    <tr><td></td><td colspan="6"><b>QQSsiz jami</b></td><td class="n"><b>${num(vat.net, 0)}</b></td><td colspan="2"></td></tr></table>
    <p style="font-size:11px;color:#666">Narx — xaridor to'lagan narx (kanal so'mga o'girgan, chegirmalardan keyin), QQS bilan. QQSsiz = jami ÷ ${num(1 + VAT, 2)}.</p>`;
}
