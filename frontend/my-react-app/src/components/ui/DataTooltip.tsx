import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";

/** 数据浮层留在图表容器中，自动避开左右边缘；不截获鼠标或改变焦点。
 * 显隐由调用方控制，以便所有鼠标离开、Esc 和页面切换都真正卸载提示。
 */
export default function DataTooltip({
  id,
  anchor,
  children,
}: {
  id: string;
  anchor: Element;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const tooltip = ref.current;
    const container = tooltip?.parentElement;
    if (!tooltip || !container) return;
    const root = container.getBoundingClientRect();
    const point = anchor.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(tooltip).fontSize) * 0.75;
    const left = Math.max(
      gap,
      Math.min(
        root.width - box.width - gap,
        point.left - root.left + point.width / 2 - box.width / 2,
      ),
    );
    const above = point.top - root.top - box.height - gap;
    tooltip.style.left = `${left}px`;
    const ideal =
      above >= gap ? above : Math.max(gap, point.top - root.top + gap);
    tooltip.style.top = `${Math.max(gap - root.top, Math.min(ideal, window.innerHeight - root.top - box.height - gap))}px`;
  }, [anchor, children]);
  return (
    <div ref={ref} id={id} className="data-tooltip" role="tooltip">
      {children}
    </div>
  );
}
