// Demo rejimi qarori (backend'i hali ko'chirilmagan modullar: CRM, Marketplace): sahifa ochilganda bir marta — modulning
// ishga tushish so'rovlari parallel tekshiriladi. Bittasi demo shartiga tushsa — demo (aks holda o'sha so'rov sahifani
// "ochilmadi" kartochkasida to'xtatardi). 404 (modul API yo'q), tarmoq xatosi, 5xx (dev proksi — backend o'chiq) → demo; qolgani (200, 401, 403 …) → haqiqiy API.
// 401/403 demo EMAS — kirish/ruxsat oqimi odatdagidek ishlaydi.
export type DemoMode = "real" | "demo";

export function decideMode(status: number | "network"): DemoMode {
  if (status === "network") return "demo";
  if (status === 404 || status >= 500) return "demo";
  return "real";
}

/** Bir nechta tekshiruv natijasi: bittasi demo bo'lsa — demo */
export function decideModeAll(statuses: (number | "network")[]): DemoMode {
  return statuses.some((s) => decideMode(s) === "demo") ? "demo" : "real";
}
