"use client";
// Ombor xaritasi: ombor → bino → xona (API'da «blok») → stellaj (qatorlar × qavatlar) → joy. Har darajaning kodi
// (codes.lib): AO · AO1 · AO1-A · AO1-A-02 · AO1-A-02-03-C (qavat harf, A — pastki). Tuzilma — /wh/structure, joylar — /cells.
// Bino bosilsa — xonalari, xona bosilsa — stellajlari, stellaj bosilsa — old tomondan chizmasi ostida ochiladi; istalgan
// darajaning kodi qidirilsa (yoki skanerlansa) — o'sha daraja ochiladi. Amallar (⋯): tahrirlash, yorliqlar, o'chirish;
// joy — tafsilot ostida (holat: faol / bloklangan / karantin).
import { useMemo, useState } from "react";

import { confirm, toast } from "@/erp/kit/env";
import { Seg, useLoad } from "@/erp/kit/ui";
import { api, del, labelsPdf, post } from "@/erp/warehouse/api";
import { Btns } from "@/erp/warehouse/common";
import { useWh } from "@/erp/warehouse/context";
import {
  racks,
  tally,
  type Cell,
  type CellStatus,
  type RackRow,
  type Warehouse,
  type WhBlock,
  type WhBuilding,
  type WhRack,
  type WhStructure,
} from "@/erp/warehouse/lib";
import { CellCard } from "@/erp/warehouse/lookup";

import { CellsView, PURPOSES, CELL_KINDS, type BlkData, type Box, type Grid, type Modals, type RackData, type WizData } from "./ui";

/** Tanlangan yo'l; "none" — biriktirilmaganlar (binoga — xonalar, xonaga — joylar, stellajga — joylar) */
type Sel = number | "none" | null;
type Path = { bld: Sel; blk: Sel; rk: Sel };
const TOP: Path = { bld: null, blk: null, rk: null };
const n = (x: number, w: string) => `${x} ${w}`;
const E = "/app/api/erp";
const rackTitle = (r: WhRack) => r.name || `${r.number}-stellaj`;
/** to'lganlik: birligi bor joylar / jami joylar */
const fillOf = (cs: Cell[]) => ({ used: cs.filter((c) => c.units > 0).length, total: cs.length });
const STATUS: [CellStatus, string][] = [
  ["active", "Faol"],
  ["blocked", "Bloklangan"],
  ["quarantine", "Karantin"],
];

