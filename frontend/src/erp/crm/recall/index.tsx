"use client";
// «Keyinroq» — qayta bog'lanish oynasi: sana (tanlagich + tezkor: ertaga / 3 kun / 1 hafta), soat (standart 10:00), izoh.
// Natija backend'ga: recall (yil-oy-kun), recall_time (SS:DD), recall_note — shu vaqtga mas'ulga vazifa (sales.later).
import { useState } from "react";

import { toast } from "@/erp/kit/env";
import { Modal } from "@/erp/kit/modal";

export type Recall = { recall: string; recall_time: string; recall_note: string };

const pad = (n: number) => String(n).padStart(2, "0");
/** mahalliy sana — yil-oy-kun (bugundan n kun keyin) */
export const dayPlus = (n: number, now = new Date()): string => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const QUICK: [string, number][] = [
  ["Ertaga", 1],
  ["3 kundan keyin", 3],
  ["1 haftadan keyin", 7],
];

export function RecallModal({ onDone }: { onDone: (v: Recall | null) => void }) {
  const [day, setDay] = useState(() => dayPlus(1));
  const [time, setTime] = useState("10:00");
  const [note, setNote] = useState("");
  const today = dayPlus(0);
  return (
    <Modal
      title="Qayta bog'lanish"
      ok="Saqlash"
      onClose={() => onDone(null)}
      onOk={() => {
        if (!day) {
          toast("Sanani tanlang", "bad");
          return false;
        }
        const now = new Date();
        if (day < today || (day === today && time && time <= `${pad(now.getHours())}:${pad(now.getMinutes())}`)) {
          toast("Bu vaqt o'tib ketgan — keyingi soat yoki kunni tanlang", "bad");
          return false;
        }
        onDone({ recall: day, recall_time: time || "10:00", recall_note: note.trim() });
        return false; // onDone oynani o'zi yopadi
      }}
    >
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tezkor tanlov">
        {QUICK.map(([t, n]) => {
          const v = dayPlus(n);
          return (
            <button key={n} type="button" className={`chip ${day === v ? "on" : ""}`} aria-pressed={day === v} onClick={() => setDay(v)}>
              {t}
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2.5">
        <div className="min-w-0">
          <label className="l" htmlFor="rc-d">
            Sana
          </label>
          <input id="rc-d" className="inp w-full" type="date" min={today} value={day} required onChange={(e) => setDay(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="l" htmlFor="rc-t">
            Soat
          </label>
          <input id="rc-t" className="inp w-full" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <label className="l" htmlFor="rc-n">
        Izoh
      </label>
      <textarea
        id="rc-n"
        className="inp w-full"
        rows={3}
        maxLength={500}
        value={note}
        placeholder="Masalan: narxni rahbar bilan kelishib, qo'ng'iroq qiladi"
        onChange={(e) => setNote(e.target.value)}
      />
      <p className="mt-2 mb-0 text-xs text-hint">Shu vaqtga mas&apos;ul sotuvchiga vazifa qo&apos;yiladi; izoh vazifa matnida ko&apos;rinadi.</p>
    </Modal>
  );
}
