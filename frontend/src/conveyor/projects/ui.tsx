// Loyihalar oynasi (faqat ko'rinish): sarlavha (meniki / hammasi), ro'yxat (ochish, o'chirish), yuklanmoqda / xato / bo'sh.
import { c, EmptyRow, Icon } from "@/conveyor/kit";
import type { ProjectsResp } from "@/conveyor/lib/types";

export function ProjectsView({
  t,
  all,
  canAll,
  cur,
  rows,
  projectId,
  meTg,
  onToggleAll,
  onOpen,
  onDelete,
}: {
  t: (uz: string, ru: string) => string;
  all: boolean;
  canAll: boolean;
  /** null — yuklanmoqda */
  cur: { d?: ProjectsResp; err?: string } | null;
  rows: ProjectsResp["projects"];
  projectId: number | string | null;
  meTg: number | undefined;
  onToggleAll: () => void;
  onOpen: (id: number | string) => void;
  onDelete: (id: number | string) => void;
}) {
  return (
    <>
      <div className={c("sh")}>
        <span>{all ? t("Barcha loyihalar", "Все проекты") : t("Loyihalarim", "Мои проекты")}</span>
        <span className={c("sp")} />
        {canAll ? (
          <button className={c("lnk")} id="pAll" onClick={onToggleAll}>
            {all ? t("Faqat meniki", "Только мои") : t("Hammasi", "Все")}
          </button>
        ) : null}
      </div>
      <div className={c("list")} aria-busy={!cur}>
        {!cur ? (
          <EmptyRow text={t("Yuklanmoqda…", "Загрузка…")} />
        ) : cur.err ? (
          <EmptyRow text={cur.err} />
        ) : rows.length ? (
          rows.map((p) => (
            <div
              key={p.id}
              className={c("item tap", String(p.id) === String(projectId) && "on")}
              data-id={p.id}
              onClick={() => onOpen(p.id)}
            >
              <div className={c("main")}>
                <div className={c("t")}>{p.name || t("Nomsiz loyiha", "Без названия")}</div>
                <div className={c("s")}>
                  {(p.updated || "").replace("T", " ").slice(0, 16)}
                  {p.owner ? " · " + p.owner : ""}
                </div>
              </div>
              {!all || p.tg_id === meTg ? (
                <button
                  className={c("icon-btn del")}
                  data-del={p.id}
                  title={t("O'chirish", "Удалить")}
                  aria-label={`${t("O'chirish", "Удалить")}: ${p.name || p.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(p.id);
                  }}
                >
                  <Icon name="trash-2" />
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyRow text={t("Hali saqlangan loyiha yo'q", "Сохранённых проектов нет")} />
        )}
      </div>
    </>
  );
}
