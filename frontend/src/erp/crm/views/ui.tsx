// Smart View paneli (faqat ko'rinish): tizim + saqlangan ko'rinish chiplari, saqlash oynasi.
import { Modal } from "@/erp/kit/modal";
import { Icon } from "@/erp/kit/ui";
import { isTeam, SYSV, type View } from "@/erp/crm/lib";

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
    <span key={v.id} className={`vchip ${vid === String(v.id) ? "on" : ""}`} title={isTeam(v) ? "Jamoa ko'rinishi" : undefined}>
      <button type="button" className="vb" aria-pressed={vid === String(v.id)} onClick={() => onApply(v)}>
        {isTeam(v) ? <Icon n="users" /> : null}
        {v.name}
      </button>
      {mine ? (
        <button type="button" className="vx" aria-label={`«${v.name}» ni o'chirish`} onClick={() => onDelete(v)}>
          ✕
        </button>
      ) : null}
    </span>
  );
  return (
    <div className="vbar" role="group" aria-label="Ko'rinishlar">
      {SYSV.map((v) => chip(v, false))}
      {views.map((v) => chip(v, canDelete(v)))}
      <span className="vchip add">
        <button type="button" className="vb" onClick={onAdd}>
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
      <p className="sum">Hozirgi filtrlar, voronka, ko&apos;rinish (kanban/ro&apos;yxat) va saralash saqlanadi.</p>
    </Modal>
  );
}
