// Smart View paneli (faqat ko'rinish): tizim + saqlangan ko'rinish chiplari, saqlash oynasi.
import { Modal } from "@/erp/kit/modal";
import { Icon } from "@/erp/kit/ui";
import { isTeam, SYSV, type View } from "@/erp/crm/lib";
import { SUM } from "@/erp/crm/tw";

/** Ko'rinish chipi (nomi + o'chirish) */
const VCHIP = "inline-flex flex-none items-center overflow-hidden rounded-2xl border text-[13px] [&_svg.i]:size-[15px]";

export function ViewBarView({
  views,
  vid,
  canDelete,
  onApply,
  onDelete,
  onAdd,
  children,
}: {
  views: View[];
  vid: string | null;
  canDelete: (v: View) => boolean;
  onApply: (v: View) => void;
  onDelete: (v: View) => void;
  onAdd: () => void;
  /** saqlash oynasi (ochiq bo'lsa) */
  children?: React.ReactNode;
}) {
  const chip = (v: View, mine: boolean) => (
    <span key={v.id} className={`${VCHIP} ${vid === String(v.id) ? "border-link bg-link text-white" : "border-sep bg-page text-fg"}`} title={isTeam(v) ? "Jamoa ko'rinishi" : undefined}>
      <button type="button" className="inline-flex min-h-7 cursor-pointer items-center gap-1.5 border-0 bg-transparent px-3 py-1 whitespace-nowrap text-inherit [font:inherit] coarse:min-h-11" aria-pressed={vid === String(v.id)} onClick={() => onApply(v)}>
        {isTeam(v) ? <Icon n="users" /> : null}
        {v.name}
      </button>
      {mine ? (
        <button type="button" className="inline-flex min-h-7 cursor-pointer items-center border-0 bg-transparent py-1 pr-2.5 pl-0.5 whitespace-nowrap text-inherit opacity-60 [font:inherit] hover:opacity-100 coarse:min-h-11" aria-label={`«${v.name}» ni o'chirish`} onClick={() => onDelete(v)}>
          ✕
        </button>
      ) : null}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5 pb-2.5 max-md:-mx-3 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-3 max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden" role="group" aria-label="Ko'rinishlar">
      {SYSV.map((v) => chip(v, false))}
      {views.map((v) => chip(v, canDelete(v)))}
      <span className={`${VCHIP} border-dashed border-sep bg-page text-link`}>
        <button type="button" className="inline-flex min-h-7 cursor-pointer items-center gap-1.5 border-0 bg-transparent px-3 py-1 whitespace-nowrap text-inherit [font:inherit] coarse:min-h-11" onClick={onAdd}>
          <Icon n="plus" /> Joriy filtrni saqlash
        </button>
      </span>
      {children}
    </div>
  );
}

export function SaveViewView({
  name,
  team,
  canTeam,
  onName,
  onTeam,
  onClose,
  onOk,
}: {
  name: string;
  team: boolean;
  canTeam: boolean;
  onName: (v: string) => void;
  onTeam: (v: boolean) => void;
  onClose: () => void;
  onOk: () => Promise<boolean | void>;
}) {
  return (
    <Modal title="Ko'rinishni saqlash" onClose={onClose} onOk={onOk}>
      <label className="l" htmlFor="vw-n">
        Nomi
      </label>
      <input id="vw-n" className="inp" value={name} placeholder="masalan: Toshkent zavodlari, katta bitimlar" onChange={(e) => onName(e.target.value)} />
      {canTeam ? (
        <label className="opt">
          <input type="checkbox" className="ck" checked={team} onChange={(e) => onTeam(e.target.checked)} /> Butun jamoa uchun
        </label>
      ) : null}
      <p className={SUM}>Hozirgi filtrlar, voronka, ko&apos;rinish (kanban/ro&apos;yxat) va saralash saqlanadi.</p>
    </Modal>
  );
}
