// Chap panel (faqat ko'rinish; eski #side): yuborilgan zakazlar (pufaklar), tahlil izohlari, mobil savollar tasmasi,
// parametrlar va mijoz kartalari (slot). Mobil tartibda (display: contents) bo'laklar o'z joyiga tushadi.
import type { ReactNode, Ref } from "react";

import { c, Icon } from "@/conveyor/kit";
import { askTitle } from "@/conveyor/form/params";

type T = (uz: string, ru: string) => string;

/** chat: yuborilgan zakazlar — o'ng tomonda xabar pufaklari (Telegram uslubi) */
export function ChatLogView({ chat }: { chat: string[] }) {
  if (!chat.length) return null;
  return (
    <div className={c("chat")} id="chatLog">
      {chat.map((x, i) => (
        <div key={i} className={c("bubble")}>
          {x}
        </div>
      ))}
    </div>
  );
}

export function ParseMsgsView({ t, notes }: { t: T; notes: string[] }) {
  return (
    <div className={c("parseMsgs")} id="parseMsgs">
      {notes.length ? (
        <details className={c("fold")}>
          <summary>
            <Icon name="info" />
            <span>
              {notes.length} {t("ta izoh", "примеч.")}
            </span>
            <Icon name="chevron-down" />
          </summary>
          <ul>
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** mobil: savollar chizma ustida ixcham tasma — bosilsa parametrlar ochiladi */
export function MobileQuestionsView({ t, questions, mqRef, onOpenParams }: { t: T; questions: string[]; mqRef: Ref<HTMLDivElement>; onOpenParams: () => void }) {
  return (
    <div className={c("mqBox")} id="mq" ref={mqRef}>
      {questions.length ? (
        <button className={c("mq")} id="mqBtn" onClick={onOpenParams}>
          <Icon name="help" />
          <span className={c("m")}>
            <b>
              {askTitle(t)}: {questions.length}
            </b>
            <span>{questions[0]}</span>
          </span>
          <Icon name="chevron-down" />
        </button>
      ) : null}
    </div>
  );
}

export function SideView({ children }: { children: ReactNode }) {
  return (
    <aside className={c("side")} id="side">
      {children}
    </aside>
  );
}
