// Sex umumiy ko'rinish bo'laklari: muddat, o'lcham, bosqichlar chizig'i, material (reja + qayerdan olish).
import type { CSSProperties } from "react";

import { d8, num, un, usz } from "@/erp/kit/fmt";
import { List, Row } from "@/erp/kit/ui";
import { PH, PHC, PHN, type Job, type Phase, type Plan } from "@/erp/workshop/lib";

export function Due({ j }: { j: Job }) {
  if (!j.due) return null;
  return (
    <span className={`st ${j.late ? "bad" : ""}`}>
      {j.late ? "kechikdi " : ""}
      {d8(j.due)}
    </span>
  );
}

export function SizeOf({ j }: { j: Job }) {
  if (j.route === "rukav" && !j.size)
    return (
      <>
        {num(j.qty, 0)}
        <small>mm</small>
      </>
    );
  if (!j.size) return null;
  const mm = /mm$/.test(j.size);
  return (
    <>
      {j.size.replace(/ mm$/, "")}
      {mm ? <small>mm</small> : null}
      {Number(j.qty) && j.unit !== "mm" && j.route !== "rukav" ? (
        <small>× {num(j.qty, 3)}</small>
      ) : null}
    </>
  );
}

export function Flow({ phase }: { phase: Phase }) {
  const at = PH.indexOf(phase);
  return (
    <div
      className="flow"
      style={{ "--c": `var(--st-${PHC[phase] || "new"})` } as CSSProperties}
    >
      {PH.map((p, i) => (
        <span key={p} className={i < at ? "done" : i === at ? "cur" : ""}>
          {i < at ? "✓ " : ""}
          {PHN[p]}
        </span>
      ))}
    </div>
  );
}

export function Material({ plan, work }: { plan: Plan[]; work: boolean }) {
  return (
    <>
      {plan.map((p, k) => (
        <List key={k}>
          <Row
            icon="layers"
            color="orange"
            t={p.name}
            tcls="wrap2"
            s={p.cut || ""}
            val={<span className="num">{num(p.left, 3)}</span>}
            valSmall={`${un(p.unit)} kerak${Number(p.taken) ? ` · ${num(p.taken, 3)} olindi` : ""}`}
          />
          {work && Number(p.left) > 0 ? (
            p.candidates.length ? (
              p.candidates.map((c, i) => (
                <Row
                  key={i}
                  icon="pin"
                  color={c.loc ? "red" : "gray"}
                  t={
                    c.loc ? (
                      <span className="code loc">{c.loc}</span>
                    ) : (
                      "Joyi belgilanmagan"
                    )
                  }
                  s={[
                    c.block_name || (c.block ? "Blok " + c.block : ""),
                    c.code,
                    usz(c),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  val={<span className="num">{num(c.qty, 3)}</span>}
                  valSmall={un(p.unit)}
                />
              ))
            ) : (
              <Row
                icon="alert"
                color="red"
                t="Omborda yetadigan material topilmadi"
                s="xaridga yoki boshqa omborga qarang"
              />
            )
          ) : null}
        </List>
      ))}
    </>
  );
}
