// Haqiqiy profil rasmi (Telegram) — ekranga yaqinlashganda yuklanadi; bo'lmasa / yuklanmasa — bosh harflar (kit ChatAvatar).
import { peerPhotoUrl } from "@/tgcrm/api";
import { useNear, useSrc } from "@/tgcrm/src-hook";

import { AvatarView, type AvatarPeer } from "./ui";

export default function Avatar({ acc, c, size = 54 }: { acc: number; c: AvatarPeer; size?: number }) {
  const [near, watch] = useNear();
  const { src } = useSrc(near && c.has_photo && !c.is_self ? peerPhotoUrl(acc, c.peer_id) : null);
  return <AvatarView c={c} size={size} src={src} watch={watch} />;
}
