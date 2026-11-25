// Akkaunt kartasi: holat, limitlar, ulash oqimi (kerak bo'lsa), amallar (uzish, qayta ulash, o'chirish), jurnal.
import { useEffect, useState } from "react";

import { confirmDo } from "@/shared/telegram/telegram";
import { useBusy } from "@/shared/ui/panel/ui";
import { accountEvents, deleteAccount, logoutAccount, restartAccount, type AccEvent, type Account, type GwStatus } from "@/tgcrm/api";
import { floodLeft, hasSession, needsLogin } from "@/tgcrm/lib";

import Connect from "./connect";
import AiSettingsPart from "./ai";
import Members from "./members";
import { AccountView } from "./ui";

export default function AccountScreen({
  account,
  gw,
  onBack,
  onChanged,
  onDeleted,
}: {
  account: Account;
  gw: GwStatus;
  onBack: () => void;
  onChanged: (a: Account) => void;
  onDeleted: () => void;
}) {
  const [events, setEvents] = useState<AccEvent[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, run] = useBusy();
  const [now, setNow] = useState(() => Date.now());

  // jurnal — holat o'zgarganda qayta
  useEffect(() => {
    let alive = true;
    accountEvents(account.id).then(
      (r) => alive && setEvents(r),
      () => alive && setEvents([]),
    );
    return () => {
      alive = false;
    };
  }, [account.id, account.status]);

  // flood sanog'i
  const wait = floodLeft(account.flood_until, now);
  useEffect(() => {
    if (!account.flood_until) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [account.flood_until]);

  const act = (fn: () => Promise<void>) =>
    void run(async () => {
      setErr("");
      try {
        await fn();
      } catch (e) {
        setErr((e as Error).message);
      }
    });

  const manage = account.can_manage;
  return (
    <AccountView
      account={account}
      gw={gw}
      events={events}
      wait={wait}
      err={err}
      busy={busy}
      canManage={manage}
      connect={manage && needsLogin(account.status) ? <Connect account={account} gatewayOk={gw.gateway && gw.configured} onChanged={onChanged} /> : null}
      members={
        <>
          {hasSession(account.status) ? <AiSettingsPart acc={account.id} /> : null}
          <Members acc={account.id} company={account.kind === "company"} />
        </>
      }
      onBack={onBack}
      onLogout={
        manage && hasSession(account.status)
          ? () =>
              act(async () => {
                if (!(await confirmDo("Akkauntni uzasizmi? Telegram'dagi sessiya yopiladi, qayta ulash uchun kod yoki QR kerak bo'ladi."))) return;
                onChanged(await logoutAccount(account.id));
              })
          : undefined
      }
      onRestart={manage && hasSession(account.status) ? () => act(async () => onChanged(await restartAccount(account.id))) : undefined}
      onDelete={
        manage
          ? () =>
              act(async () => {
                if (!(await confirmDo("Kartani o'chirasizmi? Ulangan bo'lsa, Telegram'dagi sessiya ham yopiladi."))) return;
                await deleteAccount(account.id);
                onDeleted();
              })
          : undefined
      }
    />
  );
}
