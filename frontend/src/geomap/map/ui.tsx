// Xarita konteyneri (faqat ko'rinish): MapLibre shu elementga o'zi chizadi (React bolalari bo'lmaydi).
import type { RefObject } from "react";

export const MapCanvas = ({ elRef }: { elRef: RefObject<HTMLDivElement | null> }) => <div ref={elRef} className="gm-map" />;
