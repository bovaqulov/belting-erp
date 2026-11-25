// Bank va kassa: firma bo'yicha hisoblar (kassa, bank, karta) va joriy qoldiq; valyuta bo'yicha jami. Hisob → uning
// hujjatlari (jurnal, hisob filtri bilan). 1C'dan kelgan qoldiq — sanasi bilan.
import { api } from "@/erp/kit/env";
import { Empty, List, Loaded, Row, Sf, Sh, useLoad } from "@/erp/kit/ui";

import { ACC_ICON, cur, sum, totalsBy, type Account, type Refs } from "./lib";

export function Accounts({ refs, onAccount, onSettings }: { refs: Refs; onAccount: (id: number) => void; onSettings: () => void }) {
  const st = useLoad(() => api<Account[]>("/app/api/erp/money/accounts"), []);
  return (
    <Loaded st={st}>
      {(accs) =>
        !accs.length ? (
          <Empty icon="bank" title="Kassa va bank hisoblari yo'q">
            Sozlamalarda hisob qo&apos;shing yoki 1C&apos;dan import qiling (manage.py money_import_1c).
            <div className="btns">
              <button className="btn" onClick={onSettings}>
                Sozlamalar
              </button>
            </div>
          </Empty>
        ) : (
          <div className="mx-auto max-w-[900px] pb-6">
            <div className="mx-4 mt-2 grid grid-cols-1 gap-2 min-[600px]:grid-cols-2">
              {totalsBy(accs).map(([c, v]) => (
                <div key={c} className="rounded-xl bg-sec px-4 py-3">
                  <div className="text-[13px] text-hint">Jami ({cur(c)})</div>
                  <div className={`num text-[24px] font-bold ${v < 0 ? "text-st-bad" : ""}`}>{sum(v)}</div>
                </div>
              ))}
            </div>
            {refs.firms
              .map((f) => [f, accs.filter((a) => a.firm === f.code)] as const)
              .filter(([, xs]) => xs.length)
              .map(([f, xs]) => (
                <div key={f.code}>
                  <Sh t={f.name} />
                  <List>
                    {xs.map((a) => (
                      <Row
                        key={a.id}
                        icon={ACC_ICON[a.kind]}
                        color={a.kind === "cash" ? "green" : a.kind === "bank" ? "blue" : "purple"}
                        t={a.name}
                        s={[a.kind_name, a.main ? "asosiy" : null, a.from_1c && a.opening_date ? `1C qoldig'i ${a.opening_date.split("-").reverse().join(".")}` : null].filter(Boolean).join(" · ")}
                        val={<span className={`num ${Number(a.balance) < 0 ? "text-st-bad" : ""}`}>{sum(a.balance)}</span>}
                        valSmall={cur(a.currency)}
                        chev
                        onClick={() => onAccount(a.id)}
                      />
                    ))}
                  </List>
                </div>
              ))}
            <Sf>Qoldiq = boshlang&apos;ich (1C&apos;dan) + o&apos;tkazilgan kirim − chiqim ± o&apos;tkazishlar. Sotuv to&apos;lovlari avtomatik kirim bo&apos;ladi.</Sf>
          </div>
        )
      }
    </Loaded>
  );
}
