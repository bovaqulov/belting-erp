// Tizim holati: turlar va sof formatlash (davomiylik, hajm).

export interface LogFile {
  name: string;
  size: number;
  mtime: string;
  age_s: number;
}
export interface Status {
  web: { pid: number; started: string; uptime_s: number };
  worker: { log_age_s: number | null; ok: boolean };
  db: { ok: boolean; engine?: string; schema?: number | null; size_mb?: number; error?: string };
  public: { url: string; ok: boolean; status?: number; error?: string };
  logs: LogFile[];
}

export function dur(sec: number): string {
  if (sec < 90) return `${sec} s`;
  const m = Math.round(sec / 60);
  if (m < 90) return `${m} daq`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} soat ${m % 60} daq`;
  return `${Math.floor(h / 24)} kun ${h % 24} soat`;
}
export const size = (b: number) => (b < 1e3 ? `${b} B` : b < 1e6 ? `${(b / 1e3).toFixed(1)} KB` : `${(b / 1e6).toFixed(1)} MB`);

