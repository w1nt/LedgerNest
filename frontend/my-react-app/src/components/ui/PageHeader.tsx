import type { ReactNode } from "react";

/** 页面只显示一级标题与操作；说明按需放在 InfoDialog 中。 */
export default function PageHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <h1>{title}</h1>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
