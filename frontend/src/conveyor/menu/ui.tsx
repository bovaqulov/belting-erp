// ⋯ menyu (faqat ko'rinish): bekor qilish / qayta bajarish, yangi, saqlash, loyihalar, til, chiqish (brauzerda).
import { c, Icon } from "@/conveyor/kit";

export type MenuAct = "undo" | "redo" | "new" | "save" | "proj" | "lang" | "logout";

export function MenuView({
  t,
  canUndo,
  canRedo,
  inTg,
  onAct,
}: {
  t: (uz: string, ru: string) => string;
  canUndo: boolean;
  canRedo: boolean;
  /** Telegram ichida — "Chiqish" yo'q */
  inTg: boolean;
  onAct: (a: MenuAct) => void;
}) {
  const it = (a: MenuAct, icon: string, label: string, dis = false, note = "") => (
    <div
      key={a}
      className={c("item tap")}
      data-m={a}
      role="button"
      tabIndex={dis ? -1 : 0}
      aria-disabled={dis}
      style={dis ? { opacity: 0.4, pointerEvents: "none" } : undefined}
      onClick={() => onAct(a)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAct(a);
        }
      }}
    >
      <Icon name={icon} />
      <div className={c("main")}>
        <div className={c("t")}>{label}</div>
        {note ? <div className={c("s")}>{note}</div> : null}
      </div>
    </div>
  );
  return (
    <>
      <div className={c("list menu")}>
        {it("undo", "undo-2", t("Bekor qilish", "Отменить"), !canUndo, "Ctrl+Z")}
        {it("redo", "redo-2", t("Qayta bajarish", "Повторить"), !canRedo, "Ctrl+Y")}
      </div>
      <div style={{ height: 10 }} />
      <div className={c("list menu")}>
        {it("new", "file-plus", t("Yangi chizma", "Новый чертёж"))}
        {it("save", "save", t("Saqlash", "Сохранить"), false, "Ctrl+S")}
        {it("proj", "folder-open", t("Loyihalarim", "Мои проекты"))}
      </div>
      <div style={{ height: 10 }} />
      <div className={c("list menu")}>
        {it("lang", "languages", t("Til: O'zbekcha", "Язык: Русский"), false, t("Русский язык", "O'zbek tili"))}
        {inTg ? null : it("logout", "log-out", t("Chiqish", "Выйти"))}
      </div>
    </>
  );
}
