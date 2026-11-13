"use client";
// Markaz (eski #center, bindViewer): list joylashuvi (har chizishda), faol tab ko'rinadigan joyga; mobil — surish bilan list
// almashtirish, bosish — to'liq ekran; kompyuter — bosish masshtab; Ctrl+g'ildirak — masshtab; o'lcham kuzatuvchi. Ko'rinish — ./ui.
import { useEffect, useLayoutEffect, useRef } from "react";

import { observeResize } from "@/conveyor/kit";
import { isDesk, useLenta, type Lenta } from "@/conveyor/model";

import { CenterView, EmptyView, IssuesView } from "./ui";

function Empty({ L }: { L: Lenta }) {
  return (
    <EmptyView
      t={L.t}
      parsing={L.parsing}
      onExample={(text) => L.pickExample(text)}
    />
  );
}

export default function Center() {
  const L = useLenta();
  const t = L.t;
  const sh = L.LAST.sheets || [];
  const i = L.curIndex();
  const tabsRef = useRef<HTMLDivElement>(null);

  // eski drawSheet() → layoutSheet(); drawTabs() → faol tab ko'rinadigan joyga
  useLayoutEffect(() => {
    L.layoutSheet();
  });
  useEffect(() => {
    tabsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [L.CUR, L.LAST]);

  // eski bindViewer()
  useEffect(() => {
    const box = L.els.vscroll as HTMLDivElement;
    // mobil: barmoq bilan surish — keyingi/oldingi list; bosish — to'liq ekran
    let sx = 0,
      sy = 0;
    const ts = (e: TouchEvent) => {
      const q = e.touches[0];
      sx = q.clientX;
      sy = q.clientY;
    };
    const te = (e: TouchEvent) => {
      if (L.ZOOM > 1) return;
      const q = e.changedTouches[0],
        dx = q.clientX - sx,
        dy = q.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) L.step(dx < 0 ? 1 : -1);
    };
    const click = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.("#vpaper")) return;
      if (isDesk()) L.toggleDeskZoom();
      else L.openViewer(L.curIndex());
    };
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !L.els.vpaper) return;
      e.preventDefault();
      L.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    const resize = () => {
      L.layoutSheet();
      L.fitOrder();
    };
    box.addEventListener("touchstart", ts, { passive: true });
    box.addEventListener("touchend", te, { passive: true });
    box.addEventListener("click", click);
    box.addEventListener("wheel", wheel, { passive: false });
    // ResizeObserver: (1) mobil tartibda quti balandligi varaqning o'zidan kelib chiqadi — faqat kenglik kuzatiladi, aks holda
    // varaq o'lchami → quti balandligi → yana kuzatuvchi (teskari bog'lanish); (2) o'lcham kuzatuvchi ichida emas, keyingi kadrda
    // qo'yiladi — brauzerning "ResizeObserver loop completed with undelivered notifications" xatosi chiqmaydi.
    let lastH = -1,
      lastW = -1,
      raf = 0;
    const boxResize = () => {
      if (L.ZOOM !== 1) return;
      const w = box.clientWidth,
        h = isDesk() ? box.clientHeight : 0;
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(L.layoutSheet);
    };
    const unobserve = observeResize(box, boxResize, resize);
    return () => {
      cancelAnimationFrame(raf);
      box.removeEventListener("touchstart", ts);
      box.removeEventListener("touchend", te);
      box.removeEventListener("click", click);
      box.removeEventListener("wheel", wheel);
      unobserve();
    };
  }, [L]);

  const tools = !L.tabsDrawn ? false : !sh.length;
  /** [id, ikonka, yorliq, bosilganda, qo'shimcha klass] */
  const zoomTools: [string, string, string, () => void, string?][] = [
    ["zOut", "zoom-out", t("Kichiklashtirish", "Уменьшить"), () => L.zoomBy(1 / 1.4), "zoom"],
    ["zFit", "scan", t("Sig'dirish", "Вписать"), L.zoomFit, "zoom"],
    ["zIn", "zoom-in", t("Kattalashtirish", "Увеличить"), () => L.zoomBy(1.4), "zoom"],
    [
      "zFull",
      "maximize-2",
      t("To'liq ekran", "Во весь экран"),
      () => {
        const n = L.curIndex();
        if (n >= 0) L.openViewer(n);
      },
    ],
  ];
  return (
    <CenterView
      t={t}
      lang={L.LANG}
      sh={sh}
      i={i}
      cur={L.CUR}
      view={L.view}
      message={L.LAST.message}
      tabsDrawn={L.tabsDrawn}
      tools={tools}
      zoomTools={zoomTools}
      busy={L.busy}
      parsing={L.parsing}
      empty={<Empty L={L} />}
      issues={L.issuesDrawn ? <IssuesView t={t} list={L.LAST.issues || []} lang={L.LANG} renderFail={L.renderFail} onRetry={L.retryRender} /> : null}
      centerRef={L.refFor("center")}
      viewerRef={L.refFor("viewer")}
      vscrollRef={L.refFor("vscroll")}
      vpaperRef={L.refFor("vpaper")}
      tabsRef={tabsRef}
      onTab={(k) => L.selectTab(k)}
    />
  );
}
