// Sex amallari (tasdiq + API + signal + PDF): bir nechta zakazni birga tayyor qilish (taxta va guruh ekrani).
import { beep, confirm, download, post, toast } from "@/erp/kit/env";

/** true — tayyor qilindi (stikerlar bitta PDF yuklab olinadi) */
export async function readyMany(ids: number[]): Promise<boolean> {
  if (
    !(await confirm(
      `${ids.length} ta mahsulot tayyormi? Omborga kiritiladi va buyurtma stikerlari (bitta PDF) chiqadi.`,
    ))
  )
    return false;
  try {
    const r = await post<{
      done: number[];
      skipped: number[];
      sticker?: { url: string };
    }>("/app/api/erp/shop/group/ready", { ids });
    beep(true);
    toast(
      `${r.done.length} ta tayyor${r.skipped.length ? ` · ${r.skipped.length} tasi o'tkazib yuborildi` : ""}`,
    );
    if (r.sticker) download(r.sticker.url, `zakazlar-${r.done.length}.pdf`);
    return true;
  } catch (e) {
    beep(false);
    toast((e as Error).message, "bad");
    return false;
  }
}
