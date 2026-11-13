// Bir nechta zakaz birga (faqat ko'rinish): bosqichlar, zakazlar ro'yxati, jami material, skaner, birga stikerlar,
// asosiy tugma (birga qabul / material olindi / tayyor).
import type { ReactNode } from "react";

import { d8, num } from "@/erp/kit/fmt";
import { Icon, List, MainButton, Row, Sh } from "@/erp/kit/ui";
import { Flow, Material } from "@/erp/workshop/common";
import { ord, PHN, rukavSize, type Group } from "@/erp/workshop/lib";

export function GroupScreen({
  g,
  n,
  scan,
  takeSheet,
  onJob,
  onSticker,
  onAccept,
  onCollected,
  onReady,
}: {
  g: Group;
  n: number;
  scan: ReactNode;
  takeSheet: ReactNode;
  onJob: (id: number) => void;
  onSticker: () => void;
  onAccept: () => void;
  onCollected: () => void;
  onReady: () => void;
}) {
  const ph = g.phase;
  const work = ph === "collecting" || ph === "making";
  return (
    <>
      {ph ? <Flow phase={ph} /> : null}
      <Sh t={`${n} ta zakaz`} r={ph ? "" : "holatlari har xil"} />
      <List>
        {g.jobs.map((j) => (
          <Row
            key={j.id}
            icon="factory"
            color={
              j.late ? "red" : j.phase === "ready" ? "green" : "purple"
            }
            t={<span className="code">{ord(j)}</span>}
            s={[j.item, rukavSize(j), j.customer]
              .filter(Boolean)
              .join(" · ")}
            scls="wrap2"
            val={
              ph === "collecting" ? (
                Number(j.left) ? (
                  <span className="num">{num(j.left, 3)}</span>
                ) : (
                  <span className="ok-t">
                    <Icon n="check" />
                  </span>
                )
              ) : j.phase !== ph ? (
                PHN[j.phase]
              ) : j.due ? (
                <span className={j.late ? "bad-t" : ""}>{d8(j.due)}</span>
              ) : (
                ""
              )
            }
            chev
            data={{ j: j.id }}
            onClick={() => onJob(j.id)}
          />
        ))}
      </List>
      {g.plan.length ? (
        <>
          <Sh t="Material — jami" r={work ? "qayerdan olish" : ""} />
          <Material plan={g.plan} work={work} />
        </>
      ) : null}
      {work ? scan : null}
      {ph === "ready" ? (
        <div className="btns">
          <button
            className="btn sec"
            onClick={onSticker}
          >
            <Icon n="download" /> {n} ta buyurtma stikeri (PDF)
          </button>
        </div>
      ) : null}

      {takeSheet}

      {ph === "new" ? (
        <MainButton text={`${n} ta zakazni qabul qilish`} onClick={onAccept} />
      ) : ph === "collecting" ? (
        <MainButton text={`Material olindi → ${n} tasini tayyorlash`} onClick={onCollected} />
      ) : ph === "making" ? (
        <MainButton text={`${n} ta zakaz tayyor`} color="#31b545" onClick={onReady} />
      ) : null}
    </>
  );
}
