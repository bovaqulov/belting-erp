// Ochiq tanishtiruv sahifasi (faqat ko'rinish): tizim haqida qisqa ma'lumot, bo'limlar, ERP modullari, mijoz bilan ish
// bosqichlari va «Tizimga kirish». Kirish talab qilinmaydi — bo'lim ochilganda o'sha yerda login so'raladi.
import type { CSSProperties } from "react";

import s from "@/shared/ui/panel/styles";
import g from "@/shared/ui/tiles/styles";

import { ART } from "@/home/art";
import type { Card } from "@/home/sections";

export interface Row {
  title: string;
  sub: string;
}

export function AboutView({ sections, modules, steps }: { sections: Card[]; modules: Row[]; steps: Row[] }) {
  return (
    <div data-tg-ui="" data-panel="" className="contents">
      <div className={s.top}>
        <div className={s.wrap}>
          <div className={s.bar}>
            <div className={s.ttl}>
              <h1>
                <span className={s.brand} aria-hidden="true" />
                <span className={s.sr}>Belting</span>
              </h1>
              <p>Sanoat remenlari va lentalari</p>
            </div>
          </div>
        </div>
      </div>
      <main className={`${s.wrap} pb-10`}>
        <section className="mx-4 mt-4 rounded-2xl bg-sec px-5 py-5">
          <h2 className="m-0 text-[22px] leading-tight font-semibold text-balance">Belting boshqaruv tizimi</h2>
          <p className="mt-2 mb-0 text-[15px] leading-normal text-sub text-pretty">
            Tishli, klinli va poliklinli remenlar, rukav va konveyer lentalari bo&apos;yicha savdo, ombor, kesish sexi va
            marketplace ishini bitta joyda yuritadigan ichki tizim. Telefonda — Telegram Mini App, kompyuterda — brauzer.
          </p>
          <a href="/app/" className={`${s.btn} mt-4 no-underline coarse:min-h-11`}>
            Tizimga kirish
          </a>
        </section>

        <h2 className={s.sh}>Bo&apos;limlar</h2>
        <nav className={`${g.grid} !mt-0`} aria-label="Bo'limlar">
          {sections.map((c) => {
            const Art = ART[c.key];
            return (
              <a key={c.key} className={g.card} href={c.href} style={{ "--c": c.color } as CSSProperties}>
                <div className={g.art}>{Art && <Art />}</div>
                <div className={g.body}>
                  <div className={g.title}>
                    <span>{c.title}</span>
                  </div>
                  <div className={g.sub}>{c.sub}</div>
                </div>
              </a>
            );
          })}
        </nav>

        <h2 className={s.sh}>ERP modullari</h2>
        <div className={`${s.list} ${s.plain}`}>
          {modules.map((m) => (
            <div key={m.title} className={s.item}>
              <div className={s.main}>
                <div className={s.t}>{m.title}</div>
                <div className={`${s.s} !whitespace-normal`}>{m.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <h2 className={s.sh}>Mijoz bilan ish</h2>
        <ol className={`${s.list} m-0 list-none p-0`}>
          {steps.map((st, i) => (
            <li key={st.title} className={s.item}>
              <span className={`${s.sq} bg-btn font-code text-[15px] tabular-nums`} aria-hidden="true">
                {i + 1}
              </span>
              <div className={s.main}>
                <div className={s.t}>{st.title}</div>
                <div className={`${s.s} !whitespace-normal`}>{st.sub}</div>
              </div>
            </li>
          ))}
        </ol>
        <p className={s.sf}>Har bir xodim faqat o&apos;ziga ruxsat berilgan bo&apos;limlarni ko&apos;radi.</p>
      </main>
    </div>
  );
}
