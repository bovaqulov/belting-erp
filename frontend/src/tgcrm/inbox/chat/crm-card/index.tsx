// Mijoz kartasi (CRM): voronka bosqichi, maydonlar (yo'qotilganda — saqlanadi), teglar, ichki izohlar, vazifalar.
// Karta Telegram foydalanuvchisi bo'yicha — u bir nechta akkauntga yozsa ham bitta.
import { useCallback, useEffect, useState } from "react";

import { confirmDo } from "@/shared/telegram/telegram";
import { addNote, addTask, deleteNote, doneTask, getContact, patchContact, type ContactCard, type StaffRow, type StageId } from "@/tgcrm/api";
import { tomorrowAt10 } from "@/tgcrm/lib";

import { CrmCardView } from "./ui";

export default function CrmCard({
  acc,
  peer,
  staff,
  me,
  onClose,
  onChanged,
}: {
  acc: number;
  peer: number;
  staff: StaffRow[];
  me: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [card, setCard] = useState<ContactCard | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [task, setTask] = useState({ title: "", due: tomorrowAt10(), who: me });
  const [lostAsk, setLostAsk] = useState(false);
  const [lostReason, setLostReason] = useState("");

  useEffect(() => {
    let alive = true;
    getContact(acc, peer).then(
      (c) => alive && setCard(c),
      (e: Error) => alive && setErr(e.message),
    );
    return () => {
      alive = false;
    };
  }, [acc, peer]);

  const run = useCallback(
    async (fn: () => Promise<ContactCard>, after?: () => void) => {
      setSaving(true);
      try {
        setCard(await fn());
        setErr("");
        after?.();
        onChanged();
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [onChanged],
  );

  const patch = (body: Record<string, unknown>, after?: () => void) => void run(() => patchContact(acc, peer, body), after);

  return (
    <CrmCardView
      card={card}
      err={err}
      saving={saving}
      staff={staff}
      note={note}
      task={task}
      lostAsk={lostAsk}
      lostReason={lostReason}
      onClose={onClose}
      onField={(k, v) => card && String(card[k as keyof ContactCard] ?? "") !== v && patch({ [k]: v })}
      onOwner={(tg) => patch({ owner_tg: tg })}
      onStage={(s: StageId) => {
        if (!card || s === card.stage) return;
        if (s === "lost") {
          setLostAsk(true);
          return;
        }
        patch({ stage: s });
      }}
      onLostReason={setLostReason}
      onLostConfirm={() => patch({ stage: "lost", lost_reason: lostReason.trim() }, () => setLostAsk(false))}
      onLostCancel={() => setLostAsk(false)}
      onTags={(names) => patch({ tags: names })}
      onNote={setNote}
      onAddNote={() =>
        note.trim() &&
        void run(
          () => addNote(acc, peer, note.trim()),
          () => setNote(""),
        )
      }
      onDelNote={(id) =>
        void (async () => {
          if (await confirmDo("Izohni o'chirasizmi?")) await run(() => deleteNote(acc, peer, id));
        })()
      }
      onTask={setTask}
      onAddTask={() =>
        task.title.trim() &&
        void run(
          () => addTask(acc, peer, { title: task.title.trim(), due_at: new Date(task.due).toISOString(), assignee_tg: task.who }),
          () => setTask({ title: "", due: tomorrowAt10(), who: me }),
        )
      }
      onDone={(id, undo) => void run(() => doneTask(acc, peer, id, undo))}
    />
  );
}
