// Kategoriyalar: 2 daraja (kategoriya → ichki). Har birida odatiy qiymatlar — tovar turi, o'lchov, "remen belgisi"
// (yoqilsa tovar formasida profil/uzunlik/brend so'raladi, nom avtomatik). Bo'sh bo'lsa — tavsiya etilganlarni qo'shish.
import { useState } from "react";

import { confirm, toast } from "@/erp/kit/env";
import { Empty, Icon, List, Row, Sf, Sh, Sheet } from "@/erp/kit/ui";
import { post } from "@/erp/finance/api";
import { useAcc } from "@/erp/finance/context";
import { DIMS, groupDesc, KCOL, KIND, type Dims, type Group, type GroupAttrs, type Kind } from "@/erp/finance/lib";

type Edit = Partial<Group> | null;

export function Groups() {
  const { groups, reloadGroups } = useAcc();
  const [edit, setEdit] = useState<Edit>(null);
  const tops = groups.filter((g) => !g.parent_id);
  const seed = async () => {
    try {
      const r = await post<unknown[]>("/app/api/erp/cat/groups/seed");
      toast(`Qo'shildi: ${r.length}`);
      await reloadGroups();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <>
      <div className="sf acc-cnt">
        {tops.length} kategoriya · {groups.length - tops.length} ichki
      </div>
      <div className="btns">
        <button className="btn" onClick={() => setEdit({})}>
          <Icon n="plus" /> Kategoriya
        </button>
        {tops.length ? null : (
          <button className="btn sec" onClick={() => void seed()}>
            Tavsiya etilganlarni qo&apos;shish
          </button>
        )}
      </div>
      {tops.length ? (
        <div className="acc-grid">
          {tops.map((g) => (
            <div key={g.id} className="acc-gcard">
              <List>
                <Row
                  icon="layers"
                  color={g.attrs.kind ? KCOL[g.attrs.kind] : "gray"}
                  t={<b>{g.name}</b>}
                  s={groupDesc(g.attrs) || "odatiy qiymat yo'q"}
                  val={<span className="num">{g.items + groups.filter((c) => c.parent_id === g.id).reduce((n, c) => n + c.items, 0)}</span>}
                  valSmall="tovar"
                  chev
                  onClick={() => setEdit(g)}
                />
                {groups
                  .filter((c) => c.parent_id === g.id)
                  .map((c) => (
                    <Row key={c.id} lead={<span className="acc-ind" />} t={`› ${c.name}`} s={groupDesc(c.attrs)} val={<span className="num">{c.items}</span>} chev onClick={() => setEdit(c)} />
                  ))}
                <Row lead={<span className="acc-ind" />} t="+ Ichki kategoriya" tcls="link" tap onClick={() => setEdit({ parent_id: g.id })} />
              </List>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon="layers" title="Kategoriya yo'q">
          Masalan: Rukavlar (xom ashyo, eni mm), Tishli remenlar (tayyor mahsulot), Klinli remenlar (tovar). Tavsiya etilganlarni qo&apos;shib, keyin
          o&apos;zgartirishingiz mumkin.
        </Empty>
      )}
      {edit ? <GroupForm g={edit} onClose={() => setEdit(null)} /> : null}
    </>
  );
}

function GroupForm({ g, onClose }: { g: Partial<Group>; onClose: () => void }) {
  const { groups, reloadGroups } = useAcc();
  const a = g.attrs ?? {};
  const parent = groups.find((x) => x.id === g.parent_id);
  const [name, setName] = useState(g.name ?? "");
  const [ru, setRu] = useState(g.name_ru ?? "");
  const [kind, setKind] = useState<Kind | "">(a.kind ?? "");
  // "-" — ota kategoriyadagidek (ichki) / dona (asosiy); "" — dona (ichkida aniq tanlov)
  const [dims, setDims] = useState<Dims | "" | "-">(a.dims ?? "-");
  const [belt, setBelt] = useState(!!a.belt);
  const drop = async () => {
    if (!(await confirm(`«${g.name}» o'chirilsinmi?`))) return;
    try {
      await post(`/app/api/erp/cat/groups/${g.id}/drop`);
      toast("O'chirildi");
      await reloadGroups();
      onClose();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <Sheet
      title={g.id ? "Kategoriya" : parent ? `${parent.name} › ichki` : "Yangi kategoriya"}
      done="Saqlash"
      onClose={onClose}
      onDone={async () => {
        const attrs: GroupAttrs = { kind: kind || undefined, belt: belt || undefined };
        if (dims !== "-") attrs.dims = dims || undefined;
        await post("/app/api/erp/cat/groups", { id: g.id, parent_id: g.parent_id, name, name_ru: ru, attrs, sort: g.sort });
        toast("Saqlandi");
        await reloadGroups();
      }}
    >
      <List>
        <div className="field col">
          <label htmlFor="acc-gn">Nomi</label>
          <input id="acc-gn" value={name} onChange={(e) => setName(e.target.value)} placeholder="masalan Rukavlar" />
        </div>
        <div className="field col">
          <label htmlFor="acc-gr">Ruscha nomi (ixtiyoriy)</label>
          <input id="acc-gr" value={ru} onChange={(e) => setRu(e.target.value)} />
        </div>
      </List>
      <Sh t="Shu kategoriyadagi tovar odatda" />
      <List>
        <div className="field">
          <label htmlFor="acc-gk">Turi</label>
          <select id="acc-gk" value={kind} onChange={(e) => setKind(e.target.value as Kind | "")}>
            <option value="">{parent ? "ota kategoriyadagidek" : "—"}</option>
            {(Object.keys(KIND) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="acc-gd">O&apos;lchov</label>
          <select id="acc-gd" value={dims} onChange={(e) => setDims(e.target.value as Dims | "" | "-")}>
            <option value="-">{parent ? "ota kategoriyadagidek" : "Dona"}</option>
            {DIMS.slice(parent ? 0 : 1).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="acc-gb">Remen belgisi</label>
          <input id="acc-gb" type="checkbox" className="switch" checked={belt} onChange={(e) => setBelt(e.target.checked)} />
        </div>
      </List>
      <Sf>Remen belgisi yoqilsa — tovar formasida profil, uzunlik va brend so&apos;raladi, nom avtomatik tuziladi (1040-8M MEGADYNE).</Sf>
      {g.id ? (
        <div className="btns">
          <button className="btn danger" onClick={() => void drop()}>
            O&apos;chirish
          </button>
        </div>
      ) : null}
    </Sheet>
  );
}
