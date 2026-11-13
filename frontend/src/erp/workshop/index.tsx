"use client";
// Sex ekrani (erp_sex.html dan ko'chirilgan): taxta (Yangi → Yig'ilmoqda → Tayyorlanmoqda → Tayyor), bitta zakaz,
// bir nechta zakaz birga (tanlash → birga qabul, bitta rukavdan ulushlab sarf, birga tayyor, stikerlar bitta PDF).
// API: /app/api/erp/shop/* (shopflow.py). Sex kompyuteri/TV uchun taxta — 2–3 m dan o'qiladi. ?job=<id> — zakazni ochish.
import { useEffect, useState } from "react";

import { useNav, type Nav } from "@/erp/kit/ui";
import { Board } from "@/erp/workshop/board";
import { Group } from "@/erp/workshop/group";
import { Job } from "@/erp/workshop/job";
import type { View } from "@/erp/workshop/lib";

import { WorkshopLayout } from "./ui";

import "./workshop.css";

export default function WorkshopApp() {
  const nav = useNav<View>({ k: "board" });
  const [title, setTitle] = useState("Sex");
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("job");
    if (q) nav.go({ k: "job", id: Number(q) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const v = nav.view;
  return (
    <WorkshopLayout title={title} nav={nav as Nav<unknown>}>
      {v.k === "board" ? (
        <Board nav={nav} setTitle={setTitle} />
      ) : v.k === "job" ? (
        <Job key={v.id} id={v.id} setTitle={setTitle} />
      ) : (
        <Group key={v.ids.join(",")} ids={v.ids} nav={nav} setTitle={setTitle} />
      )}
    </WorkshopLayout>
  );
}
