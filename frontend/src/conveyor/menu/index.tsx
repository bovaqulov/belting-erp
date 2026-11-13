"use client";
// ⋯ menyu: kam ishlatiladigan amallar; tanlansa — oyna yopilib, keyin amal (closeThen). Tugmalar holati — ochilgan paytdagi.
import { showProjects } from "@/conveyor/projects";
import { useLenta, type Lenta } from "@/conveyor/model";
import { initData } from "@/shared/telegram/telegram";

import { MenuView, type MenuAct } from "./ui";

function Menu({ canUndo, canRedo }: { canUndo: boolean; canRedo: boolean }) {
  const L = useLenta();
  const run = (a: MenuAct) => {
    const acts: Record<MenuAct, () => unknown> = {
      undo: L.undo,
      redo: L.redo,
      new: L.doNew,
      save: L.doSave,
      proj: () => showProjects(L),
      lang: () => L.setLang(L.LANG === "ru" ? "uz" : "ru"),
      logout: L.logout,
    };
    L.closeThen(acts[a]);
  };
  return <MenuView t={L.t} canUndo={canUndo} canRedo={canRedo} inTg={!!initData()} onAct={run} />;
}

export function openMenu(L: Lenta): void {
  if (!L.S) return;
  // eski: tugmalar holati menyu ochilgan paytdagi (past/future)
  const canUndo = L.hist.past.length > 0,
    canRedo = L.hist.future.length > 0;
  L.openSheet(() => <Menu canUndo={canUndo} canRedo={canRedo} />);
}
