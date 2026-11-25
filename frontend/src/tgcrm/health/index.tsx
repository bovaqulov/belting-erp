// Tizim holati (rahbar/admin): tekshiruvlar (shlyuz, Redis, sessiyalar, ffmpeg, kesh) va akkauntlar sog'lig'i. 30 s da yangilanadi.
import { useEffect, useState } from "react";

import { getHealth, type AccHealth, type HealthCheck } from "@/tgcrm/api";

import { HealthView } from "./ui";

export default function Health() {
  const [data, setData] = useState<{ checks: HealthCheck[]; accounts: AccHealth[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    const load = () =>
      getHealth().then(
        (r) => {
          if (!alive) return;
          setData(r);
          setErr("");
        },
        (e: Error) => alive && setErr(e.message),
      );
    void load();
    const t = window.setInterval(() => document.visibilityState === "visible" && void load(), 30_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  return <HealthView data={data} err={err} />;
}
