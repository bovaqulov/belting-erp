"use client";
// Chap panel (eski buildApp #side): zakaz matni (Composer — pastki panelda), izohlar, savollar, "Tushunilgan parametrlar"
// (asosiy + qo'shimcha), mijoz. Maydonlar "boshqarilmaydigan": qiymat S dan har chizishda yoziladi, fokusdagidan tashqari.
import { issueMarks } from "@/conveyor/lib/logic";
import { useLenta } from "@/conveyor/model";

import { CustCard } from "./customer";
import { Params } from "./params";
import { ChatLogView, MobileQuestionsView, ParseMsgsView, SideView } from "./ui";

export { Composer } from "./composer";

export function Side() {
  const L = useLenta();
  const m = issueMarks(L.LAST.issues);
  return (
    <SideView>
      <ChatLogView chat={L.CHAT} />
      <ParseMsgsView t={L.t} notes={L.NOTES} />
      <MobileQuestionsView t={L.t} questions={L.QUESTIONS} mqRef={L.refFor("mq")} onOpenParams={() => L.openParams()} />
      <Params m={m} />
      <CustCard m={m} />
    </SideView>
  );
}
