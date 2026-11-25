// Tezkor amallar (1C «Быстрые действия»): hujjat yaratish (buyurtma, hisob, sotish, to'lov qabul qilish) va
// ro'yxatlar (buyurtmalar, yuk xatlari, to'lovlar, mijozlar qarzi). Katta tugmalar — telefonda ham bosish oson.
import { Icon } from "@/erp/kit/ui";

import { KIND, type Group, type Kind } from "./lib";

const TILE =
  "group flex min-h-[116px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-0 bg-sec p-3 text-center text-[14px] font-medium text-fg active:scale-[.98] hover:bg-fill reduce:active:scale-100";
const ICO = "relative grid size-14 place-items-center rounded-2xl text-white [&_svg.i]:size-7";
const PLUS = "absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-full border-2 border-sec bg-ok text-white [&_svg.i]:size-3.5";
const GRID = "mx-4 grid grid-cols-2 gap-2.5 min-[600px]:grid-cols-4";
const COLOR: Record<string, string> = { blue: "#3e88f7", indigo: "#5e5ce6", orange: "#f09a37", purple: "#a65ff0", green: "#31b545", teal: "#3ab5c9", red: "#eb4d3d" };

function Tile({ icon, color, label, plus, onClick }: { icon: string; color: string; label: string; plus?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={TILE} onClick={onClick}>
      <span className={ICO} style={{ background: COLOR[color] ?? color }}>
        <Icon n={icon} />
        {plus ? (
          <span className={PLUS}>
            <Icon n="plus" />
          </span>
        ) : null}
      </span>
      {label}
    </button>
  );
}

export function Home({ onCreate, onGo, onDebts }: { onCreate: (k: Kind) => void; onGo: (g: Group[]) => void; onDebts: () => void }) {
  const make: Kind[] = ["order", "invoice", "shipment", "receipt"];
  return (
    <div className="mx-auto max-w-[900px] pb-6">
      <div className="sh">Yaratish</div>
      <div className={GRID}>
        {make.map((k) => (
          <Tile key={k} icon={KIND[k].icon} color={KIND[k].color} label={KIND[k].act} plus onClick={() => onCreate(k)} />
        ))}
      </div>
      <div className="sh mt-2">Ro&apos;yxatlar</div>
      <div className={GRID}>
        <Tile icon="cart" color="teal" label="Buyurtma va hisoblar" onClick={() => onGo(["orders"])} />
        <Tile icon="truck" color="orange" label="Yuk xatlari" onClick={() => onGo(["shipments", "vat"])} />
        <Tile icon="coins" color="green" label="To'lovlar" onClick={() => onGo(["receipts"])} />
        <Tile icon="wallet" color="red" label="Mijozlar qarzi" onClick={onDebts} />
      </div>
      <p className="sf">
        Zanjir: buyurtma → hisob → yuk xati → schyot-faktura; to&apos;lov — buyurtma, hisob yoki yuk xati asosida. Har hujjatda «Asosida yaratish».
      </p>
    </div>
  );
}
