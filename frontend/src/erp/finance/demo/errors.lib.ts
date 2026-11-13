// Demo backend xatosi: biznes qoidasi buzildi → 400 (matni "topilmadi" bilan tugasa — 404, "Ruxsat yo'q" — 403).
export class Invalid extends Error {}

export function statusOf(e: Invalid): number {
  if (e.message.startsWith("Ruxsat yo'q")) return 403;
  return e.message.endsWith("topilmadi") ? 404 : 400;
}
