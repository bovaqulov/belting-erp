// /app/erp/crm — CRM: bitimlar (kanban/ro'yxat), lidlar, oylik reja. Mantiq: src/erp/crm/.
import CrmApp from "@/erp/crm";
import { ModuleGate } from "@/erp/kit/gate";

export default function CrmPage() {
  return (
    <ModuleGate module="crm">
      <CrmApp />
    </ModuleGate>
  );
}
