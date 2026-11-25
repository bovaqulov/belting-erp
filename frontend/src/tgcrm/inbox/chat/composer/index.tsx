// Yozish maydoni: matn (qoralama, Enter), biriktirma (tugma / sudrab tashlash / bufer — ota komponentdan `attach`),
// ovozli xabar (MediaRecorder → server OGG/Opus'ga o'giradi). Biriktirma bo'lsa — matn uning izohi.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { FileKind, Msg } from "@/tgcrm/api";
import { defaultKind } from "@/tgcrm/lib";

import QuickReplies from "./quick";
import { ComposerView } from "./ui";

const MAX = 4096;
const CAPTION = 1024;

function readDraft(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/** Brauzer qo'llaydigan ovoz formati (Chrome — webm/opus, Safari — mp4/aac, Firefox — ogg/opus) */
function recFormat(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const [mime, ext] of [
    ["audio/webm;codecs=opus", "webm"],
    ["audio/ogg;codecs=opus", "ogg"],
    ["audio/mp4", "m4a"],
    ["audio/webm", "webm"],
  ] as const)
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  return null;
}

type Rec = { started: number; recorder: MediaRecorder; chunks: Blob[]; stream: MediaStream; ext: string };

export default function Composer(p: {
  acc: number;
  isAdmin: boolean;
  draftKey: string;
  reply: Msg | null;
  replyName: string;
  editing: Msg | null;
  /** tashqaridan matn qo'yish (AI javob taklifi) — seq har safar yangi */
  insert?: { text: string; seq: number } | null;
  onEdit: (text: string) => void;
  onCancelEdit: () => void;
  attach: File | null;
  onAttach: (f: File) => void;
  onClearAttach: () => void;
  onCancelReply: () => void;
  onSend: (text: string) => void;
  onSendFile: (f: File, kind: FileKind, caption: string) => void;
  onTyping: () => void;
  onError: (msg: string) => void;
}) {
  const [text, setText] = useState(() => readDraft(p.draftKey));
  const [kind, setKind] = useState<FileKind>("file");
  const [rec, setRec] = useState<Rec | null>(null);
  const [quickBtn, setQuickBtn] = useState(false);
  const [now, setNow] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const { attach } = p;

  // tahrirlash boshlansa — matn maydonga (qoralama keyin qaytadi); tugasa — qoralama
  const [editSeen, setEditSeen] = useState<Msg | null>(null);
  if (p.editing !== editSeen) {
    setEditSeen(p.editing);
    setText(p.editing ? p.editing.text : readDraft(p.draftKey));
  }

  const [insSeen, setInsSeen] = useState(0);
  if (p.insert && p.insert.seq !== insSeen) {
    setInsSeen(p.insert.seq);
    setText(p.insert.text);
  }

  // biriktirma almashsa — standart turi
  const [seen, setSeen] = useState<File | null>(null);
  if (attach !== seen) {
    setSeen(attach);
    if (attach) setKind(defaultKind(attach));
  }

  // rasm/video ko'rinishi (object URL — tozalanadi)
  const preview = useMemo(() => (attach && /^(image|video)\//.test(attach.type) ? URL.createObjectURL(attach) : null), [attach]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  useEffect(() => {
    if (p.editing) return; // tahrir matni qoralama emas
    const t = window.setTimeout(() => {
      try {
        if (text.trim()) localStorage.setItem(p.draftKey, text);
        else localStorage.removeItem(p.draftKey);
      } catch {
        /* xususiy rejim */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [text, p.draftKey, p.editing]);

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text]);

  useEffect(() => {
    if (p.reply || attach || p.editing) area.current?.focus();
  }, [p.reply, attach, p.editing]);

  // yozish taymeri
  useEffect(() => {
    if (!rec) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [rec]);
  // sahifadan chiqilsa — mikrofon o'chadi
  const recRef = useRef<Rec | null>(null);
  useEffect(() => {
    recRef.current = rec;
  });
  useEffect(() => () => recRef.current?.stream.getTracks().forEach((t) => t.stop()), []);

  const limit = attach ? CAPTION : MAX;
  const slash = !p.editing && !attach && /^\/\S*$/.test(text);
  const quickOpen = quickBtn || slash;

  const send = () => {
    const t = text.trim();
    if (p.editing) {
      if (!t || t.length > MAX) return;
      if (t !== p.editing.text) p.onEdit(t);
      else p.onCancelEdit();
      return;
    }
    if (attach) {
      if (t.length > CAPTION) return;
      p.onSendFile(attach, kind, t);
      p.onClearAttach();
      setText("");
      return;
    }
    if (!t || t.length > MAX) return;
    p.onSend(t);
    setText("");
    area.current?.focus();
  };

  const startRec = async () => {
    const fmt = recFormat();
    if (!fmt || !navigator.mediaDevices?.getUserMedia) return p.onError("Bu brauzerda ovoz yozib bo'lmaydi.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: fmt.mime });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.start(250);
      setNow(Date.now());
      setRec({ started: Date.now(), recorder, chunks, stream, ext: fmt.ext });
    } catch {
      p.onError("Mikrofonga ruxsat berilmadi — brauzer sozlamalarida ruxsat bering.");
    }
  };

  const stopRec = (deliver: boolean) => {
    const r = rec;
    if (!r) return;
    setRec(null);
    r.recorder.addEventListener(
      "stop",
      () => {
        r.stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(r.chunks, { type: r.recorder.mimeType });
        if (deliver && blob.size > 0 && Date.now() - r.started > 700) p.onSendFile(new File([blob], `ovoz.${r.ext}`, { type: blob.type }), "voice", "");
      },
      { once: true },
    );
    r.recorder.stop();
  };

  return (
    <ComposerView
      quick={
        quickOpen ? (
          <QuickReplies
            acc={p.acc}
            isAdmin={p.isAdmin}
            filter={slash ? text.slice(1) : ""}
            onClose={() => {
              setQuickBtn(false);
              if (slash) setText("");
            }}
            onPick={(t) => {
              setQuickBtn(false);
              setText(t);
              area.current?.focus();
            }}
          />
        ) : null
      }
      onQuick={() => setQuickBtn((v) => !v)}
      area={area}
      picker={picker}
      text={text}
      max={limit}
      reply={p.reply}
      replyName={p.replyName}
      editing={p.editing}
      onCancelEdit={p.onCancelEdit}
      attach={attach}
      preview={preview}
      kind={kind}
      recording={rec ? Math.max(0, now - rec.started) : null}
      canRecord={typeof window !== "undefined" && !!recFormat()}
      onKind={setKind}
      onPick={() => picker.current?.click()}
      onPicked={(f) => f && p.onAttach(f)}
      onClearAttach={p.onClearAttach}
      onCancelReply={p.onCancelReply}
      onChange={(v) => {
        setText(v);
        if (v.trim()) p.onTyping();
      }}
      onPaste={(e) => {
        const f = e.clipboardData?.files?.[0];
        if (f) {
          e.preventDefault();
          p.onAttach(f);
        }
      }}
      onKeyDown={(e) => {
        const coarse = window.matchMedia("(pointer: coarse)").matches;
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !coarse) {
          e.preventDefault();
          send();
        }
        if (e.key === "Escape") {
          if (p.editing) p.onCancelEdit();
          else if (attach) p.onClearAttach();
          else if (p.reply) p.onCancelReply();
        }
      }}
      onSend={send}
      onRecStart={() => void startRec()}
      onRecStop={() => stopRec(true)}
      onRecCancel={() => stopRec(false)}
    />
  );
}
