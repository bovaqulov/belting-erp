"use client";
// To'liq ekran ko'ruvchi (eski openViewer): pinch / surish / g'ildirak / ikki marta bosish, list almashtirish (surish yoki tugmalar).
// Klaviatura: Esc — yopish, ← → — list, + − 0 — masshtab; Telegram "Orqaga" — yopish. Ko'rinish — ./ui.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { zoomAt as zoomCalc, SHEET_RATIO } from "@/conveyor/lib/logic";
import type { Sheet } from "@/conveyor/lib/types";
import { backOff, backShow } from "@/shared/telegram/telegram";

import { FullscreenView } from "./ui";


export default function Fullscreen({
  sheets,
  start,
  onClose,
  t,
}: {
  sheets: Sheet[];
  start: number;
  onClose: () => void;
  t: (uz: string, ru: string) => string;
}) {
  const [cur, setCur] = useState(start);
  const stageRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  // eski yopiq o'zgaruvchilar: z, tx, ty, baseW, baseH (+ joriy list — hodisa ishlovchilari uchun)
  const v = useRef({ z: 1, tx: 0, ty: 0, baseW: 0, baseH: 0, cur: start });
  const api = useRef<{ fit: () => void; zoomAt: (nz: number, px: number, py: number) => void } | null>(null);

  useLayoutEffect(() => {
    v.current.cur = cur;
    api.current?.fit();
  }, [cur]);

  useEffect(() => {
    const stage = stageRef.current as HTMLDivElement,
      inner = innerRef.current as HTMLDivElement;
    const s = v.current;
    const apply = () => {
      // kattalashtirilgan varaq ekrandan butunlay chiqib ketmasin (surib "yo'qotib qo'yish"): kamida 48 px ko'rinib turadi
      if (s.z > 1) {
        const m = 48;
        s.tx = Math.min(stage.clientWidth - m, Math.max(m - s.baseW * s.z, s.tx));
        s.ty = Math.min(stage.clientHeight - m, Math.max(m - s.baseH * s.z, s.ty));
      }
      inner.style.transform = `translate(${s.tx}px, ${s.ty}px) scale(${s.z})`;
    };
    const fit = () => {
      const W = stage.clientWidth,
        H = stage.clientHeight;
      s.baseW = Math.min(W - 16, (H - 16) * SHEET_RATIO);
      s.baseH = s.baseW / SHEET_RATIO;
      inner.style.width = s.baseW + "px";
      inner.style.height = s.baseH + "px";
      s.z = 1;
      s.tx = (W - s.baseW) / 2;
      s.ty = (H - s.baseH) / 2;
      apply();
    };
    const zoomAt = (nz: number, px: number, py: number) => {
      const r = zoomCalc(s, nz, px, py);
      if (!r) return fit();
      s.z = r.z;
      s.tx = r.tx;
      s.ty = r.ty;
      apply();
    };
    api.current = { fit, zoomAt };
    fit();

    const pts = new Map<number, [number, number]>();
    let last: { d?: number; mx?: number; my?: number; x?: number; y?: number } | null = null,
      lastTap = 0;
    const down = (e: PointerEvent) => {
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      last = null;
      const now = Date.now();
      if (pts.size === 1 && now - lastTap < 300) {
        const b = stage.getBoundingClientRect();
        zoomAt(s.z > 1.5 ? 1 : 3, e.clientX - b.left, e.clientY - b.top);
      }
      lastTap = now;
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const b = stage.getBoundingClientRect();
      const ps = [...pts.values()];
      if (ps.length >= 2) {
        const d = Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1]);
        const mx = (ps[0][0] + ps[1][0]) / 2 - b.left,
          my = (ps[0][1] + ps[1][1]) / 2 - b.top;
        if (last && last.d) {
          s.tx += mx - (last.mx as number);
          s.ty += my - (last.my as number);
          zoomAt((s.z * d) / last.d, mx, my);
        }
        last = { d, mx, my };
      } else {
        const [x, y] = ps[0];
        if (last && !last.d) {
          s.tx += x - (last.x as number);
          s.ty += y - (last.y as number);
          apply();
        }
        last = { x, y };
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      last = null;
      if (!pts.size && s.z === 1) {
        const dx = s.tx - (stage.clientWidth - s.baseW) / 2;
        if (Math.abs(dx) > 60) {
          let n = s.cur;
          if (dx < 0 && n < sheets.length - 1) n++;
          else if (dx > 0 && n > 0) n--;
          if (n !== s.cur) setCur(n);
          else fit(); // eski show() — o'sha list, qayta sig'diriladi
        } else fit();
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const b = stage.getBoundingClientRect();
      zoomAt(s.z * Math.exp(-e.deltaY * 0.0022), e.clientX - b.left, e.clientY - b.top);
    };
    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
    stage.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("resize", fit);
    const close = () => onClose();
    // klaviatura: Esc — yopish, ← → — list, + − 0 — masshtab
    const key = (e: KeyboardEvent) => {
      const mid: [number, number] = [stage.clientWidth / 2, stage.clientHeight / 2];
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") setCur((n) => Math.max(0, n - 1));
      else if (e.key === "ArrowRight") setCur((n) => Math.min(sheets.length - 1, n + 1));
      else if (e.key === "+" || e.key === "=") zoomAt(s.z * 1.6, ...mid);
      else if (e.key === "-") zoomAt(s.z / 1.6, ...mid);
      else if (e.key === "0") fit();
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", key);
    backShow(close);
    return () => {
      stage.removeEventListener("pointerdown", down);
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerup", up);
      stage.removeEventListener("pointercancel", up);
      stage.removeEventListener("wheel", wheel);
      window.removeEventListener("resize", fit);
      document.removeEventListener("keydown", key);
      backOff(close);
      api.current = null;
    };
    // bir marta (eski openViewer chaqiruvi); varaqlar ro'yxati ochilgan paytdagi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const center = (): [number, number] => {
    const st = stageRef.current as HTMLDivElement;
    return [st.clientWidth / 2, st.clientHeight / 2];
  };
  return (
    <FullscreenView
      t={t}
      sheets={sheets}
      cur={cur}
      stageRef={stageRef}
      innerRef={innerRef}
      onClose={onClose}
      onPage={setCur}
      onZoomOut={() => api.current?.zoomAt(v.current.z / 1.6, ...center())}
      onFit={() => api.current?.fit()}
      onZoomIn={() => api.current?.zoomAt(v.current.z * 1.6, ...center())}
    />
  );
}