export function Cells() {
  const { wide, stores, me, reloadMe, choose, store: cur } = useWh();
  // ombor — kirishda tanlangani (bitta bo'lsa — o'sha)
  const wh = cur?.id ?? stores[0]?.id;
  const [path, setPath] = useState<Path>(TOP);
  const [sel, setSel] = useState<Cell | null>(null);
  const [modal, setModal] = useState<Modals>(null);
  /** oynalar tahrir rejimida — shu obyekt; null — yangi */
  const [edit, setEdit] = useState<{ bld?: WhBuilding; blk?: WhBlock; rack?: WhRack }>({});
  const st = useLoad(async () => {
    const [cells, s] = await Promise.all([api<Cell[]>(`${E}/cells`), wh ? api<WhStructure>(`${E}/wh/structure?store_id=${wh}`) : Promise.resolve(null)]);
    return { cells, s };
  }, [wh]);
  /** katalog tovar guruhlari — xonaga joylashtirish qoidasi uchun */
  const grps = useLoad(() => api<string[]>(`${E}/wh/groups`).catch(() => [] as string[]), []);

  const v = useMemo(() => {
    const cells = (st.data?.cells ?? []).filter((c) => c.parent_id === wh);
    const s = st.data?.s;
    const buildings = s?.buildings ?? [];
    const blocks = s?.blocks ?? [];
    const rks = s?.racks ?? [];
    const inBlock = (b: WhBlock | "none") => cells.filter((c) => (b === "none" ? !c.block_id || !blocks.some((x) => x.id === c.block_id) : c.block_id === b.id));
    const blocksOf = (bld: WhBuilding | "none") =>
      blocks.filter((b) => (bld === "none" ? !b.building_id || !buildings.some((x) => x.id === b.building_id) : b.building_id === bld.id));
    const racksOf = (b: WhBlock) => rks.filter((r) => r.block_id === b.id);
    const inRack = (r: WhRack) => cells.filter((c) => c.rack_id === r.id);
    /** xonadagi stellajsiz joylar (eski kodlar yoki qo'lda yaratilgan) */
    const loose = (b: WhBlock) => inBlock(b).filter((c) => !c.rack_id || !rks.some((r) => r.id === c.rack_id));
    return { cells, buildings, blocks, rks, code: s?.store.code ?? "", inBlock, blocksOf, racksOf, inRack, loose };
  }, [st.data, wh]);

  const go = (p: Path) => {
    setPath(p);
    setSel(null);
  };
  const store = stores.find((x) => x.id === wh);
  const bld = typeof path.bld === "number" ? (v.buildings.find((b) => b.id === path.bld) ?? null) : null;
  const blk = typeof path.blk === "number" ? (v.blocks.find((b) => b.id === path.blk) ?? null) : null;
  const rack = typeof path.rk === "number" ? (v.rks.find((r) => r.id === path.rk) ?? null) : null;
  const nextBld = Array.from({ length: 99 }, (_, i) => i + 1).find((i) => !v.buildings.some((b) => b.number === i)) ?? 1;

  const fail = (e: unknown) => toast((e as Error).message, "bad");
  /** amal → ma'lumotni yangilash; xato — xabar */
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await st.reload();
    } catch (e) {
      fail(e);
    }
  };
  const open = (m: Modals, e: typeof edit = {}) => {
    setEdit(e);
    setModal(m);
  };
  const close = () => {
    setModal(null);
    setEdit({});
  };
  /** oyna amali: muvaffaqiyat — yopiladi va yangilanadi; xato — oyna ochiq qoladi */
  const submit = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      close();
      await st.reload();
    } catch (e) {
      fail(e);
    }
  };
  const pdf = (cs: Cell[]) => (cs.length ? void labelsPdf({ cell_ids: cs.map((c) => c.id) }) : toast("Bu yerda joy yo'q", "bad"));
  const recodedToast = (k: number) => (k ? toast(`Saqlandi — ${n(k, "joy")} kodi yangilandi: yorliqlarni qayta chop eting`) : toast("Saqlandi"));
  type Act = "edit" | "pdf" | "del" | "wiz" | "rack-pdf";
  const DEL = { value: "del" as Act, icon: "trash", danger: true };
  const EDIT = { icon: "pencil", color: "gray" };
  const PDF = { value: "pdf" as Act, icon: "printer", color: "orange" };

  const storeMenu = async () => {
    if (!store) return;
    const a = await choose<Act>(`${store.name}${v.code ? ` · ${v.code}` : ""}`, [
      { value: "wiz", label: "Tuzilma ustasi", sub: "Bino → xona → stellajlar bir oynada", icon: "layers", color: "blue" },
      { value: "edit", label: "Omborni tahrirlash", sub: "Nomi, kodi va turi", ...EDIT },
      { ...PDF, label: `Tokcha yorliqlari (${v.cells.length})`, sub: "Butun ombor joylari" },
      ...(me.roles.some((r) => r === "owner" || r === "admin") ? [{ ...DEL, label: "Omborni o'chirish", sub: "Qoldig'i bo'lmasa" }] : []),
    ]);
    if (a === "wiz") open("wiz");
    else if (a === "edit") open("store");
    else if (a === "pdf") pdf(v.cells);
    else if (a === "del") {
      if (!(await confirm(`«${store.name}» omborini o'chirasizmi? Binolar, xonalar, stellajlar va joylar ham o'chadi.`))) return;
      try {
        const r = await del<{ archived: boolean }>(`${E}/wh/stores/${store.id}`);
        go(TOP);
        toast(r.archived ? `«${store.name}» arxivga olindi (hujjatlar tarixi saqlandi)` : `«${store.name}» o'chirildi`);
        await reloadMe();
      } catch (e) {
        fail(e);
      }
    }
  };

  const buildingMenu = async (b: WhBuilding) => {
    const bs = v.blocksOf(b);
    const cs = bs.flatMap((x) => v.inBlock(x));
    const a = await choose<Act>(`${b.code ?? ""} · ${b.name}`, [
      { value: "edit", label: "Tahrirlash", sub: "Raqami va nomi", ...EDIT },
      { ...PDF, label: `Tokcha yorliqlari (${cs.length})`, sub: "Binodagi barcha joylar" },
      { ...DEL, label: "Binoni o'chirish", sub: "Xonalari, stellajlari va joylari bilan" },
    ]);
    if (a === "edit") open("bld", { bld: b });
    else if (a === "pdf") pdf(cs);
    else if (a === "del") {
      if (!(await confirm(`«${b.name}» binosini o'chirasizmi? ${n(bs.length, "xona")} va ${n(cs.length, "joy")} ham o'chadi.`))) return;
      await run(async () => {
        await del(`${E}/wh/buildings/${b.id}`);
        if (path.bld === b.id) go(TOP);
        toast(`«${b.name}» o'chirildi`);
      });
    }
  };

  const blockMenu = async (b: WhBlock) => {
    const cs = v.inBlock(b);
    const rs = v.racksOf(b);
    const a = await choose<Act>(`${b.full ?? b.code} xona${b.name ? ` — ${b.name}` : ""}`, [
      { value: "edit", label: "Tahrirlash", sub: "Harfi va nomi", ...EDIT },
      { ...PDF, label: `Tokcha yorliqlari (${cs.length})`, sub: "Xonadagi barcha joylar" },
      ...(rs.length ? [{ value: "rack-pdf" as Act, label: `Stellaj boshi yorliqlari (${rs.length})`, sub: "Har stellajga katta kod va QR", icon: "printer", color: "orange" }] : []),
      { ...DEL, label: "Xonani o'chirish", sub: "Stellajlari va joylari bilan" },
    ]);
    if (a === "edit") open("blk", { blk: b });
    else if (a === "pdf") pdf(cs);
    else if (a === "rack-pdf") void labelsPdf({ rack_ids: rs.map((r) => r.id) });
    else if (a === "del") {
      if (!(await confirm(`${b.code} xonani o'chirasizmi? ${n(rs.length, "stellaj")} va ${n(cs.length, "joy")} ham o'chadi.`))) return;
      await run(async () => {
        await del(`${E}/wh/blocks/${b.id}`);
        if (path.blk === b.id) go({ bld: path.bld, blk: null, rk: null });
        toast(`${b.code} xona o'chirildi`);
      });
    }
  };

  const rackMenu = async (r: WhRack) => {
    const cs = v.inRack(r);
    const a = await choose<Act>(`${r.code} · ${rackTitle(r)}`, [
      { value: "edit", label: "Xarakteristika", sub: `${r.rows} qator × ${r.floors} qavat · nomi`, icon: "layers", color: "blue" },
      { value: "rack-pdf", label: "Stellaj boshi yorlig'i", sub: `Katta kod ${r.code} va QR`, icon: "printer", color: "orange" },
      { ...PDF, label: `Tokcha yorliqlari (${cs.length})`, sub: "Qisqa kod (03-C) va to'liq QR" },
      { ...DEL, label: "Stellajni o'chirish", sub: `${n(cs.length, "joy")} bilan` },
    ]);
    if (a === "edit") open("rack", { rack: r });
    else if (a === "rack-pdf") void labelsPdf({ rack_ids: [r.id] });
    else if (a === "pdf") pdf(cs);
    else if (a === "del") {
      if (!(await confirm(`${r.code} stellajni o'chirasizmi? ${n(cs.length, "joy")} ham o'chadi.`))) return;
      await run(async () => {
        await del(`${E}/wh/racks/${r.id}`);
        if (path.rk === r.id) go({ ...path, rk: null });
        toast(`${r.code} stellaj o'chirildi`);
      });
    }
  };

  /** biriktirilmagan joylar ustuni: yorliqlar, o'chirish (bo'sh bo'lsa) */
  const rowMenu = async (r: RackRow<Cell>) => {
    const cs = r.floors.map((f) => f.cell);
    const a = await choose<Act>(r.row, [
      { ...PDF, label: `Yorliqlar PDF (${cs.length})` },
      { ...DEL, label: "Joylarni o'chirish", sub: `${n(cs.length, "joy")}${r.units ? ` · ${n(r.units, "birlik")} — avval ko'chiring` : ""}` },
    ]);
    if (a === "pdf") pdf(cs);
    else if (a === "del") {
      if (r.units) return toast(`${r.row} da ${n(r.units, "birlik")} bor — avval boshqa joyga ko'chiring`, "bad");
      if (!(await confirm(`${r.row}: ${n(cs.length, "joy")} o'chirilsinmi?`))) return;
      await run(async () => {
        for (const c of cs) await del(`${E}/cells/${c.id}`);
        if (sel && cs.some((c) => c.id === sel.id)) setSel(null);
        toast(`${r.row} o'chirildi`);
      });
    }
  };

  const setStatus = (c: Cell, status: CellStatus) =>
    run(async () => {
      const r = await post<Cell>(`${E}/cells/${c.id}`, { status });
      setSel({ ...c, status: r.status });
      toast(status === "blocked" ? `${c.code} bloklandi — unga joylashtirib bo'lmaydi` : status === "quarantine" ? `${c.code} — karantin` : `${c.code} — faol`);
    });
  const dropCell = async (c: Cell) => {
    if (!(await confirm(`${c.code} joyini o'chirasizmi?`))) return;
    await run(async () => {
      await del(`${E}/cells/${c.id}`);
      setSel(null);
      toast(`${c.code} o'chirildi`);
    });
  };

  // ---- plitkalar: bosilsa — ichi ostida ochiladi (qayta bosilsa yopiladi)
  const toggle = (id: number | "none") => go(path.bld === id ? TOP : { bld: id, blk: null, rk: null });
  const toggleBlk = (id: number | "none") => go({ bld: path.bld, blk: path.blk === id ? null : id, rk: null });
  const toggleRk = (id: number | "none") => go({ ...path, rk: path.rk === id ? null : id });

  const bldBoxes: Box[] = [
    ...v.buildings.map((b): Box => {
      const bs = v.blocksOf(b);
      const cs = bs.flatMap((x) => v.inBlock(x));
      const t = tally(cs);
      return {
        key: `b${b.id}`,
        code: b.code,
        t: b.name,
        s: `${n(bs.length, "xona")} · ${n(t.cells, "joy")}`,
        units: t.units,
        fill: fillOf(cs),
        on: path.bld === b.id,
        onClick: () => toggle(b.id),
        menu: () => void buildingMenu(b),
      };
    }),
    ...(v.blocksOf("none").length || v.inBlock("none").length
      ? [
          ((): Box => {
            const t = tally([...v.blocksOf("none").flatMap((x) => v.inBlock(x)), ...v.inBlock("none")]);
            return { key: "bnone", t: "Binoga biriktirilmagan", s: n(t.cells, "joy"), units: t.units, dim: true, on: path.bld === "none", onClick: () => toggle("none") };
          })(),
        ]
      : []),
  ];

  const blkBoxes: Box[] | null =
    path.bld === null
      ? null
      : [
          ...v.blocksOf(bld ?? "none").map((b): Box => {
            const t = tally(v.inBlock(b));
            return {
              key: `k${b.id}`,
              code: b.code,
              t: b.name || `${b.code} xona`,
              s: `${b.purpose && b.purpose !== "storage" ? `${PURPOSES.find((x) => x[0] === b.purpose)?.[1]} · ` : ""}${b.full ?? b.code} · ${n(v.racksOf(b).length, "stellaj")} · ${n(t.cells, "joy")}`,
              units: t.units,
              fill: fillOf(v.inBlock(b)),
              on: path.blk === b.id,
              onClick: () => toggleBlk(b.id),
              menu: () => void blockMenu(b),
            };
          }),
          ...(path.bld === "none" && v.inBlock("none").length
            ? [{ key: "knone", t: "Xonaga biriktirilmagan joylar", s: n(v.inBlock("none").length, "joy"), units: tally(v.inBlock("none")).units, dim: true, on: path.blk === "none", onClick: () => toggleBlk("none") }]
            : []),
        ];

  const rackBoxes: Box[] | null = blk
    ? [
        ...v.racksOf(blk).map((r): Box => {
          const t = tally(v.inRack(r));
          return {
            key: `r${r.id}`,
            code: String(r.number).padStart(2, "0"),
            t: rackTitle(r),
            s: `${r.code} · ${r.rows}×${r.floors}${r.cell_kind && r.cell_kind !== "shelf" ? ` · ${CELL_KINDS.find((x) => x[0] === r.cell_kind)?.[1]}` : ""} · ${n(t.cells, "joy")}`,
            units: t.units,
            fill: fillOf(v.inRack(r)),
            on: path.rk === r.id,
            onClick: () => toggleRk(r.id),
            menu: () => void rackMenu(r),
          };
        }),
        ...(v.loose(blk).length
          ? [{ key: "rnone", t: "Stellajga biriktirilmagan", s: n(v.loose(blk).length, "joy"), units: tally(v.loose(blk)).units, dim: true, on: path.rk === "none", onClick: () => toggleRk("none") }]
          : []),
      ]
    : null;

  // ---- joylar to'ri: stellaj — old tomondan chizma (qator × qavat), biriktirilmaganlar — kod bo'yicha ustunlar (⋯ bilan)
  const grid: Grid | null = rack
    ? {
        title: `${rack.code} — ${rackTitle(rack)}`,
        sub: `${rack.rows} qator × ${rack.floors} qavat${rack.capacity ? ` · ${rack.capacity} birlik/joy` : ""}${rack.max_width_mm ? ` · eni ≤ ${rack.max_width_mm} mm` : ""}`,
        rows: [],
        rack: { code: rack.code, rows: rack.rows, floors: rack.floors, capacity: rack.capacity, cells: v.inRack(rack) },
      }
    : blk && path.rk === "none"
      ? { title: `Stellajga biriktirilmagan — ${blk.full ?? blk.code}`, sub: n(v.loose(blk).length, "joy"), rows: racks(v.loose(blk)), rowMenu: true }
      : path.blk === "none"
        ? { title: "Xonaga biriktirilmagan joylar", sub: n(v.inBlock("none").length, "joy"), rows: racks(v.inBlock("none")), rowMenu: true }
        : null;

  // ---- oynalar
  const forms = {
    bld: { whCode: v.code, next: nextBld, init: edit.bld ? { number: edit.bld.number ?? 1, name: edit.bld.name } : undefined },
    blk: edit.blk
      ? {
          bldCode: v.buildings.find((b) => b.id === edit.blk!.building_id)?.code ?? "",
          building: "",
          groups: grps.data ?? [],
          init: { code: edit.blk.code, name: edit.blk.name, purpose: edit.blk.purpose ?? "storage", groups: edit.blk.groups ?? [] },
        }
      : bld
        ? { bldCode: bld.code ?? "", building: bld.name, groups: grps.data ?? [] }
        : null,
    rack: edit.rack
      ? {
          title: `${edit.rack.code} — xarakteristika`,
          prefix: edit.rack.code,
          next: edit.rack.number,
          init: {
            rows: edit.rack.rows,
            floors: edit.rack.floors,
            name: edit.rack.name,
            cell_kind: edit.rack.cell_kind ?? "shelf",
            capacity: edit.rack.capacity ?? null,
            max_width_mm: edit.rack.max_width_mm ?? null,
          },
        }
      : blk
        ? { title: `Stellaj qo'shish — ${blk.full ?? blk.code}`, prefix: blk.full ?? blk.code, next: Math.max(0, ...v.racksOf(blk).map((r) => r.number)) + 1 }
        : null,
    wiz: {
      whCode: v.code,
      buildings: v.buildings.map((b) => ({ id: b.id, number: b.number ?? 0, name: b.name })),
      nextBld,
      nextRack: (bid: number, code: string) => {
        const x = v.blocks.find((b) => b.building_id === bid && b.code === code);
        return x ? Math.max(0, ...v.racksOf(x).map((r) => r.number)) + 1 : 1;
      },
    },
  };

  /** istalgan darajaning kodi: AO1 · AO1-A · AO1-A-02 · AO1-A-02-03 · AO1-A-02-03-C (yoki erkin joy kodi) */
  const find = (q: string): boolean => {
    const code = q.toUpperCase().replace(/\s+/g, "");
    const c = v.cells.find((x) => x.code === code);
    if (c) {
      const b = v.blocks.find((x) => x.id === c.block_id);
      const bldId = b ? (b.building_id && v.buildings.some((x) => x.id === b.building_id) ? b.building_id : "none") : "none";
      const rk = c.rack_id && v.rks.some((r) => r.id === c.rack_id) ? c.rack_id : b ? "none" : null;
      setPath({ bld: bldId, blk: b ? b.id : "none", rk });
      setSel(c);
      return true;
    }
    const r = v.rks.find((x) => x.code === code || code.startsWith(`${x.code}-`)); // stellaj yoki uning qatori
    if (r) {
      const b = v.blocks.find((x) => x.id === r.block_id)!;
      go({ bld: b.building_id ?? "none", blk: b.id, rk: r.id });
      return true;
    }
    const b = v.blocks.find((x) => x.full === code);
    if (b) {
      go({ bld: b.building_id ?? "none", blk: b.id, rk: null });
      return true;
    }
    const bd = v.buildings.find((x) => x.code === code);
    if (bd) {
      go({ bld: bd.id, blk: null, rk: null });
      return true;
    }
    const other = (st.data?.cells ?? []).find((x) => x.code === code);
    toast(other ? `${code} — «${other.warehouse}» omborida: o'sha omborga o'ting (Ombor → omborni almashtirish)` : `${code} — bunday kod topilmadi`, "bad");
    return false;
  };

  return (
    <CellsView
      wide={wide}
      st={st}
      store={store ? { ...store, code: v.code || store.code } : null}
      back={rack ? rack.code : blk ? (blk.full ?? blk.code) : "Ombor xaritasi"}
      bldBoxes={bldBoxes}
      blkBoxes={blkBoxes}
      rackBoxes={rackBoxes}
      grid={grid}
      buildingName={bld?.name ?? null}
      blockCode={blk ? (blk.full ?? blk.code) : null}
      forms={forms}
      sel={sel}
      modal={modal}
      detail={
        sel ? (
          <>
            <CellCard key={`${sel.id}-${sel.code}`} c={sel} />
            {sel.rack_id ? (
              <div className="mt-3">
                <span className="l mx-4 block">Holati</span>
                <Seg<CellStatus> items={STATUS} cur={sel.status ?? "active"} onPick={(s) => void setStatus(sel, s)} />
              </div>
            ) : null}
            <Btns>
              <button className="btn danger" onClick={() => void dropCell(sel)}>
                Joyni o&apos;chirish
              </button>
            </Btns>
          </>
        ) : null
      }
      onSel={setSel}
      onModal={(m) => (m === null ? close() : open(m))}
      onStoreMenu={() => void storeMenu()}
      onFind={find}
      onRowMenu={(r) => void rowMenu(r)}
      onBld={(number, name) =>
        void submit(async () => {
          if (edit.bld) {
            const r = await post<WhBuilding & { recoded: number }>(`${E}/wh/buildings/${edit.bld.id}`, { number, name });
            recodedToast(r.recoded);
          } else {
            const b = await post<WhBuilding>(`${E}/wh/buildings`, { store_id: wh, number, name });
            toast(`${b.code} · ${b.name} qo'shildi`);
            go({ bld: b.id, blk: null, rk: null });
          }
        })
      }
      onBlk={(d: BlkData) =>
        void submit(async () => {
          if (edit.blk) {
            const r = await post<WhBlock & { recoded: number }>(`${E}/wh/blocks/${edit.blk.id}`, d);
            recodedToast(r.recoded);
          } else if (bld) {
            const b = await post<WhBlock>(`${E}/wh/blocks`, { store_id: wh, building_id: bld.id, ...d });
            toast(`${b.full} xona qo'shildi`);
            go({ bld: bld.id, blk: b.id, rk: null });
          }
        })
      }
      onRack={(d: RackData) =>
        void submit(async () => {
          const { rows, floors } = d;
          if (edit.rack) {
            const r = await post<WhRack & { added: number; removed: number }>(`${E}/wh/racks/${edit.rack.id}`, d);
            toast(`Saqlandi: ${r.rows} × ${r.floors}${r.added ? ` · +${r.added} joy` : ""}${r.removed ? ` · −${r.removed} joy` : ""}`);
            if (sel && sel.rack_id === edit.rack.id && ((sel.row ?? 0) > rows || (sel.floor ?? 0) > floors)) setSel(null);
          } else if (blk) {
            const r = await post<{ racks: WhRack[]; cells: number }>(`${E}/wh/racks`, { store_id: wh, block_id: blk.id, ...d });
            toast(`${r.racks.map((x) => x.code).join(", ")} qo'shildi: ${n(r.cells, "joy")}`);
            go({ ...path, rk: r.racks[0].id });
            if (await confirm(`${n(r.racks.length, "stellaj")} uchun yorliqlarni PDF qilaymi? (stellaj boshi + tokchalar)`)) {
              void labelsPdf({ rack_ids: r.racks.map((x) => x.id) });
              const all = (await api<Cell[]>(`${E}/cells`)).filter((c) => r.racks.some((x) => x.id === c.rack_id));
              if (all.length) void labelsPdf({ cell_ids: all.map((c) => c.id) });
            }
          }
        })
      }
      onWiz={(d: WizData) =>
        void submit(async () => {
          const r = await post<{ building_id: number; block_id: number; racks: WhRack[]; cells: number }>(`${E}/wh/wizard`, { store_id: wh, ...d });
          toast(`Yaratildi: ${r.racks.map((x) => x.code).join(", ")} — ${n(r.cells, "joy")}`);
          go({ bld: r.building_id, blk: r.block_id, rk: r.racks[0]?.id ?? null });
        })
      }
      onEditStore={(name, kind, code) =>
        void submit(async () => {
          if (!store) return;
          const r = await post<Warehouse & { recoded: number }>(`${E}/wh/stores/${store.id}`, { name, kind, code });
          recodedToast(r.recoded);
          await reloadMe();
        })
      }
    />
  );
}
