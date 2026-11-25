import type { ReactNode } from "react";

import type { Account, GwStatus } from "@/tgcrm/api";
import { Av, Empty, GatewayNotices, Icon, St, Top } from "@/tgcrm/kit";
import { displayName, fmtPhone, tone } from "@/tgcrm/lib";

function Row({ a, onOpen }: { a: Account; onOpen: (id: number) => void }) {
  const name = displayName(a);
  const sub = [a.title && a.name ? a.name : "", fmtPhone(a.phone), a.username ? `@${a.username}` : ""].filter(Boolean).join(" · ");
  return (
    <button type="button" className="item tap w-full border-0 bg-transparent text-left text-fg" onClick={() => onOpen(a.id)} style={{ font: "inherit" }}>
      <Av name={name} seed={a.tg_user_id ?? a.id} />
      <span className="main">
        <span className="t block">{name}</span>
        <span className="s block">{sub || "Hali ulanmagan"}</span>
      </span>
      <St tone={tone(a.status)}>{a.status_label}</St>
      <Icon n="chevron-right" cls="chev" />
    </button>
  );
}

function Group({ title, rows, onOpen, foot }: { title: string; rows: Account[]; onOpen: (id: number) => void; foot: string }) {
  return (
    <section aria-label={title}>
      <h2 className="sh m-0">
        <span>{title}</span>
        <span className="r">{rows.length || ""}</span>
      </h2>
      {rows.length ? (
        <div className="list">
          {rows.map((a) => (
            <Row key={a.id} a={a} onOpen={onOpen} />
          ))}
        </div>
      ) : null}
      <p className="sf m-0">{foot}</p>
    </section>
  );
}

export function AccountsView({
  gw,
  company,
  personal,
  canCreate,
  health,
  onBack,
  onOpen,
  onCreate,
}: {
  gw: GwStatus;
  company: Account[];
  personal: Account[];
  canCreate: boolean;
  health: ReactNode;
  onBack?: () => void;
  onOpen: (id: number) => void;
  onCreate: () => void;
}) {
  const empty = !company.length && !personal.length;
  return (
    <>
      <Top
        title="TG CRM"
        sub="Telegram akkauntlari"
        home="/app"
        onBack={onBack}
        right={
          canCreate ? (
            <button type="button" className="mini pri" onClick={onCreate}>
              Ulash
            </button>
          ) : null
        }
      />
      <GatewayNotices gw={gw} />
      {empty ? (
        <Empty icon="send" title="Hali akkaunt ulanmagan">
          Firma raqamini yoki o&apos;z Telegram raqamingizni ulang — yozishmalar shu yerda ko&apos;rinadi.
          {canCreate ? (
            <div className="btns">
              <button type="button" className="btn" onClick={onCreate}>
                Akkaunt ulash
              </button>
            </div>
          ) : null}
        </Empty>
      ) : (
        <>
          <Group title="Firma raqamlari" rows={company} onOpen={onOpen} foot="Bo'lim xodimlari birgalikda ishlaydi." />
          <Group
            title="Shaxsiy raqamlar"
            rows={personal}
            onOpen={onOpen}
            foot={gw.me.is_head ? "Sotuvchilarning o'z raqamlari — rahbar hammasini ko'radi." : "Sizning shaxsiy raqamingiz faqat sizga va rahbarga ko'rinadi."}
          />
        </>
      )}
      {health}
      <p className="sf m-0 pt-6">
        Norasmiy Telegram mijozi (MTProto). Ommaviy xabar yuborilmaydi — akkauntlarni Telegram cheklovlaridan himoya qilish uchun so&apos;rovlar navbat bilan
        yuboriladi.
      </p>
    </>
  );
}
