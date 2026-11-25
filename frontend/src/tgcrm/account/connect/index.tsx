// Ulash oqimi: QR (tavsiya — kod kiritish shart emas) yoki raqam → kod → (2FA parol). Holat gateway'da; bu yerda faqat
// kiritish va QR rasmi. Bosqich akkaunt holatidan olinadi (sahifa yangilansa ham davom etadi).
import { useCallback, useEffect, useRef, useState } from "react";

import { useBusy } from "@/shared/ui/panel/ui";
import { loginStep, type Account, type LoginResult, type Step } from "@/tgcrm/api";
import { fmtPhone, normPhone } from "@/tgcrm/lib";

import { ConnectView, type Stage } from "./ui";

const QR_POLL = 3000;

export default function Connect({ account, gatewayOk, onChanged }: { account: Account; gatewayOk: boolean; onChanged: (a: Account) => void }) {
  const [pick, setPick] = useState<"choose" | "phone">("choose");
  const [phone, setPhone] = useState(account.phone ? fmtPhone(account.phone) : "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [qr, setQr] = useState<LoginResult | null>(null);
  const [busy, run] = useBusy();
  const st = account.status;
  const stage: Stage = st === "code_sent" ? "code" : st === "password" ? "password" : st === "qr" ? "qr" : pick;
  const id = account.id;
  const changed = useRef(onChanged);
  useEffect(() => {
    changed.current = onChanged;
  });

  const step = useCallback(
    async (s: Step, body: Record<string, string> = {}): Promise<LoginResult | null> => {
      setErr("");
      try {
        const r = await loginStep(id, s, body);
        changed.current(r.account);
        return r.result;
      } catch (e) {
        setErr((e as Error).message);
        return null;
      }
    },
    [id],
  );

  // QR: rasm ~30 s da yangilanadi — joriysini so'rab turamiz; holat "qr" dan chiqsa (skanerlandi / muddati tugadi) — to'xtaydi
  useEffect(() => {
    if (st !== "qr") return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await loginStep(id, "qr_state");
        if (alive && r.result.qr) setQr(r.result);
      } catch {
        /* keyingi urinishda */
      }
    };
    void tick();
    const t = window.setInterval(() => void tick(), QR_POLL);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [st, id]);

  const act = (fn: () => Promise<void>) => void run(fn);

  return (
    <ConnectView
      stage={stage}
      status={account}
      gatewayOk={gatewayOk}
      phone={phone}
      code={code}
      password={password}
      qr={st === "qr" ? qr : null}
      err={err}
      busy={busy}
      onPhone={setPhone}
      onCode={setCode}
      onPassword={setPassword}
      onChoose={(m) => {
        setErr("");
        if (m === "phone") return setPick("phone");
        act(async () => {
          const r = await step("qr");
          if (r?.qr) setQr(r);
        });
      }}
      onSendPhone={() =>
        act(async () => {
          const p = normPhone(phone);
          if (p.length < 8) return setErr("Raqamni xalqaro formatda kiriting: +998 90 123 45 67.");
          if (await step("phone", { phone: p })) setCode("");
        })
      }
      onSendCode={() =>
        act(async () => {
          if (!code.trim()) return setErr("Telegram yuborgan kodni kiriting.");
          await step("code", { code });
        })
      }
      onSendPassword={() =>
        act(async () => {
          if (!password) return setErr("2FA parolni kiriting.");
          const r = await step("password", { password });
          if (r) setPassword("");
        })
      }
      onCancel={() =>
        act(async () => {
          await step("cancel");
          setPick("choose");
          setQr(null);
          setCode("");
          setPassword("");
        })
      }
    />
  );
}
