import { useState } from "react";

import type { Chat } from "@/tgcrm/api";
import { ChatAvatar } from "@/tgcrm/kit";

export type AvatarPeer = Pick<Chat, "peer_id" | "title" | "username" | "phone" | "is_self" | "deleted" | "online" | "kind" | "has_photo">;

export function AvatarView({
  c,
  size,
  src,
  watch,
}: {
  c: AvatarPeer;
  size: number;
  src: string | null;
  watch: (el: Element | null) => (() => void) | undefined;
}) {
  const [ok, setOk] = useState<string | null>(null);
  return (
    <span ref={watch} className="relative flex-none" style={{ width: size, height: size }}>
      <ChatAvatar c={c} size={size} />
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- himoyalangan API rasmi (cookie/blob)
        <img
          src={src}
          alt=""
          aria-hidden
          onLoad={() => setOk(src)}
          className={`absolute inset-0 size-full rounded-full object-cover transition-opacity duration-200 ${ok === src ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
      {c.online && c.kind === "user" && ok === src && src ? (
        <span className="absolute right-0 bottom-0 size-3.5 rounded-full border-2 border-sec bg-ok" />
      ) : null}
    </span>
  );
}
