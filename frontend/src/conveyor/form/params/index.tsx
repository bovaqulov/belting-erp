"use client";
// "Tushunilgan parametrlar": asosiy maydonlar (lenta, eni, uzunligi, ulanish …) va "Qo'shimcha" opsiyalar (yo'naltiruvchi,
// profil, gofra, teshik, bukish, asbob) — maydonlar Lenta holatiga bog'langan (../fields). Kompyuterda doim ochiq (bindParams).
import { useEffect } from "react";

import { c } from "@/conveyor/kit";
import { COND, OPTS, optOn, secSummary, type IssueMarks, type OptKey, type OptMeta } from "@/conveyor/lib/logic";
import type { LentaState } from "@/conveyor/lib/types";
import { useLenta } from "@/conveyor/model";
import { FieldMsg, fieldCls, FNum, FPick, FRo, FSeg, FSw, FX, Seg, Sw, Wrap } from "@/conveyor/form/fields";
import { joinPatch, joinVal } from "@/conveyor/lib/logic";

import { OptRowView, ParamsView, QuestionsView } from "./ui";

export { askTitle } from "./ui";

function Essentials({ m }: { m: IssueMarks }) {
  const L = useLenta();
  const t = L.t;
  const joins: [string, string][] = [
    ["lock", t("Qulf", "Замок")],
    ["weld", t("Payvand", "Сварка")],
    ["install", t("O'rnatish", "Монтаж")],
    ["open", t("Ochiq", "Открытая")],
  ];
  return (
    <>
      <FPick k="beltName" label={t("Lenta turi", "Тип ленты")} m={m} />
      <FNum k="width" label={t("Eni", "Ширина")} m={m} />
      <FNum k="length" label={t("Uzunligi", "Длина")} m={m} />
      <Seg seg="join" label={t("Ulanish", "Соединение")} opts={joins} value={joinVal(L.S as LentaState)} onPick={(v) => L.set(joinPatch(v))} />
      <Wrap cond="lockSel">
        <FPick k="lockName" label={t("Qulf turi", "Тип замка")} m={m} />
        <FNum k="lockQty" label={t("Qulf soni", "Кол-во замков")} unit={t("ta", "шт")} m={m} />
      </Wrap>
      <Wrap cond="weld">
        <FSeg
          k="weldType"
          label={t("Payvand turi", "Тип стыка")}
          opts={[
            ["zinali", t("Zinali", "Ступенчатая")],
            ["oddiy", t("Oddiy", "Простая")],
            ["60", "60°"],
          ]}
        />
      </Wrap>
      <Wrap cond="install">
        <FNum k="installPrice" label={t("O'rnatish narxi", "Цена монтажа")} unit={t("so'm", "сум")} m={m} />
      </Wrap>
    </>
  );
}

