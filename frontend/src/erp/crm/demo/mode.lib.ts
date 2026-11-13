// CRM demo rejimi: ishga tushishdagi ikkala so'rov tekshiriladi (qaror — @/shared/demo).
export { decideMode, decideModeAll, type DemoMode as CrmMode } from "@/shared/demo";

export const PROBE_PATHS = ["/app/api/erp/me", "/app/api/erp/crm/meta"] as const;
