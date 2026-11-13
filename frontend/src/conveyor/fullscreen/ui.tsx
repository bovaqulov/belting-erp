// To'liq ekran ko'ruvchi (faqat ko'rinish): yopish, listlar (oldingi/keyingi, raqam), masshtab tugmalari, sahna.
// SVG — backend chizgan (server SVG) — dangerouslySetInnerHTML faqat shu yerda va ko'ruvchida.
import type { RefObject } from "react";

import { c, Icon } from "@/conveyor/kit";
import type { Sheet } from "@/conveyor/lib/types";

function FsBtn({ a, icon, label, onClick, disabled = false }: { a: string; icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button className={c("icon-btn")} data-a={a} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}

export function FullscreenView({
  t,
  sheets,
  cur,
  stageRef,
  innerRef,
  onClose,
  onPage,
  onZoomOut,
  onFit,
  onZoomIn,
}: {
  t: (uz: string, ru: string) => string;
  sheets: Sheet[];
  cur: number;
  stageRef: RefObject<HTMLDivElement | null>;
  innerRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onPage: (n: number) => void;
  onZoomOut: () => void;
  onFit: () => void;
  onZoomIn: () => void;
}) {
  const sh = sheets[cur];
  const many = sheets.length > 1;
  return (
    <div className={c("fs")} role="dialog" aria-modal="true" aria-label={sh.title}>
      <div className={c("fsbar")}>
        <FsBtn a="close" icon="x" label={t("Yopish", "Закрыть")} onClick={onClose} />
        {many ? <FsBtn a="prev" icon="chevron-left" label={t("Oldingi list", "Предыдущий лист")} onClick={() => onPage(cur - 1)} disabled={cur <= 0} /> : null}
        <div className={c("t")}>{many ? `${cur + 1} / ${sheets.length} · ${sh.title}` : sh.title}</div>
        {many ? <FsBtn a="next" icon="chevron-right" label={t("Keyingi list", "Следующий лист")} onClick={() => onPage(cur + 1)} disabled={cur >= sheets.length - 1} /> : null}
        <FsBtn a="out" icon="zoom-out" label={t("Kichiklashtirish", "Уменьшить")} onClick={onZoomOut} />
        <FsBtn a="fit" icon="scan" label={t("Sig'dirish", "Вписать")} onClick={onFit} />
        <FsBtn a="in" icon="zoom-in" label={t("Kattalashtirish", "Увеличить")} onClick={onZoomIn} />
      </div>
      <div className={c("stage")} data-stage="" ref={stageRef}>
        <div className={c("inner")} ref={innerRef} dangerouslySetInnerHTML={{ __html: sh.svg }} />
      </div>
    </div>
  );
}
