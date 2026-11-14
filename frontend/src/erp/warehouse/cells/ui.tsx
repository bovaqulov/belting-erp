// Joylar (faqat ko'rinish): ombor, "Joylar yaratish" oynasi (zona, javon oralig'i, qavatlar — oldindan ko'rish), ro'yxat.
import { useState, type ReactNode } from "react";

import { Modal } from "@/erp/kit/modal";
import { Empty, Icon, List, Loaded, Row, Sf, Sh } from "@/erp/kit/ui";
import { Btns, Pane, Split } from "@/erp/warehouse/common";
import { genCells, type Cell } from "@/erp/warehouse/lib";

type St = { data: Cell[] | undefined; err: string; net: boolean; reload: () => Promise<void> };

function CreateModal({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (codes: string[]) => void }) {
  const [z, setZ] = useState("A");
  const [a, setA] = useState("1");
  const [b, setB] = useState("5");
  const [f, setF] = useState("3");
  const codes = genCells(z, parseInt(a), parseInt(b), parseInt(f || "0"));
  return (
    <Modal
      title="Joylar yaratish"
      ok="Yaratish"
      onClose={onCancel}
      onOk={() => {
        if (!codes.length) return false;
        onSubmit(codes);
        return false;
      }}
    >
      <label className="l" htmlFor="c-z">
        Zona (harf)
      </label>
      <input id="c-z" className="inp code w-full" value={z} maxLength={3} onChange={(e) => setZ(e.target.value)} />
      <div className="grid grid-cols-2 gap-2.5 [&_.inp]:w-full">
        <div>
          <label className="l" htmlFor="c-a">
            Javon: dan
          </label>
          <input id="c-a" className="inp w-full" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} />
        </div>
        <div>
          <label className="l" htmlFor="c-b">
            gacha
          </label>
          <input id="c-b" className="inp w-full" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value)} />
        </div>
      </div>
      <label className="l" htmlFor="c-f">
        Qavatlar soni (0 — qavatsiz)
      </label>
      <input id="c-f" className="inp w-full" inputMode="numeric" value={f} onChange={(e) => setF(e.target.value)} />
      <p className={`mt-2.5 mb-0 text-[13px] text-hint ${codes.length ? "" : "text-danger"}`} aria-live="polite">
        {codes.length ? (
          <>
            {codes.length} ta: <span className="code">{codes.slice(0, 4).join(", ")}</span>
            {codes.length > 4 ? (
              <>
                {" … "}
                <span className="code">{codes[codes.length - 1]}</span>
              </>
            ) : null}
          </>
        ) : (
          "Oraliq noto'g'ri"
        )}
      </p>
    </Modal>
  );
}

export function CellsView({
  wide,
  st,
  cells,
  wh,
  sel,
  creating,
  detail,
  onWh,
  onSel,
  onCreate,
  onCancel,
  onSubmit,
  onPdfAll,
}: {
  wide: boolean;
  st: St;
  cells: Cell[];
  wh: string;
  sel: Cell | null;
  creating: boolean;
  detail: ReactNode;
  onWh: () => void;
  onSel: (c: Cell | null) => void;
  onCreate: () => void;
  onCancel: () => void;
  onSubmit: (codes: string[]) => void;
  onPdfAll: () => void;
}) {
  const modal = creating ? <CreateModal onCancel={onCancel} onSubmit={onSubmit} /> : null;
  if (!wide && detail)
    return (
      <>
        <Btns>
          <button className="btn plain" onClick={() => onSel(null)}>
            <Icon n="back" /> Joylar ro&apos;yxati
          </button>
        </Btns>
        {detail}
      </>
    );
  const left = (
    <>
      <List>
        <Row icon="store" color="gray" t="Ombor" val={wh} chev onClick={onWh} />
        <Row icon="plus" color="blue" t="Joylar yaratish" s="Zona, qator va qavat oralig'i bo'yicha" chev onClick={onCreate} />
        {cells.length ? <Row icon="printer" color="orange" t={`Barcha yorliqlar PDF (${cells.length})`} onClick={onPdfAll} /> : null}
      </List>
      <Loaded st={st}>
        {() => (
          <>
            <Sh t="Joylar" r={cells.length || undefined} />
            {cells.length ? (
              <List>
                {cells.map((c) => (
                  <Row
                    key={c.id}
                    icon="pin"
                    color="red"
                    cls={sel?.id === c.id ? "bg-link/12" : ""}
                    t={<span className="code">{c.code}</span>}
                    val={<span className="num">{c.units}</span>}
                    valSmall="birlik"
                    chev
                    onClick={() => onSel(c)}
                  />
                ))}
              </List>
            ) : (
              <Sf>
                Manzil formati: ZONA-QATOR-QAVAT, masalan <span className="code">A-03-2</span> (A zona, 3-javon, 2-qavat). Yorliqni javonga yopishtiring; sanash va
                ko&apos;chirishda avval joyni skanerlang.
              </Sf>
            )}
          </>
        )}
      </Loaded>
    </>
  );
  return (
    <>
      <Split
        wide={wide}
        kind="r"
        left={left}
        right={
          detail ??
          (wide ? (
            <Pane>
              <Empty icon="pin" title="Joyni tanlang">
                Undagi birliklar va yorliq shu yerda
              </Empty>
            </Pane>
          ) : null)
        }
      />
      {modal}
    </>
  );
}
