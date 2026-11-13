"use client";
// Smart View: tizim ko'rinishlari + saqlangan (shaxsiy yoki jamoa) ko'rinishlar; joriy filtrni saqlash, o'chirish.
import { useState } from "react";

import { confirm, toast } from "@/erp/kit/env";
import { post } from "@/erp/crm/api";
import { useCrm } from "@/erp/crm/context";
import type { View } from "@/erp/crm/lib";

import { SaveViewView, ViewBarView } from "./ui";

export function ViewBar({
  views,
  vid,
  onApply,
  onReload,
  snapshot,
}: {
  views: View[];
  vid: string | null;
  onApply: (v: View) => void;
  onReload: () => void;
  snapshot: () => Record<string, unknown>;
}) {
  const { me } = useCrm();
  const [saving, setSaving] = useState(false);
  const del = async (v: View) => {
    if (!(await confirm("Ko'rinish o'chirilsinmi?"))) return;
    try {
      await post(`/app/api/erp/crm/views/${v.id}/delete`, {});
      onReload();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <ViewBarView
      views={views}
      vid={vid}
      canDelete={(v) => v.owner_tg === me.tg_id || (v.owner_tg === null && !!me.is_head)}
      onApply={onApply}
      onDelete={(v) => void del(v)}
      onAdd={() => setSaving(true)}
    >
      {saving ? <SaveView onClose={() => setSaving(false)} onSaved={onReload} snapshot={snapshot} /> : null}
    </ViewBarView>
  );
}

function SaveView({ onClose, onSaved, snapshot }: { onClose: () => void; onSaved: () => void; snapshot: () => Record<string, unknown> }) {
  const { me } = useCrm();
  const [name, setName] = useState("");
  const [team, setTeam] = useState(false);
  return (
    <SaveViewView
      name={name}
      team={team}
      canTeam={!!me.is_head}
      onName={setName}
      onTeam={setTeam}
      onClose={onClose}
      onOk={async () => {
        if (!name.trim()) {
          toast("Nomini yozing", "bad");
          return false;
        }
        await post("/app/api/erp/crm/views", { name: name.trim(), query: snapshot(), team });
        toast("Saqlandi");
        onSaved();
      }}
    />
  );
}
