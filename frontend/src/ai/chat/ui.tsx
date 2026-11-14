// Chat (faqat ko'rinish): agent tanlash (bo'limlar daraxti), bo'sh holat va tavsiyalar, xabarlar oqimi (vositalar,
// "yozmoqda", xato), yozish maydoni (yuborish / to'xtatish).
import type { KeyboardEvent, RefObject } from "react";

import s from "@/shared/ui/panel/styles";
import { Icon, Sq } from "@/shared/ui/panel/ui";
import { toolName } from "@/ai/agents/agents.lib";
import { buildDeptTree, flatten } from "@/ai/org/dept-tree";
import type { Agent } from "@/ai/agents/model";

import { SUGGESTIONS, type ChatMsg } from "./chat.lib";
import c from "./styles";

export function ChatView({
  agents,
  cur,
  d,
  msgs,
  text,
  busy,
  taRef,
  onAgent,
  onReset,
  onSend,
  onText,
  onKey,
  onStop,
}: {
  agents: Agent[];
  cur: string | null;
  /** tanlangan agent */
  d: Agent | undefined;
  msgs: ChatMsg[];
  text: string;
  busy: boolean;
  taRef: RefObject<HTMLTextAreaElement | null>;
  onAgent: (key: string) => void;
  onReset: () => void;
  onSend: (q: string) => void;
  onText: (v: string) => void;
  onKey: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onStop: () => void;
}) {
  if (!agents.length) return <div className={s.empty}>Yuklanmoqda…</div>;

  return (
    <div className={c.wrap}>
      <div className={c.agent}>
        {d && <Sq icon={d.icon} color={d.color} />}
        <select value={cur ?? ""} onChange={(e) => onAgent(e.target.value)} aria-label="Agent" disabled={busy}>
          {flatten(buildDeptTree(agents)).map(({ d: x, depth }) => (
            <option key={x.key} value={x.key}>
              {" ".repeat(depth)}
              {x.name}
            </option>
          ))}
        </select>
        <span className={c.chev}>
          <Icon name="chevron-right" />
        </span>
        {msgs.length > 0 && (
          <button className={`${s["icon-btn"]} ${c.new}`} title="Yangi suhbat" aria-label="Yangi suhbat" onClick={onReset}>
            <Icon name="plus" />
          </button>
        )}
      </div>

      {msgs.length === 0 ? (
        <div className={c.empty}>
          {d && <Sq icon={d.icon} color={d.color} style={{ width: 56, height: 56, borderRadius: 16 }} />}
          <h2>{d ? d.name : "Agent"}</h2>
          <p>Savol bering — agent o&apos;z vositalari ({d ? d.tools.slice(0, 4).map(toolName).join(", ") : "…"}) bilan javob beradi.</p>
          <div className={c.sugg}>
            {SUGGESTIONS.map((q) => (
              <button key={q} onClick={() => onSend(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className={c.feed} aria-live="polite">
          {msgs.map((m) => {
            const md = agents.find((x) => x.key === m.agent);
            return (
              <div key={m.id} className={`${c.row} ${m.role === "user" ? c.me : ""}`}>
                {m.role === "agent" && md && <Sq icon={md.icon} color={md.color} style={{ width: 28, height: 28, borderRadius: 8 }} />}
                <div className={c.bubble}>
                  {m.tools.length > 0 && (
                    <div className={c.tools}>
                      {m.tools.map((t) => (
                        <span key={t} className={c.tool}>
                          <Icon name="settings" />
                          {toolName(t)}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.text}
                  {m.pending && !m.text && (
                    <span className={c.typing} aria-label="Yozmoqda">
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                  {m.error && <div className={c.err}>{m.error}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={c.composer}>
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={onKey}
          placeholder={d ? `${d.name} agentiga yozing…` : "Xabar…"}
          aria-label="Xabar"
        />
        {busy ? (
          <button className={`${c.send} ${c.stop}`} title="To'xtatish" aria-label="To'xtatish" onClick={onStop}>
            <Icon name="x" />
          </button>
        ) : (
          <button className={c.send} title="Yuborish" aria-label="Yuborish" disabled={!text.trim()} onClick={() => onSend(text)}>
            <Icon name="send" />
          </button>
        )}
      </div>
    </div>
  );
}
