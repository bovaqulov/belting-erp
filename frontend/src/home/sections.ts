// Tizim bo'limlari — bosh sahifa (Launcher, ruxsatga qarab) va ochiq tanishtiruv sahifasi (/, hammasi) uchun yagona ro'yxat.
export interface Card {
  key: string;
  href: string;
  title: string;
  sub: string;
  color: string;
}

export const SECTIONS: Card[] = [
  { key: "erp", href: "/app/erp", title: "ERP", sub: "Ombor, savdo, sex, CRM, marketplace, moliya", color: "#3e88f7" },
  { key: "lenta", href: "/app/lenta", title: "LentaCUD", sub: "Konveyer lenta chizmasi, PDF va loyihalar", color: "#2fa37a" },
  { key: "tgcrm", href: "/app/tgcrm", title: "TG CRM", sub: "Telegram akkauntlari va yozishmalar", color: "#2f8fd8" },
  { key: "geo", href: "/app/geo", title: "GeoMaps", sub: "Mijozlar xaritasi, hududlar, marshrutlar", color: "#12a4a0" },
  { key: "analytics", href: "/app/analytics", title: "Analitika", sub: "Savdo, ombor va marketplace ko'rsatkichlari", color: "#e5484d" },
  { key: "jarvis", href: "/app/jarvis", title: "Jarvis", sub: "AI agentlar, xotira, bilimlar, graph", color: "#9a5bea" },
  { key: "dev", href: "/app/dev", title: "Development", sub: "Audit, tizim holati va loglar", color: "#e8961f" },
];
