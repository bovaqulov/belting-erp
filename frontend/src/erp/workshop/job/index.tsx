"use client";
// Bitta zakaz: yuklash, sarlavha (buyurtma raqami), material skanerlash → sarf, qabul / material olindi (skanerlanmagan
// bo'lsa — tasdiq bilan) / tayyor (omborga + stiker), chizma va stiker PDF.
import { useCallback, useEffect, useState } from "react";

import { api, beep, confirm, download, post, toast } from "@/erp/kit/env";
import { Loaded, useLoad } from "@/erp/kit/ui";
import { apiBlob, openBlob } from "@/shared/api/client";
import { ord, type Detail, type Take } from "@/erp/workshop/lib";
import { Scan } from "@/erp/workshop/scan";
import { TakeSheet } from "@/erp/workshop/take";

import { JobScreen } from "./ui";

export function Job({ id, setTitle }: { id: number; setTitle: (t: string) => void }) {
  const st = useLoad(() => api<Detail>(`/app/api/erp/shop/jobs/${id}`), [id]);
  const [take, setTake] = useState<Take | null>(null);
  const reload = st.reload;
  const j = st.data;
  useEffect(() => {
    if (j) setTitle(ord(j));
  }, [j, setTitle]);
  const sticker = useCallback(async () => {
    try {
      const r = await post<{ url: string }>(
        `/app/api/erp/shop/jobs/${id}/sticker`,
      );
      download(r.url, `${j ? ord(j) : id}.pdf`);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  }, [id, j]);

  return (
    <Loaded st={st}>
      {(j) => (
        <JobScreen
          j={j}
          scan={
            <Scan
              plan={j.plan}
              onUnit={setTake}
              hint="Stellajdan materialni olib, stikerini skanerlang — sarf miqdorini kiritib tasdiqlaysiz. Qolgan qismi o'z stikeri bilan o'sha javonda qoladi."
            />
          }
          takeSheet={
            take ? (
              <TakeSheet
                t={take}
                onClose={() => setTake(null)}
                send={async (bid, body) => {
                  await post(`/app/api/erp/shop/jobs/${id}/take`, { batch_id: bid, ...body });
                  toast("Sarf tasdiqlandi");
                  void reload();
                }}
              />
            ) : null
          }
          onDrawing={async () => {
            try {
              openBlob(await apiBlob(`/app/api/erp/jobs/${id}/drawing.pdf`), `chizma-${id}.pdf`);
            } catch (e) {
              toast((e as Error).message, "bad");
            }
          }}
          onSticker={() => void sticker()}
          onAccept={async () => {
            try {
              await post(`/app/api/erp/shop/jobs/${id}/accept`);
              beep(true);
              toast("Qabul qilindi — material yig'ish");
              await reload();
            } catch (e) {
              beep(false);
              toast((e as Error).message, "bad");
            }
          }}
          onCollected={async () => {
            try {
              await post(`/app/api/erp/shop/jobs/${id}/collected`, {});
            } catch (e) {
              const m = (e as Error).message;
              if (!/baribir/.test(m)) return toast(m, "bad");
              if (!(await confirm("Material skanerlanmadi. Baribir tayyorlashga o'tilsinmi?"))) return;
              await post(`/app/api/erp/shop/jobs/${id}/collected`, { force: true });
            }
            beep(true);
            toast("Tayyorlanmoqda");
            await reload();
          }}
          onUntake={async (t) => {
            if (!(await confirm(`${t.code ?? t.name} omborga qaytarilsinmi? Sarf (${t.doc ?? "—"}) bekor bo'ladi, bo'lak joylash navbatiga tushadi. Bir nechta zakazga bo'lingan bo'lsa — hammasidan ayriladi.`))) return;
            try {
              const r = await post<{ number: string; codes: string[]; warehouse: string }>(`/app/api/erp/shop/jobs/${id}/untake`, { take_id: t.id });
              beep(true);
              toast(`${r.number}: ${r.codes.join(", ") || "material"} → ${r.warehouse} (joylash navbati)`);
              await reload();
            } catch (e) {
              beep(false);
              toast((e as Error).message, "bad");
            }
          }}
          onReady={async () => {
            if (!(await confirm("Mahsulot tayyormi? Omborga kiritiladi va buyurtma stikeri chiqadi."))) return;
            try {
              const r = await post<{ sticker?: { url: string } }>(`/app/api/erp/shop/jobs/${id}/ready`);
              beep(true);
              toast("Tayyor!");
              if (r.sticker) download(r.sticker.url, `${ord(j)}.pdf`);
              await reload();
            } catch (e) {
              beep(false);
              toast((e as Error).message, "bad");
            }
          }}
        />
      )}
    </Loaded>
  );
}
