// Profil paneli: ma'lumot (bio, username, telefon, a'zolar), chat amallari, tablar — media/fayl/havola/ovoz
// (Telegram'dan, butun tarix bo'yicha, sahifalab) va guruh a'zolari.
import { useCallback, useEffect, useState } from "react";

import { getMembers, searchChat, type Chat, type ChatInfo, type Member, type Msg, type SearchFilter } from "@/tgcrm/api";
import { isGroup } from "@/tgcrm/lib";

import { ProfileView, type Tab } from "./ui";

type Page = { msgs: Msg[]; more: boolean; loading: boolean; err: string };

export default function Profile(p: {
  acc: number;
  chat: Chat;
  info: ChatInfo | null;
  canAct: boolean;
  onClose: () => void;
  onPin: () => void;
  onArchive: () => void;
  onMute: (seconds: number | null) => void;
}) {
  const group = isGroup(p.chat.kind);
  const [tab, setTab] = useState<Tab>("photo");
  const [pages, setPages] = useState<Partial<Record<SearchFilter, Page>>>({});
  const [members, setMembers] = useState<{ rows: Member[]; limited: boolean; err: string } | null>(null);

  const load = useCallback(
    async (f: SearchFilter, offset?: number) => {
      setPages((x) => ({ ...x, [f]: { msgs: x[f]?.msgs ?? [], more: x[f]?.more ?? true, loading: true, err: "" } }));
      try {
        const r = await searchChat(p.acc, p.chat.peer_id, { filter: f, offset_id: offset });
        setPages((x) => ({
          ...x,
          [f]: { msgs: [...(offset ? (x[f]?.msgs ?? []) : []), ...r.messages.slice().reverse()], more: r.has_more, loading: false, err: "" },
        }));
      } catch (e) {
        setPages((x) => ({ ...x, [f]: { msgs: x[f]?.msgs ?? [], more: false, loading: false, err: (e as Error).message } }));
      }
    },
    [p.acc, p.chat.peer_id],
  );

  // tab birinchi ochilganda — yuklash (asinxron; setState so'rov natijasidan keyin)
  useEffect(() => {
    if (tab === "members") {
      if (members) return;
      getMembers(p.acc, p.chat.peer_id).then(
        (r) => setMembers({ rows: r.members, limited: r.limited, err: "" }),
        (e: Error) => setMembers({ rows: [], limited: false, err: e.message }),
      );
      return;
    }
    if (!pages[tab]) {
      void load(tab);
    }
  }, [tab, pages, members, load, p.acc, p.chat.peer_id]);

  const page = tab === "members" ? null : (pages[tab] ?? null);
  const more = () => {
    if (!page || !page.more || page.loading || tab === "members") return;
    const last = page.msgs[page.msgs.length - 1];
    if (last) void load(tab, last.id);
  };

  return (
    <ProfileView
      acc={p.acc}
      chat={p.chat}
      info={p.info}
      group={group}
      canAct={p.canAct}
      tab={tab}
      page={page}
      members={members}
      onTab={setTab}
      onMore={more}
      onClose={p.onClose}
      onPin={p.onPin}
      onArchive={p.onArchive}
      onMute={p.onMute}
    />
  );
}
