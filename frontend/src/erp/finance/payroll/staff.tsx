// Xodimlar (maosh uchun): ism, lavozim, bo'lim, oklad, ishga kirgan sana, telefon; faol emas — oylik hisobga kirmaydi.
import { useState } from "react";

import { toast } from "@/erp/kit/env";
import { d8, num } from "@/erp/kit/fmt";
import { Tbl } from "@/erp/kit/table";
import { Empty, Icon, List, Loaded, Row, Sf, Sheet, useLoad } from "@/erp/kit/ui";
import { api, post } from "@/erp/finance/api";
import { useAcc } from "@/erp/finance/context";
import type { Employee } from "@/erp/finance/lib";

export function Staff() {
  const { admin, wide } = useAcc();
  const [edit, setEdit] = useState<Partial<Employee> | null>(null);
  const st = useLoad(() => (admin ? api<Employee[]>("/app/api/erp/payroll/staff") : Promise.resolve([])), [admin]);
  if (!admin) return <Empty icon="alert" title="Ruxsat yo'q">Maoshlarni faqat rahbariyat ko&apos;radi.</Empty>;
  return (
    <>
      <div className="acc-filt">
        <button type="button" className="b pri" onClick={() => setEdit({ active: true })}>
          <Icon n="plus" /> Yangi xodim
        </button>
      </div>
      <Loaded st={st}>
        {(rs) => {
          const on = rs.filter((e) => e.active);
          return !rs.length ? (
            <Empty icon="users" title="Xodim yo'q">«Yangi xodim» bilan qo&apos;shing.</Empty>
          ) : (
            <>
              <div className="sf acc-cnt">
                {on.length} faol xodim · oklad jami {num(on.reduce((a, e) => a + e.salary, 0), 0)} so&apos;m
              </div>
              {wide ? (
                <Tbl
                  label="Xodimlar"
                  rows={rs}
                  rowKey={(e) => String(e.id)}
                  onRow={setEdit}
                  cols={[
                    { h: "Xodim", f: (e) => <span className={e.active ? "" : "hint-t"}>{e.name}</span> },
                    { h: "Lavozim", f: (e) => e.position },
                    { h: "Bo'lim", f: (e) => e.dept },
                    { h: "Oklad, so'm", f: (e) => num(e.salary, 0), n: true },
                    { h: "Ishga kirgan", f: (e) => d8(e.hired), n: true },
                    { h: "Holat", f: (e) => (e.active ? <span className="st done">Faol</span> : <span className="st">Ishlamaydi</span>) },
                  ]}
                />
              ) : (
                <List>
                  {rs.map((e) => (
                    <Row
                      key={e.id}
                      icon="user"
                      color={e.active ? "blue" : "gray"}
                      t={e.name}
                      s={`${e.position} · ${e.dept}${e.active ? "" : " · ishlamaydi"}`}
                      val={<span className="num">{num(e.salary, 0)}</span>}
                      valSmall="so'm"
                      chev
                      onClick={() => setEdit(e)}
                    />
                  ))}
                </List>
              )}
            </>
          );
        }}
      </Loaded>
      {edit ? (
        <StaffForm
          e={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            void st.reload();
          }}
        />
      ) : null}
    </>
  );
}

function StaffForm({ e, onClose, onSaved }: { e: Partial<Employee>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: e.name ?? "",
    position: e.position ?? "",
    dept: e.dept ?? "",
    salary: e.salary ? String(e.salary) : "",
    hired: e.hired ?? new Date().toISOString().slice(0, 10),
    phone: e.phone ?? "",
    active: e.active ?? true,
  });
  const inp = (k: "name" | "position" | "dept" | "salary" | "phone", label: string, o: { num?: boolean; ph?: string } = {}) => (
    <div className="field col">
      <label htmlFor={`acc-s${k}`}>{label}</label>
      <input id={`acc-s${k}`} inputMode={o.num ? "decimal" : undefined} value={f[k]} placeholder={o.ph} onChange={(x) => setF((y) => ({ ...y, [k]: x.target.value }))} />
    </div>
  );
  return (
    <Sheet
      title={e.id ? "Xodim" : "Yangi xodim"}
      done="Saqlash"
      onClose={onClose}
      onDone={async () => {
        await post("/app/api/erp/payroll/staff", { id: e.id, ...f });
        toast("Saqlandi");
        onSaved();
        return false;
      }}
    >
      <List>
        {inp("name", "Ism familiya", { ph: "masalan: Akmal Karimov" })}
        {inp("position", "Lavozim", { ph: "Sotuv menejeri" })}
        {inp("dept", "Bo'lim", { ph: "Savdo" })}
      </List>
      <List cls="acc-two" style={{ marginTop: 8 }}>
        {inp("salary", "Oklad, so'm", { num: true, ph: "6 000 000" })}
        <div className="field col">
          <label htmlFor="acc-shired">Ishga kirgan</label>
          <input id="acc-shired" type="date" value={f.hired} onChange={(x) => setF((y) => ({ ...y, hired: x.target.value }))} />
        </div>
        {inp("phone", "Telefon", { ph: "998901234567" })}
        <div className="field">
          <label htmlFor="acc-sact">Ishlaydi</label>
          <input id="acc-sact" type="checkbox" className="switch" checked={f.active} onChange={(x) => setF((y) => ({ ...y, active: x.target.checked }))} />
        </div>
      </List>
      <Sf>Oklad o&apos;zgarsa — qoralamadagi oy «Qayta hisoblash» bilan yangilanadi; tasdiqlangan oylar o&apos;zgarmaydi.</Sf>
    </Sheet>
  );
}
