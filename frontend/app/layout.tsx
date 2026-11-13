import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "@/shared/styles/globals.css";

export const metadata: Metadata = { title: "Agent" };

// ekranning chetigacha (viewport-fit=cover). Zoom brauzerda yoqiq; Telegram ichida lockZoom() o'chiradi (ilova kabi)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // telegram-web-app.js (beforeInteractive) gidratsiyadan oldin <html> ga --tg-viewport-* uslubini yozadi —
    // farq kutilgan; suppressHydrationWarning faqat shu element atributlariga ta'sir qiladi (bolalariga emas)
    <html lang="uz" suppressHydrationWarning>
      <body>
        {/* WebApp obyekti sahifa kodi ishga tushishidan oldin bo'lishi kerak (initData, mavzu) */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
