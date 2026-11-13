// Xato ushlagich (eng birinchi, eski lenta.html 8–30): JS xatosi bo'lsa — "Yuklanmoqda" da qotib qolmasin, ekranda ko'rinsin va
// serverga yozilsin (/app/api/lenta/clientlog, sendBeacon). Next.js'da beforeInteractive faqat root layout'da — shu sababli
// oddiy inline <script> (statik HTML'da sahifa kodidan oldin bajariladi). Eskidan farqi: #app ichini almashtirmaydi (React
// gidratsiyasi buzilmasin) — ustiga #lentaFatal qatlamini qo'yadi; sahifa yuklansa ConveyorApp uni olib tashlaydi.
export const CATCHER = `(function () {
  var sent = 0;
  function report(msg, src) {
    try {
      // brauzer ogohlantirishi (sahifa ishlayveradi) — xato sifatida yuborilmaydi va "Sahifa yuklanmadi" ko'rsatilmaydi
      if (/ResizeObserver loop/.test(String(msg))) return;
      if (sent++ < 5) {
        var body = JSON.stringify({ msg: String(msg).slice(0, 800), src: String(src || "").slice(0, 200), ua: navigator.userAgent, url: location.pathname });
        if (navigator.sendBeacon) navigator.sendBeacon("/app/api/lenta/clientlog", new Blob([body], { type: "application/json" }));
        else fetch("/app/api/lenta/clientlog", { method: "POST", headers: { "Content-Type": "application/json" }, body: body });
      }
      var app = document.getElementById("app");
      if (app && /Yuklanmoqda|Загрузка/.test(app.textContent) && !document.getElementById("lentaFatal")) {
        var d = document.createElement("div");
        d.id = "lentaFatal";
        d.setAttribute("style", "position:fixed;left:0;right:0;top:56px;bottom:0;z-index:20;background:var(--page,#0e1621);color:var(--danger,#ec3942);text-align:center;padding:60px 16px");
        d.innerHTML = "Sahifa yuklanmadi: " + String(msg).replace(/[<>&]/g, "") + "<br><small>Admin xabardor qilindi. Telegram ilovasini yangilab qayta oching.</small>";
        document.body.appendChild(d);
      }
    } catch (e) {}
  }
  window.addEventListener("error", function (e) { report(e.message || "xato", (e.filename || "") + ":" + (e.lineno || "")); });
  window.addEventListener("unhandledrejection", function (e) { report((e.reason && (e.reason.stack || e.reason.message)) || e.reason, "promise"); });
  window.__lentaReport = report;
})();`;
