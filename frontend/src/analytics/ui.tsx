// /app/analytics — Analitika (savdo, ombor, marketplace ko'rsatkichlari). Hozircha joy egallovchi: mazmuni kelishilgach
// shu papkada quriladi (API — backend ko'chirilgach).
import s from "@/shared/ui/panel/styles";
import { Icon } from "@/shared/ui/panel/ui";

export default function AnalyticsApp() {
  return (
    <>
      <div className={s.top}>
        <div className={s.wrap}>
          <div className={s.bar}>
            <a className={s["icon-btn"]} href="/app" title="Bo'limlar" aria-label="Bo'limlar">
              <Icon name="layout-grid" />
            </a>
            <div className={s.ttl}>
              <h1>Analitika</h1>
              <p>Savdo, ombor va marketplace ko&apos;rsatkichlari</p>
            </div>
          </div>
        </div>
      </div>
      <main className={s.wrap}>
        <div className={s.empty}>Tez orada.</div>
      </main>
    </>
  );
}
