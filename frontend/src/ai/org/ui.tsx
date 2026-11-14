// Umumiy org chart: firma → bo'limlar daraxti (dept-tree.ts) → har bo'lim ichida ixtiyoriy qo'shimcha (xodimlar).
// Agentlar va Xodimlar daraxtlari shu komponent bilan chiziladi — tuzilma va ko'rinish bir xil.
import type { ReactNode } from "react";

import s from "@/shared/ui/panel/styles";

import type { DeptTree } from "./dept-tree";

/** gorizontal aylantirishda daraxt markazdan boshlanadi (o'rnatilganda bir marta) */
const centre = (el: HTMLDivElement | null) => {
  if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
};

export interface OrgChartProps<T extends { key: string }> {
  /** eng yuqori tugun (firma) */
  root: ReactNode;
  tree: readonly DeptTree<T>[];
  /** bo'lim kartochkasi */
  renderDept: (d: T) => ReactNode;
  /** bo'lim ichidagi qo'shimcha <li> lar (xodimlar) — quyi bo'limlardan oldin */
  renderInside?: (d: T) => ReactNode[];
}

export default function OrgChart<T extends { key: string }>({ root, tree, renderDept, renderInside }: OrgChartProps<T>) {
  const node = (n: DeptTree<T>): ReactNode => {
    const inner = [...(renderInside?.(n.d) ?? []), ...n.children.map(node)];
    return (
      <li key={n.d.key}>
        {renderDept(n.d)}
        {inner.length > 0 && <ul>{inner}</ul>}
      </li>
    );
  };
  return (
    <div className={s.orgwrap} ref={centre}>
      <div className={s.org}>
        <ul>
          <li>
            {root}
            {tree.length > 0 && <ul>{tree.map(node)}</ul>}
          </li>
        </ul>
      </div>
    </div>
  );
}
