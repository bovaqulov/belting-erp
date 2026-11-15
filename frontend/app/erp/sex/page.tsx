// /app/erp/sex — kesish sexi ekrani (taxta, zakaz, birga ishlov). Mantiq: src/erp/sex/.
import WorkshopApp from "@/erp/workshop";
import { ModuleGate } from "@/erp/kit/gate";

export default function SexPage() {
  return (
    <ModuleGate module="manufacturing">
      <WorkshopApp />
    </ModuleGate>
  );
}
