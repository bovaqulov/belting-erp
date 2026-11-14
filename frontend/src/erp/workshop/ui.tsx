// Sex ilovasi karkasi (faqat ko'rinish): ERP Shell (sarlavha, "Orqaga", keng ekran) ichida joriy ekran.
import type { ReactNode } from "react";

import { Shell, type Nav } from "@/erp/kit/ui";

export const WorkshopLayout = ({ title, nav, children }: { title: string; nav: Nav<unknown>; children: ReactNode }) => (
  <Shell title={title} nav={nav} wide full>
    {children}
  </Shell>
);