function OptBody({ k, m }: { k: OptKey; m: IssueMarks }) {
  const L = useLenta();
  const t = L.t;
  const S = L.S as LentaState;
  const pcs = t("ta", "шт");
  const qty = t("Soni", "Кол-во");
  const profile = t("Profil turi", "Тип профиля");
  const inset = t("Chetdan (markazigacha)", "От края (до центра)");
  switch (k) {
    case "guide":
      return (
        <>
          <FPick k="guideName" label={profile} m={m} />
          <FSw k="guideBottomOn" label={t("Ostidan", "Снизу")} m={m} />
          <Wrap cond="gBot">
            <FNum k="guideBottomQty" label={qty} unit={pcs} m={m} />
            <FNum k="guideBottomInset" label={inset} unit="mm" m={m} />
          </Wrap>
          <FSw k="guideTopOn" label={t("Ustidan", "Сверху")} m={m} />
          <Wrap cond="gTop">
            <FNum k="guideTopQty" label={qty} unit={pcs} m={m} />
            <FNum k="guideTopInset" label={inset} unit="mm" m={m} />
          </Wrap>
        </>
      );
    case "cross":
      return (
        <>
          <FPick k="crossName" label={profile} m={m} />
          <FX x="crossPitch" label={t("Oralig'i (qadam)", "Шаг")} unit="mm" />
          <FX x="crossFirst" label={t("Birinchisi boshidan", "Первый от начала")} unit="mm" />
          <FRo id="crossCount" label={qty} value={`${(S.crossPos || []).length} ${pcs}`} />
          <FSw k="crossLenAuto" label={t("Uzunligi — maksimal", "Длина — максимальная")} hint={t("eni bo'yicha avtomatik", "автоматически по ширине")} m={m} />
          <Wrap cond="crossMan">
            <FNum k="crossLen" label={t("Bitta profil uzunligi", "Длина одного профиля")} unit="mm" m={m} />
          </Wrap>
          <FNum k="crossParts" label={t("Bo'laklar (en bo'ylab)", "Частей (по ширине)")} unit={pcs} m={m} />
          <Wrap cond="parts">
            <FNum k="crossGap" label={t("Bo'laklar tirqishi", "Зазор между частями")} unit="mm" m={m} />
          </Wrap>
        </>
      );
    case "gofro":
      return (
        <>
          <FNum k="gofroHeight" label={t("Balandligi", "Высота")} unit="mm" hint={`min ${L.EN?.gofroMinHeight} mm`} m={m} />
          <FSeg
            k="gofroQty"
            label={t("Chetlari", "Стороны")}
            opts={[
              ["2", t("Ikkala chet", "Обе стороны")],
              ["1", t("Bitta chet", "Одна сторона")],
            ]}
          />
          <Wrap cond="gofro1">
            <FSeg
              k="gofroSide"
              label={t("Qaysi chet", "Какая сторона")}
              opts={[
                ["left", t("Chap", "Левая")],
                ["right", t("O'ng", "Правая")],
              ]}
            />
          </Wrap>
          <FNum k="gofroInsetL" label={t("Chap chetdan", "От левого края")} unit="mm" hint="min 10" m={m} />
          <FNum k="gofroInsetR" label={t("O'ng chetdan", "От правого края")} unit="mm" hint="min 10" m={m} />
          <FNum k="crossWallGap" label={t("Gofra ↔ profil zazori", "Зазор борт ↔ профиль")} unit="mm" m={m} />
          <FPick k="gofroName" label={t("Material", "Материал")} m={m} />
        </>
      );
    case "perf":
      return (
        <>
          <FNum k="perfDia" label={t("Teshik diametri", "Диаметр отверстия")} unit="mm" m={m} />
          <FSw k="perfStagger" label={t("Shaxmat tartibida", "В шахматном порядке")} m={m} />
          <FSeg
            k="perfGrid"
            label={t("Joylashuv", "Расположение")}
            opts={[
              ["false", t("Avtomatik", "Авто")],
              ["true", t("Qo'lda (to'r)", "Вручную (сетка)")],
            ]}
          />
          <Wrap cond="perfAuto">
            <FNum k="perfQty" label={t("Teshiklar soni", "Кол-во отверстий")} unit={pcs} m={m} />
            <FNum
              k="perfEdge"
              label={t("Chetdan (ikkala chetdan)", "От края (с обеих сторон)")}
              unit="mm"
              hint={t("chap va o'ng chetdan bir xil · 0 — avtomatik", "одинаково слева и справа · 0 — авто")}
              m={m}
            />
          </Wrap>
          <Wrap cond="perfGrid">
            <FNum k="perfRows" label={t("Qatorlar soni", "Рядов")} unit={pcs} m={m} />
            <FNum k="perfPitchL" label={t("Qatorlar orasi", "Шаг рядов")} unit="mm" m={m} />
            <FNum k="perfStart" label={t("Boshidan", "От начала")} unit="mm" m={m} />
            <FNum k="perfCols" label={t("Ustunlar soni", "Столбцов")} unit={pcs} m={m} />
            <FNum k="perfPitchW" label={t("Ustunlar orasi", "Шаг столбцов")} unit="mm" m={m} />
            <FNum k="perfEdge" label={t("Chetdan (chapdan)", "От края (слева)")} unit="mm" hint={t("o'ng chet chizmada ko'rsatiladi", "правый край — на чертеже")} m={m} />
          </Wrap>
        </>
      );
    case "bend":
      return (
        <>
          <FNum k="bendAngle" label={t("Bukish burchagi", "Угол изгиба")} unit="°" m={m} />
          <Wrap cond="bent">
            <div className={c("sf")} style={{ padding: "8px 16px 0", fontWeight: 600 }}>
              {t("Teshiklar (bukilgan lentada shu yerda)", "Отверстия (для гнутой ленты — здесь)")}
            </div>
            <FNum k="curveHoleCount" label={t("Qatordagi teshiklar", "Отверстий в ряду")} unit={pcs} m={m} />
            <FNum k="curveHoleDia" label="Ø" unit="mm" m={m} />
            <FNum k="curveHoleEdge" label={t("Tashqi chetdan", "От внешнего края")} unit="mm" m={m} />
            <FNum k="curveHoleRows" label={t("Qatorlar", "Рядов")} unit={pcs} m={m} />
          </Wrap>
        </>
      );
    case "tool":
      return (
        <>
          <FPick k="lockToolName" label={t("Asbob", "Инструмент")} m={m} />
          <FNum k="lockToolQty" label={qty} unit={pcs} m={m} />
        </>
      );
  }
}

function OptRow({ o, m }: { o: OptMeta; m: IssueMarks }) {
  const L = useLenta();
  const S = L.S as LentaState;
  const t = L.t;
  const hidden = o.cond ? !COND[o.cond](S) : false;
  const sw = o.flag ? (
    <Sw k={o.flag} label={t(o.title[0], o.title[1])} />
  ) : (
    <input
      type="checkbox"
      role="switch"
      className={c("sw")}
      data-xsw={o.xflag}
      aria-label={t(o.title[0], o.title[1])}
      checked={S.bendAngle > 0}
      onChange={(e) => L.set({ bendAngle: e.currentTarget.checked ? (S.bendAngle > 0 ? S.bendAngle : 90) : 0 })}
    />
  );
  return (
    <OptRowView
      optKey={o.key}
      title={t(o.title[0], o.title[1])}
      summary={secSummary(o.key, S, L.LANG, L.LAST.hints)}
      hidden={hidden}
      on={optOn(S, o)}
      fieldCls={o.flag ? fieldCls(m, o.flag) : undefined}
      dots={m.dots[o.key] || []}
      sw={sw}
      msg={o.flag ? <FieldMsg k={o.flag} /> : null}
      body={<OptBody k={o.key} m={m} />}
    />
  );
}

export function Params({ m }: { m: IssueMarks }) {
  const L = useLenta();
  useEffect(() => L.bindParams(), [L]); // ref callback effektdan oldin ulanadi
  return (
    <ParamsView
      t={L.t}
      paramsRef={L.refFor("params")}
      summary={secSummary("belt", L.S as LentaState, L.LANG, L.LAST.hints)}
      pDot={m.pDot}
      questionsNode={<QuestionsView t={L.t} questions={L.QUESTIONS} />}
      essentials={<Essentials m={m} />}
      opts={OPTS.map((o) => (
        <OptRow key={o.key} o={o} m={m} />
      ))}
    />
  );
}
