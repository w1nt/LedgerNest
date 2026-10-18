import { useId } from "react";
import type { ReactNode } from "react";
import Icon from "./Icon";
import type { IconName } from "./Icon";

/** 共享卡片容器：标题、图标、操作区与内容区保持一致。 */
export default function Panel({
  title,
  icon,
  actions,
  className = "",
  children,
}: {
  title: string;
  icon?: IconName;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={`panel ${className}`} aria-labelledby={id}>
      <div className="panel-heading">
        <h2 id={id}>
          {icon && <Icon name={icon} />}
          {title}
        </h2>
        {actions && <div className="panel-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
