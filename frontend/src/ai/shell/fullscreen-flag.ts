// admin.html: graf to'liq ekran holati (BackButton yashirilmasligi uchun). Umumiy Telegram yordamchilari — @/shared/telegram/telegram.

// Eski kod `document.querySelector(".gcard.full")` bilan tekshirardi. Graph bo'limi to'liq ekranga kirganda
// setFullscreen(true), chiqqanda false; closeSheet shunda BackButton'ni yashirmaydi.
let fullscreen = false;
export const setFullscreen = (on: boolean): void => {
  fullscreen = on;
};
export const isFullscreen = (): boolean => fullscreen;
