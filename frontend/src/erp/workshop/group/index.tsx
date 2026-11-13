"use client";
// Bir nechta zakaz birga: birga qabul, bitta rukav/lentadan ulushlab sarf (har zakazga o'z ulushi), material olindi
// (skanerlanmagan bo'lsa — tasdiq bilan), birga tayyor, stikerlar bitta PDF.
import { useEffect, useMemo, useState } from "react";

import { beep, confirm, download, post, toast } from "@/erp/kit/env";
import { Loaded, useLoad, type Nav } from "@/erp/kit/ui";
import { readyMany } from "@/erp/workshop/api";
import type { Group as G, Take, View } from "@/erp/workshop/lib";
import { Scan } from "@/erp/workshop/scan";
import { TakeSheet } from "@/erp/workshop/take";

import { GroupScreen } from "./ui";

export function Group({ ids, nav, setTitle }: { ids: number[]; nav: Nav<View>; setTitle: (t: string) => void }) {
  const st = useLoad(
    () => post<G>("/app/api/erp/shop/group", { ids }),
    [ids.join(",")],
  );
  const [take, setTake] = useState<Take | null>(null);
  const reload = st.reload;
  const n = st.data?.jobs.length ?? ids.length;
  useEffect(() => setTitle(`${n} ta zakaz`), [n, setTitle]);
  const body = useMemo(() => ({ ids }), [ids]);

  return (
    <Loaded st={st}>
      {(g) => (
        <GroupScreen
          g={g}
          n={n}
          scan={
            <Scan
              plan={g.plan}
              onUnit={setTake}
              hint={`Bitta rukav/lentadan hamma ${n} ta zakaz uchun jami sarfni kiriting — har zakazga o'z ulushi alohida yoziladi. Qolgan qismi o'z stikeri bilan o'sha javonda qoladi.`}
            />
          }
          takeSheet={
            take ? (
              <TakeSheet
                t={take}
                extra={` ${n} ta zakazga ehtiyojiga qarab bo'linadi.`}
                onClose={() => setTake(null)}
                send={async (bid, b) => {
                  const r = await post<{ taken: unknown[] }>("/app/api/erp/shop/group/take", { ids, batch_id: bid, ...b });
                  toast(`Sarf ${r.taken.length} ta zakazga bo'lindi`);
                  void reload();
                }}
              />
            ) : null
          }
          onJob={(id) => nav.go({ k: "job", id })}
          onSticker={async () => {
            try {
              const r = await post<{ url: string }>("/app/api/erp/shop/group/sticker", body);
              download(r.url, `zakazlar-${n}.pdf`);
            } catch (e) {
              toast((e as Error).message, "bad");
            }
          }}
          onAccept={async () => {
            try {
              const r = await post<{ done: number[] }>("/app/api/erp/shop/group/accept", body);
              beep(true);
              toast(`${r.done.length} ta qabul qilindi`);
              await reload();
            } catch (e) {
              beep(false);
              toast((e as Error).message, "bad");
            }
          }}
          onCollected={async () => {
            try {
              await post("/app/api/erp/shop/group/collected", body);
            } catch (e) {
              const m = (e as Error).message;
              if (!/baribir/.test(m)) return toast(m, "bad");
              if (!(await confirm(m.replace(/ — baribir.*/, ". Baribir tayyorlashga o'tilsinmi?")))) return;
              await post("/app/api/erp/shop/group/collected", { ids, force: true });
            }
            beep(true);
            toast("Tayyorlanmoqda");
            await reload();
          }}
          onReady={async () => {
            if (await readyMany(ids)) await reload();
          }}
        />
      )}
    </Loaded>
  );
}
