// Kontragent tanlagich: qidiruv (nom yoki INN), ro'yxat; topilmasa — shu yerning o'zida yangi kontragent (nom, INN, turi).
import { useEffect, useState } from "react";

import { toast } from "@/erp/kit/env";
import { Icon, List, Row, Sf, Sh, Sheet } from "@/erp/kit/ui";
import { api, post } from "@/erp/finance/api";
import { CPKIND, type Counterparty, type CpKind } from "@/erp/finance/lib";

export function CpPicker({ onPick, onClose }: { onPick: (c: Counterparty) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [rs, setRs] = useState<Counterparty[] | null>(null);
  const [add, setAdd] = useState(false);
  const [inn, setInn] = useState("");
  const [kind, setKind] = useState<CpKind>("customer");
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api<Counterparty[]>(`/app/api/erp/counterparties?q=${encodeURIComponent(q.trim())}`)
        .then((x) => live && setRs(x))
        .catch((e) => toast((e as Error).message, "bad"));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  const create = async () => {
    try {
      const c = await post<Counterparty>("/app/api/erp/counterparties", { name: q, inn, kind });
      toast(`Qo'shildi: ${c.name}`);
      onPick(c);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <Sheet title="Kontragent" onClose={onClose}>
      <label className="search">
        <Icon n="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom yoki INN" aria-label="Kontragent qidiruvi" />
      </label>
      {rs === null ? null : rs.length ? (
        <List>
          {rs.map((c) => (
            <Row key={c.id} icon="briefcase" color={c.kind === "supplier" ? "purple" : "blue"} t={c.name} s={[c.inn && `INN ${c.inn}`, CPKIND[c.kind]].filter(Boolean).join(" · ")} tap onClick={() => onPick(c)} />
          ))}
        </List>
      ) : (
        <Sf>Topilmadi.</Sf>
      )}
      {q.trim().length >= 3 ? (
        add ? (
          <>
            <Sh t="Yangi kontragent" />
            <List>
              <Row t={q.trim()} s="nomi" />
              <div className="field col">
                <label htmlFor="acc-cpinn">INN</label>
                <input id="acc-cpinn" inputMode="numeric" value={inn} onChange={(e) => setInn(e.target.value)} placeholder="9 raqam (xorijiy — ixtiyoriy)" />
              </div>
              <div className="field">
                <label htmlFor="acc-cpk">Turi</label>
                <select id="acc-cpk" value={kind} onChange={(e) => setKind(e.target.value as CpKind)}>
                  {(Object.keys(CPKIND) as CpKind[]).map((k) => (
                    <option key={k} value={k}>
                      {CPKIND[k]}
                    </option>
                  ))}
                </select>
              </div>
            </List>
            <div className="btns">
              <button className="btn" onClick={() => void create()}>
                Qo&apos;shish va tanlash
              </button>
            </div>
          </>
        ) : (
          <List style={{ marginTop: 12 }}>
            <Row icon="plus" color="blue" t={`«${q.trim()}» — yangi kontragent`} tcls="link" tap onClick={() => setAdd(true)} />
          </List>
        )
      ) : null}
    </Sheet>
  );
}
