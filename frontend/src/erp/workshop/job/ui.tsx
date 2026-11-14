// Bitta zakaz (faqat ko'rinish): bosqichlar, zakaz ma'lumoti (mijoz, mahsulot, o'lcham, soni, muddat …), material va
// olingani, tayyor holati, tarix; skaner va sarf oynasi — konteynerdan; asosiy tugma (qabul / material olindi / tayyor).
import type { ReactNode } from "react";

import { CH, d8, dt, num, un, usz } from "@/erp/kit/fmt";
import { Icon, List, MainButton, Row, Sh } from "@/erp/kit/ui";
import { Flow, Material } from "@/erp/workshop/common";
import { ACT, type Detail } from "@/erp/workshop/lib";

export function JobScreen({
  j,
  scan,
  takeSheet,
  onDrawing,
  onSticker,
  onAccept,
  onCollected,
  onReady,
}: {
  j: Detail;
  /** skaner (konteyner) — material yig'ish/tayyorlash bosqichida */
  scan: ReactNode;
  /** sarf oynasi (ochiq bo'lsa) */
  takeSheet: ReactNode;
  onDrawing: () => void;
  onSticker: () => void;
  onAccept: () => void;
  onCollected: () => void;
  onReady: () => void;
}) {
  const sp = j.spec || {};
  const work = j.phase === "collecting" || j.phase === "making";
  return (
    <>
      <Flow phase={j.phase} />
      <Sh t="Zakaz" />
      <List>
        <Row
          icon="users"
          color="blue"
          t="Mijoz"
          val={j.customer || "—"}
        />
        <Row
          icon="file"
          color="gray"
          t="Buyurtma"
          val={<span className="code">{j.order_number || "—"}</span>}
          valSmall={j.channel ? CH[j.channel] || j.channel : ""}
        />
        <Row
          icon="package"
          color="purple"
          t="Mahsulot"
          s={
            j.belt_mark ? (
              <>
                <span className="code">{j.belt_mark}</span>
                {j.brand ? " " + j.brand : ""}
              </>
            ) : (
              ""
            )
          }
          val={<b>{j.item}</b>}
        />
        {j.lenta_project || sp.length ? (
          <Row
            icon="ruler"
            color="orange"
            t="O'lcham"
            val={
              <span className="code xl">
                {num(sp.width)} × {num(sp.length)}
              </span>
            }
            valSmall={sp.joint ? `mm · +${num(sp.joint)} ulash` : "mm"}
          />
        ) : (
          <Row
            icon="ruler"
            color="orange"
            t={j.route === "rukav" ? "Eni" : "Kenglik"}
            val={
              <span className="code xl">
                {j.char ||
                  (sp.width
                    ? num(sp.width) + " mm"
                    : j.route === "rukav"
                      ? num(j.qty) + " mm"
                      : "—")}
              </span>
            }
          />
        )}
        {j.route !== "rukav" ? (
          <Row
            icon="layers"
            color="teal"
            t="Soni"
            val={<span className="code xl">{num(j.qty, 3)}</span>}
            valSmall={un(j.unit)}
          />
        ) : null}
        <Row
          icon="calendar"
          color={j.late ? "red" : "orange"}
          t="Muddat"
          val={
            j.due ? (
              <span className={j.late ? "text-danger" : ""}>{d8(j.due)}</span>
            ) : (
              "—"
            )
          }
        />
        {j.seller_name ? (
          <Row
            icon="user"
            color="gray"
            t="Sotuvchi"
            val={j.seller_name}
          />
        ) : null}
        {j.order_note ? (
          <Row icon="message" color="gray" t="Izoh" s={j.order_note} />
        ) : null}
        {j.lenta_project ? (
          <Row
            icon="download"
            color="purple"
            t="Lenta chizmasi (PDF)"
            s="teshiklar, profil, ulash — batafsil"
            tap
            onClick={onDrawing}
          />
        ) : null}
        {j.worker ? (
          <Row
            icon="user"
            color="indigo"
            t="Ishchi"
            val={j.worker}
            valSmall={j.accepted_at ? dt(j.accepted_at) : ""}
          />
        ) : null}
      </List>

      {j.plan.length ? (
        <>
          <Sh t="Material" r={work ? "qayerdan olish" : ""} />
          <Material plan={j.plan} work={work} />
        </>
      ) : null}
      {j.taken.length ? (
        <>
          <Sh t="Olingan material" />
          <List>
            {j.taken.map((t, i) => (
              <Row
                key={i}
                icon="check"
                color="green"
                t={t.name}
                tcls="wrap2"
                s={[t.code, usz(t), t.by, dt(t.created)]
                  .filter(Boolean)
                  .join(" · ")}
                val={<span className="num">{num(t.qty, 3)}</span>}
                valSmall={un(t.unit)}
              />
            ))}
          </List>
        </>
      ) : null}
      {work ? scan : null}
      {j.phase === "ready" ? (
        <>
          <div className="empty" style={{ padding: "20px 16px 4px" }}>
            <div className="ei" style={{ color: "var(--ok)" }}>
              <Icon n="check" />
            </div>
            <b className="text-ok">Tayyor — omborga topshirildi</b>
            {j.product_code ? (
              <>
                <br />
                <span className="code">{j.product_code}</span>
              </>
            ) : null}
          </div>
          <div className="btns">
            <button className="btn sec" onClick={onSticker}>
              <Icon n="download" /> Buyurtma stikeri (PDF)
            </button>
          </div>
        </>
      ) : null}
      {j.log.length ? (
        <>
          <Sh t="Tarix" />
          <List>
            {j.log
              .slice()
              .reverse()
              .map((l, i) => (
                <Row
                  key={i}
                  t={[ACT[l.action] || l.action, l.by]
                    .filter(Boolean)
                    .join(" · ")}
                  s={l.data?.qty ? num(l.data.qty, 3) : ""}
                  val={<span style={{ fontSize: 13 }}>{dt(l.ts)}</span>}
                />
              ))}
          </List>
        </>
      ) : null}

      {takeSheet}

      {j.phase === "new" ? (
        <MainButton text="Zakazni qabul qilish" onClick={onAccept} />
      ) : j.phase === "collecting" ? (
        <MainButton text="Material olindi → Tayyorlash" onClick={onCollected} />
      ) : j.phase === "making" ? (
        <MainButton text="Tayyor" color="#31b545" onClick={onReady} />
      ) : null}
    </>
  );
}
