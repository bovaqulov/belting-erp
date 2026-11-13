import type { NextConfig } from "next";

// Statik eksport: build natijasi (out/) ni /app ostida bitta domendan berish uchun (bitta domen — Telegram Mini App,
// cookie va initData muammosiz). SSR / API route'lari yo'q — barcha ma'lumot /app/api/* dan (backend).
const isDev = process.env.NODE_ENV === "development";
// belting_erp/backend (Django, scripts/dev.sh). Eski jarvis backend: JARVIS_BACKEND=http://127.0.0.1:8770
const BACKEND = process.env.JARVIS_BACKEND ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/app",
  trailingSlash: true, // out/report/index.html — backend shu yo'l bilan beradi
  images: { unoptimized: true },
  reactStrictMode: true,
  // faqat `next dev`: cloudflared tezkor tunnel (manzil har safar o'zgaradi) orqali HMR va dev resurslari
  allowedDevOrigins: ["*.trycloudflare.com"],
  // faqat `next dev`: API backend'ga proksi (eksport bilan rewrites ishlatilmaydi)
  ...(isDev && {
    async rewrites() {
      // basePath manbaga avtomatik qo'shiladi: /app/api/* → backend /app/api/*
      return [{ source: "/api/:path*", destination: `${BACKEND}/app/api/:path*` }];
    },
  }),
};

export default nextConfig;
