// Hujjatni chop etish (brauzerda — «PDF sifatida saqlash»): toza HTML sahifa (ilova uslublarisiz, oq fon). Sof funksiya.
// Ko'rinishi backend PDF'i (crm/pdf.py) bilan bir xil: logo · hujjat turi/raqam/sana, ma'lumot bloki, jadval, ramkadagi jami.
import { num } from "@/erp/kit/fmt";
import { KIND, priced, type DocFull } from "@/erp/crm/lib";

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const docTitle = (d: Pick<DocFull, "kind" | "number">): string => `${KIND[d.kind] || d.kind} ${d.number || "qoralama"}`;

/** 2026-11-16 → 16.11.2026 */
const ddmmyyyy = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : (s ?? ""));

/** Chop etish uchun HTML; logo — to'liq manzil (Blob sahifada nisbiy yo'l ishlamaydi) */
export function docHtml(d: DocFull, logo = ""): string {
  const m = d.meta || {};
  const p = priced(Number(m.sub || 0), m);
  const hasDisc = d.lines.some((x) => Number(x.discount));
  const rows = d.lines
    .map(
      (x, i) =>
        `<tr><td class="c">${i + 1}</td><td>${esc(x.name)}</td><td class="n">${esc(num(x.qty, 3))} ${esc(x.unit || "")}</td><td class="n">${esc(num(x.price, 0))}</td>${hasDisc ? `<td class="n">${Number(x.discount) ? esc(num(x.discount, 2)) + "%" : ""}</td>` : ""}<td class="n">${esc(num(x.amount, 0))}</td></tr>`,
    )
    .join("");
  const line = (label: string, v: number, sign = "") => (v ? `<tr><td>${esc(label)}</td><td class="n">${sign}${esc(num(v, 0))}</td></tr>` : "");
  const info = [
    ["Mijoz", m.customer],
    ["STIR", m.inn],
    ["Yetkazish", m.location],
    ["Bitim", d.deal_title],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<span>${k}</span><b>${esc(v)}</b>`)
    .join("");
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>${esc(docTitle(d))}</title><style>
*{box-sizing:border-box}body{font:13px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;margin:32px auto;max-width:860px;padding:0 24px}
.hd{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:2px solid #1e5aa8;margin-bottom:18px}
.hd img{height:30px}.hd .t{text-align:right}.hd h1{font-size:22px;letter-spacing:.04em;margin:0}.hd .s{color:#64707d;margin-top:2px}
.info{display:grid;grid-template-columns:110px 1fr;gap:4px 12px;background:#f5f7fa;border:1px solid #d7dde6;border-radius:10px;padding:10px 16px;margin-bottom:20px}
.info span{color:#64707d}table{border-collapse:collapse;width:100%}
.items th{background:#1e5aa8;color:#fff;font-weight:600;text-align:left;padding:8px}.items td{padding:8px;border-bottom:1px solid #d7dde6}
.items tbody tr:nth-child(even) td{background:#f5f7fa}.items th.n{text-align:right}.items th.c{text-align:center}.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.c{text-align:center;width:28px}
.tot{margin:18px 0 0 auto;width:330px;border:2px solid #1e5aa8;border-radius:10px;padding:8px 14px}
.tot td{padding:3px 0}.tot td:first-child{color:#64707d}.tot .j td{border-top:1px solid #d7dde6;padding-top:8px;font-size:17px;font-weight:700;color:#111827}
.tot .j td.n{color:#1e5aa8}.ft{margin-top:40px;color:#94a0ad;font-size:11px}
@media print{body{margin:0;max-width:none;padding:0}@page{margin:14mm}}</style></head><body>
<div class="hd">${logo ? `<img src="${esc(logo)}" alt="Belting Rezina">` : "<b>Belting Rezina</b>"}<div class="t"><h1>${esc((KIND[d.kind] || d.kind).toUpperCase())}</h1><div class="s">№ ${esc(d.number || "qoralama")} · ${esc(ddmmyyyy(d.date))}</div></div></div>
<div class="info">${info}</div>
<table class="items"><thead><tr><th class="c">№</th><th>Tovar</th><th class="n">Miqdor</th><th class="n">Narx, so'm</th>${hasDisc ? `<th class="n">Chegirma</th>` : ""}<th class="n">Summa, so'm</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot"><table><tbody><tr><td>Tovarlar</td><td class="n">${esc(num(p.sub, 0))}</td></tr>${line(`Chegirma ${num(m.discount, 2)}%`, p.disc, "−")}${line(`Ustama ${num(m.markup, 2)}%`, p.mark, "+")}${line("Logistika", p.log, "+")}<tr class="j"><td>Jami</td><td class="n">${esc(num(d.total, 0))} so'm</td></tr></tbody></table></div>
<div class="ft">Belting Rezina</div>
</body></html>`;
}
