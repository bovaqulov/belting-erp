// Sozlamalar: kassalar va bank hisoblari (firma, turi, nomi, hisob raqam, bank, MFO, valyuta, boshlang'ich qoldiq,
// asosiy — sotuv to'lovlari shu yerga), pul oqimi moddalari (kirim / chiqim; qo'shish, nomini o'zgartirish, o'chirish).
import { useState } from "react";

import { api, post, toast } from "@/erp/kit/env";
import { useDialogs } from "@/erp/kit/modal";
import { Icon, List, Loaded, Row, Sf, Sh, Sheet, useLoad } from "@/erp/kit/ui";

import { ACC_ICON, cur, sum, type Account, type FlowItem, type Refs } from "./lib";

type AF = { firm: string; kind: string; name: string; number: string; bank: string; mfo: string; currency: string; opening: string; opening_date: string; main: boolean; active: boolean };

function AccForm({ a, refs, onClose, onSaved }: { a: Account | null; refs: Refs; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<AF>(() => ({
    firm: a?.firm ?? refs.firms[0]?.code ?? "",
    kind: a?.kind ?? "bank",
    name: a?.name ?? "",
    number: a?.number ?? "",
    bank: a?.bank ?? "",
    mfo: a?.mfo ?? "",
    currency: a?.currency ?? "UZS",
    opening: a?.opening ?? "0",
    opening_date: a?.opening_date ?? "",
    main: a?.main ?? false,
    active: a?.active ?? true,
  }));
  const set = <K extends keyof AF>(k: K, v: AF[K]) => setF((x) => ({ ...x, [k]: v }));
  const inp = (k: keyof AF, label: string, o: { num?: boolean; type?: string } = {}) => (
    <div className="field col">
      <label htmlFor={`ma-${k}`}>{label}</label>
      <input id={`ma-${k}`} type={o.type ?? "text"} inputMode={o.num ? "decimal" : undefined} value={String(f[k])} onChange={(e) => set(k, e.target.value as never)} />
    </div>
  );
  return (
    <Sheet
      title={a ? "Hisobni tahrirlash" : "Yangi hisob"}
      done="Saqlash"
      onClose={onClose}
      onDone={async () => {
        await post(a ? `/app/api/erp/money/accounts/${a.id}` : "/app/api/erp/money/accounts", f);
        toast("Saqlandi");
        onSaved();
      }}
    >
      <List>
        <div className="field">
          <label htmlFor="ma-firm">Firma</label>
          <select id="ma-firm" value={f.firm} onChange={(e) => set("firm", e.target.value)}>
            {refs.firms.map((x) => (
              <option key={x.code} value={x.code}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ma-kind">Turi</label>
          <select id="ma-kind" value={f.kind} onChange={(e) => set("kind", e.target.value)}>
            {refs.account_kinds.map((x) => (
              <option key={x.key} value={x.key}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ma-cur">Valyuta</label>
          <select id="ma-cur" value={f.currency} onChange={(e) => set("currency", e.target.value)}>
            {["UZS", "USD", "EUR", "RUB", "CNY"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {inp("name", "Nomi")}
        {f.kind === "bank" ? (
          <>
            {inp("number", "Hisob raqam (20 xona)", { num: true })}
            {inp("bank", "Bank")}
            {inp("mfo", "MFO", { num: true })}
          </>
        ) : null}
        {inp("opening", "Boshlang'ich qoldiq", { num: true })}
        {inp("opening_date", "Qoldiq sanasi", { type: "date" })}
        <div className="field">
          <label htmlFor="ma-main">Asosiy (sotuv to&apos;lovlari)</label>
          <input id="ma-main" type="checkbox" className="switch" checked={f.main} onChange={(e) => set("main", e.target.checked)} />
        </div>
        <div className="field">
          <label htmlFor="ma-active">Faol</label>
          <input id="ma-active" type="checkbox" className="switch" checked={f.active} onChange={(e) => set("active", e.target.checked)} />
        </div>
      </List>
      {a?.from_1c ? <Sf>1C&apos;dan import qilingan: qayta import boshlang&apos;ich qoldiq va sanani yangilaydi.</Sf> : null}
    </Sheet>
  );
}

export function Settings({ refs }: { refs: Refs }) {
  const accs = useLoad(() => api<Account[]>("/app/api/erp/money/accounts?all=1"), []);
  const items = useLoad(() => api<FlowItem[]>("/app/api/erp/money/items"), []);
  const [edit, setEdit] = useState<Account | null | "new">(null);
  const dialogs = useDialogs();
  const addItem = async (dir: "in" | "out") => {
    const name = await dialogs.ask(dir === "in" ? "Yangi kirim moddasi" : "Yangi chiqim moddasi", { label: "Nomi", ok: "Qo'shish" });
    if (!name) return;
    try {
      await post("/app/api/erp/money/items", { name, direction: dir });
      await items.reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const toggle = async (i: FlowItem) => {
    try {
      await post(`/app/api/erp/money/items/${i.id}`, { active: !i.active });
      await items.reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <div className="mx-auto max-w-[900px] pb-6">
      <Sh
        t="Kassalar va bank hisoblari"
        r={
          <button type="button" className="mini pri" onClick={() => setEdit("new")}>
            <Icon n="plus" /> Qo&apos;shish
          </button>
        }
      />
      <Loaded st={accs}>
        {(xs) => (
          <List>
            {xs.map((a) => (
              <Row
                key={a.id}
                icon={ACC_ICON[a.kind]}
                color={a.active ? "blue" : "gray"}
                t={a.name}
                s={[a.firm, a.kind_name, a.number, a.main ? "asosiy" : null, a.active ? null : "o'chirilgan"].filter(Boolean).join(" · ")}
                val={<span className="num">{sum(a.balance)}</span>}
                valSmall={cur(a.currency)}
                chev
                onClick={() => setEdit(a)}
              />
            ))}
          </List>
        )}
      </Loaded>
      <Loaded st={items}>
        {(xs) => (
          <>
            {(["in", "out"] as const).map((dir) => (
              <div key={dir}>
                <Sh
                  t={dir === "in" ? "Kirim moddalari" : "Chiqim moddalari"}
                  r={
                    <button type="button" className="mini" onClick={() => void addItem(dir)}>
                      <Icon n="plus" /> Modda
                    </button>
                  }
                />
                <List>
                  {xs
                    .filter((i) => i.direction === dir)
                    .map((i) => (
                      <Row key={i.id} t={i.name} tcls={i.active ? "" : "text-hint line-through"} s={i.code ? "tizim moddasi" : undefined} val={i.active ? "faol" : "o'chirilgan"} tap onClick={() => void toggle(i)} />
                    ))}
                </List>
              </div>
            ))}
            <Sf>Moddani bosish — faol / o&apos;chirilgan. O&apos;chirilgan modda yangi hujjatlarda chiqmaydi.</Sf>
          </>
        )}
      </Loaded>
      {dialogs.node}
      {edit ? (
        <AccForm
          a={edit === "new" ? null : edit}
          refs={refs}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            void accs.reload();
          }}
        />
      ) : null}
    </div>
  );
}
