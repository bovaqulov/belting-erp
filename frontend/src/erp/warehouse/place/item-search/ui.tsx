// Tovar qidirish oynasi (faqat ko'rinish): qidiruv maydoni va natijalar (60 tagacha).
import { num, un } from "@/erp/kit/fmt";
import { Modal } from "@/erp/kit/modal";
import { List, Loaded, Row, Sf } from "@/erp/kit/ui";
import type { CatHit } from "@/erp/warehouse/lib";

const COLOR: Record<CatHit["kind"], string> = { material: "orange", product: "green", goods: "blue", service: "gray" };

export function ItemSearchView({
  q,
  dq,
  st,
  onQ,
  onPick,
  onClose,
}: {
  q: string;
  dq: string;
  st: { data: CatHit[] | undefined; err: string; net: boolean; reload: () => Promise<void> };
  onQ: (v: string) => void;
  onPick: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Tovar" onClose={onClose}>
      <input className="inp w-full" value={q} onChange={(e) => onQ(e.target.value)} placeholder="Nom yoki belgi: 1040 8M, SPB 1650" aria-label="Tovar qidirish" autoComplete="off" />
      <div className="mt-2.5 [&_.skel]:!mx-0">
        <Loaded st={st}>
          {(rs) =>
            rs.length ? (
              <List cls="!mx-0">
                {rs.slice(0, 60).map((x) => (
                  <Row
                    key={x.id}
                    icon="package"
                    color={COLOR[x.kind]}
                    t={x.name}
                    tcls="wrap2"
                    s={[x.grp, Number(x.qty) ? `omborda ${num(x.qty, 3)} ${un(x.unit)}` : ""].filter(Boolean).join(" · ")}
                    onClick={() => onPick(x.id)}
                  />
                ))}
              </List>
            ) : (
              <Sf>{dq ? "Topilmadi. Katalogda yo'q bo'lsa — Accounting › Mahsulotlar bo'limida qo'shing." : "Katalog bo'sh"}</Sf>
            )
          }
        </Loaded>
      </div>
    </Modal>
  );
}
