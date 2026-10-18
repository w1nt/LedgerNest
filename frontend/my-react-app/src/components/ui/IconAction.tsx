import { useEffect, useId, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { NavLinkProps } from "react-router-dom";
import Icon from "./Icon";
import type { IconName } from "./Icon";

/** 图标操作统一提供可读名称与提示；鼠标离开后不因残留焦点继续显示。 */
function Tooltip({
  label,
  side = "bottom",
  children,
}: {
  label: string;
  side?: "bottom" | "right" | "top";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointerMove = (event: PointerEvent) => {
      // Tab 提示显示时，鼠标原本可能就不在按钮上；开始移到别处也应关闭。
      if (event.target instanceof Node && !root.current?.contains(event.target))
        close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("blur", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  return (
    <span
      ref={root}
      className="action-tooltip"
      data-side={side}
      data-open={open}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setOpen(true);
      }}
      onPointerLeave={() => setOpen(false)}
      onPointerDownCapture={() => setOpen(false)}
      onClickCapture={() => setOpen(false)}
      onBlur={() => setOpen(false)}
      onKeyUp={(event) => {
        // 只由实际 Tab 导航打开键盘提示。showModal 自动聚焦、关闭后的
        // focus() 恢复及鼠标点击保留的焦点，都不应自动弹出小字。
        if (
          event.key === "Tab" &&
          event.target instanceof HTMLElement &&
          event.target.matches(":focus-visible")
        )
          setOpen(true);
      }}
    >
      {children}
      <span id={id} className="action-tooltip-label" role="tooltip">
        {label}
      </span>
    </span>
  );
}
type Action = {
  icon: IconName;
  label: string;
  side?: "bottom" | "right" | "top";
  indicator?: boolean;
};
export function IconButton({
  icon,
  label,
  side,
  indicator,
  className = "",
  ...props
}: Action &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label">) {
  return (
    <Tooltip label={label} side={side}>
      <button
        type="button"
        {...props}
        className={`icon-button ${className}`}
        aria-label={label}
      >
        <Icon name={icon} />
        {indicator && <i className="action-indicator" aria-hidden="true" />}
      </button>
    </Tooltip>
  );
}
export function IconLink({
  icon,
  label,
  side,
  indicator,
  className = "",
  ...props
}: Action &
  Omit<NavLinkProps, "children" | "className" | "aria-label"> & {
    className?: string;
  }) {
  return (
    <Tooltip label={label} side={side}>
      <NavLink
        {...props}
        aria-label={label}
        className={({ isActive }) =>
          `icon-button ${className} ${isActive ? "active" : ""}`
        }
      >
        <Icon name={icon} />
        {indicator && <i className="action-indicator" aria-hidden="true" />}
      </NavLink>
    </Tooltip>
  );
}
