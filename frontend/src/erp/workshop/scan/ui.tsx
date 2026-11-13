// Skaner maydoni (faqat ko'rinish): QR stiker kodi (klaviatura-skaner Enter bilan) yoki kamera tugmasi.
import type { RefObject } from "react";

import { Icon, Sf, Sh } from "@/erp/kit/ui";

export function ScanView({
  inpRef: inp,
  hint,
  onCode,
  onCamera,
}: {
  inpRef: RefObject<HTMLInputElement | null>;
  hint: string;
  onCode: (code: string) => void;
  onCamera: () => void;
}) {
  return (
    <>
      <Sh t="Skanerlash" />
      <div className="scanbar">
        <div className="search">
          <Icon n="scan" />
          <input
            ref={inp}
            placeholder="Rukav yoki lenta QR stikeri"
            autoComplete="off"
            enterKeyHint="go"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const v = e.currentTarget.value.trim();
              e.currentTarget.value = "";
              if (v) onCode(v);
            }}
          />
        </div>
        <button
          className="cam"
          aria-label="Kamera bilan skanerlash"
          onClick={onCamera}
        >
          <Icon n="scan" />
        </button>
      </div>
      <Sf>{hint}</Sf>
    </>
  );
}
