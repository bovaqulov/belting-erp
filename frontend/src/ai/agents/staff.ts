// Agent formalari uchun xodimlar ro'yxati (biriktirish, "kim foydalanadi") — GET /app/api/users, sahifada bir marta.
import { useEffect, useState } from "react";

import { api } from "@/shared/api/client";

import type { AdminUser, UsersResp } from "@/ai/users/users.lib";

let cache: Promise<AdminUser[]> | null = null;

export function loadStaff(): Promise<AdminUser[]> {
  cache ??= api<UsersResp>("/app/api/users")
    .then((r) => r.users.filter((u) => ["owner", "admin", "employee"].includes(u.role)))
    .catch(() => {
      cache = null;
      return [];
    });
  return cache;
}

export function useStaff(): AdminUser[] {
  const [list, setList] = useState<AdminUser[]>([]);
  useEffect(() => {
    let alive = true;
    void loadStaff().then((x) => alive && setList(x));
    return () => {
      alive = false;
    };
  }, []);
  return list;
}

export const staffName = (list: readonly AdminUser[], id: number | null | undefined): string =>
  id ? list.find((u) => u.tg_id === id)?.name || `#${id}` : "—";
