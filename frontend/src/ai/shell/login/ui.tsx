// Brauzerda kirish (faqat ko'rinish): logo, "Telegram orqali kirish", holat matni yoki bot havolasi.
import s from "@/shared/ui/panel/styles";
import { Icon } from "@/shared/ui/panel/ui";

export type LoginMsg = { kind: "text"; text: string } | { kind: "link"; link: string };

export function LoginScreen({ lmsg, busy, onStart }: { lmsg: LoginMsg; busy: boolean; onStart: () => void }) {
  return (
    <div className={s.login}>
      <span className={s.brand} aria-hidden="true" />
      <h2 className={s.sr}>Belting Agent</h2>
      <p style={{ color: "var(--hint)", margin: "0 0 22px" }}>Boshqaruv paneliga Telegram orqali kiring</p>
      <button className={s.btn} id="tglogin" disabled={busy} onClick={onStart}>
        <Icon name="send" /> {busy ? "Telegram'da tasdiqlash kutilmoqda…" : "Telegram orqali kirish"}
      </button>
      <p style={{ color: "var(--hint)", fontSize: 14, marginTop: 16 }} id="lmsg" role="status">
        {lmsg.kind === "text" ? (
          lmsg.text
        ) : (
          <>
            Telegram&apos;da botni oching va <b>Start</b> bosing.
            <br />
            <a href={lmsg.link} target="_blank" rel="noreferrer" style={{ color: "var(--link)" }}>
              Havola ochilmasa — shu yerni bosing
            </a>
          </>
        )}
      </p>
    </div>
  );
}
