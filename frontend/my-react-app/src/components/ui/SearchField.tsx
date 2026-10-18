import type { InputHTMLAttributes } from "react";
import Icon from "./Icon";

/** 全局搜索与表格筛选共享；保留原生 search 的清空与键盘行为。 */
export default function SearchField({
  label,
  className = "",
  ...props
}: { label: string } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "aria-label"
>) {
  return (
    <label className={`search-field ${className}`}>
      <Icon name="search" />
      <input type="search" {...props} aria-label={label} />
    </label>
  );
}
