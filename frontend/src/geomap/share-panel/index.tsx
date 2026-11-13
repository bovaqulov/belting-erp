"use client";
// Ulashish: saqlangan ko'rinishlar (/views — filtr, uslub, qatlamlar, xarita joyi) va jonli havolalar (/shares — parol,
// muddat; savdo/qarz/INN ko'rsatilmaydi). Clipboard yopiq bo'lsa (Telegram WebView) — havola maydonda ko'rsatiladi.
import { useEffect, useState } from "react";

import { api } from "@/geomap/lib/api";
import { confirmDo } from "@/geomap/lib/tg";
import type { ViewState } from "@/geomap/lib/types";

import { SharePanelView, type Share, type ShareForm, type View } from "./ui";

export default function SharePanel({ ids, getState, colorBy, onLoadView, onToast, me }: {
  ids: string[]; getState: () => ViewState; colorBy: string; onLoadView: (s: ViewState) => void; onToast: (s: string, err?: boolean) => void; me: number;
}) {
  const [shares, setShares] = useState<Share[] | null>(null); // null — hali yuklanmagan
  const [views, setViews] = useState<View[] | null>(null);
  const [form, setForm] = useState<ShareForm>({ name: "", password: "", days: 30 });
  const [vname, setVname] = useState("");
  const [vshared, setVshared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vbusy, setVbusy] = useState(false);
  const [made, setMade] = useState<string | null>(null); // hozirgina yaratilgan havola (ko'rinib turadi, nusxalash mumkin)

  const fail = (e: unknown) => onToast(e instanceof Error ? e.message : String(e), true);
  const load = () => {
    api<Share[]>("/shares").then(setShares).catch(() => setShares((s) => s ?? []));
    api<View[]>("/views").then(setViews).catch(() => setViews((v) => v ?? []));
  };
  useEffect(load, []);

  const link = (t: string) => `${location.origin}/app/geo/share?t=${encodeURIComponent(t)}`;
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(link(t));
      onToast("Havola nusxalandi");
    } catch {
      setMade(link(t)); // clipboard yopiq (Telegram WebView) — havola maydonda ko'rsatiladi, qo'lda nusxalanadi
      onToast("Avtomatik nusxalab bo'lmadi — havolani pastdagi maydondan nusxalang", true);
    }
  };
  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api<{ token: string }>("/shares", { body: { ids, name: form.name.trim() || "Mijozlar xaritasi", password: form.password || undefined, days: form.days, style: { colorBy } } });
      setForm({ name: "", password: "", days: 30 });
      setMade(link(r.token));
      load();
      await copy(r.token);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const saveView = async () => {
    if (vbusy) return;
    if (!vname.trim()) return onToast("Ko'rinish nomini yozing", true);
    setVbusy(true);
    try {
      await api("/views", { body: { name: vname.trim(), shared: vshared, state: getState() } });
      setVname("");
      load();
      onToast("Ko'rinish saqlandi");
    } catch (e) {
      fail(e);
    } finally {
      setVbusy(false);
    }
  };
  const removeView = async (v: View) => {
    if (!(await confirmDo(`"${v.name}" ko'rinishi o'chirilsinmi?${v.shared ? " U jamoaga ham ko'rinmay qoladi." : ""}`))) return;
    try {
      await api(`/views/${v.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      fail(e);
    }
  };
  const removeShare = async (s: Share) => {
    if (!(await confirmDo(`"${s.name}" havolasi o'chirilsinmi? Uni olganlar xaritani ocha olmay qoladi.`))) return;
    try {
      await api(`/shares/${encodeURIComponent(s.token)}`, { method: "DELETE" });
      load();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <SharePanelView
      ids={ids}
      me={me}
      shares={shares}
      views={views}
      form={form}
      vname={vname}
      vshared={vshared}
      busy={busy}
      vbusy={vbusy}
      made={made}
      onLoadView={onLoadView}
      onSaveView={() => void saveView()}
      onVname={setVname}
      onVshared={setVshared}
      onRemoveView={(v) => void removeView(v)}
      onForm={setForm}
      onCreate={() => void create()}
      onCopy={(t) => void copy(t)}
      onRemoveShare={(sh) => void removeShare(sh)}
    />
  );
}
