"use client";
// Development › Tizim: web/worker jarayonlari, DB, ochiq manzil (tunnel) va loglar. Faqat owner/admin (backend ham
// tekshiradi). Log — oxirgi 300 qator, sirlar backend'da yashirilgan. Yangilash — sarlavhadagi tugma (render()).
import { useEffect, useState } from "react";

import { api } from "@/shared/api/client";
import { useAdmin } from "@/ai/shell/AdminContext";

import type { Status } from "./system.lib";
import { LogSheetView, SystemView } from "./ui";

function LogSheet({ name }: { name: string }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    api<{ lines: string[] }>(`/app/api/system/log?name=${encodeURIComponent(name)}&lines=300`).then(
      (r) => alive && setText(r.lines.join("\n") || "(bo'sh)"),
      (e: Error) => alive && setErr(e.message),
    );
    return () => {
      alive = false;
    };
  }, [name]);
  return <LogSheetView name={name} text={text} err={err} />;
}

export default function SystemSection() {
  const { openSheet } = useAdmin();
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    api<Status>("/app/api/system/status").then(
      (r) => alive && setSt(r),
      (e: Error) => alive && setErr(e.message),
    );
    return () => {
      alive = false;
    };
  }, []);
  return <SystemView st={st} err={err} onLog={(name) => openSheet(<LogSheet name={name} />)} />;
}
