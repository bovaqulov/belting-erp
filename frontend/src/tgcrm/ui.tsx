// TelegramCRM karkasi: yuklanish, kirish/ruxsat/xato holatlari, markazlashgan ustun.
import type { ReactNode } from "react";

import { Empty, Skel, Top } from "./kit";

export type Boot = { k: "loading" } | { k: "ok" } | { k: "login" } | { k: "denied"; msg: string } | { k: "err"; msg: string; net: boolean };

export function TgCrmView({ boot, wide, onRetry, children }: { boot: Boot; wide?: boolean; onRetry: () => void; children: ReactNode }) {
  if (boot.k === "ok" && wide) return <main className="h-dvh">{children}</main>;
  return (
    <main className="mx-auto min-h-dvh max-w-[720px] pb-[calc(48px+var(--safe-b))]">
      {boot.k === "ok" ? (
        children
      ) : (
        <>
          <Top title="TG CRM" home="/app" />
          {boot.k === "loading" ? <Skel /> : null}
          {boot.k === "login" ? (
            <Empty icon="user" title="Kirish talab qilinadi">
              Bosh sahifada tizimga kiring, keyin shu bo&apos;limga qayting.
              <div className="btns">
                <a className="btn" href="/app">
                  Kirish
                </a>
              </div>
            </Empty>
          ) : null}
          {boot.k === "denied" ? (
            <Empty icon="shield-check" title="Bu bo'limga ruxsatingiz yo'q">
              {boot.msg}
            </Empty>
          ) : null}
          {boot.k === "err" ? (
            <Empty icon="alert" title="Yuklab bo'lmadi">
              {boot.msg}
              <br />
              {boot.net ? "Internet aloqasini tekshirib, qayta urining." : "Birozdan so'ng qayta urinib ko'ring."}
              <div className="btns">
                <button type="button" className="btn sec" onClick={onRetry}>
                  Qayta urinish
                </button>
              </div>
            </Empty>
          ) : null}
        </>
      )}
    </main>
  );
}

/** Ochiq akkaunt boshqa joyda o'chirilgan */
export const GoneView = ({ onBack }: { onBack: () => void }) => (
  <>
    <Top title="Akkaunt" onBack={onBack} />
    <Empty icon="user-x" title="Akkaunt topilmadi">
      U o&apos;chirilgan yoki sizga endi ko&apos;rinmaydi.
    </Empty>
  </>
);
