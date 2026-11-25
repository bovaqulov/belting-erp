// Akkauntlar ro'yxati: firma raqamlari va shaxsiy raqamlar; shlyuz/sozlama ogohlantirishlari.
import type { Account, GwStatus } from "@/tgcrm/api";

import Health from "@/tgcrm/health";

import { AccountsView } from "./ui";

export default function AccountsScreen({
  gw,
  accounts,
  onBack,
  onOpen,
  onCreate,
}: {
  gw: GwStatus;
  accounts: Account[];
  onBack?: () => void;
  onOpen: (id: number) => void;
  onCreate: () => void;
}) {
  const company = accounts.filter((a) => a.kind === "company");
  const personal = accounts.filter((a) => a.kind === "personal");
  const hasMine = personal.some((a) => a.owner_tg === gw.me.tg_id);
  return (
    <AccountsView
      gw={gw}
      company={company}
      personal={personal}
      canCreate={gw.me.is_head || !hasMine}
      health={gw.me.is_head ? <Health /> : null}
      onBack={onBack}
      onOpen={onOpen}
      onCreate={onCreate}
    />
  );
}
