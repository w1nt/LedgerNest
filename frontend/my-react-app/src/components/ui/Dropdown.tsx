import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useI18n } from "../../i18n/LanguageContext";
import Icon from "./Icon";

export interface DropdownOption<Value extends string = string> {
  value: Value;
  label: string;
  lang?: string;
  disabled?: boolean;
}

/** 统一的单选下拉：DOM 焦点留在触发按钮，活动项通过 aria-activedescendant 关联。
 * 方向键只预览，Enter/Space/Tab 或点击才确认，Escape/外部点击可取消。
 * 不依赖系统选项窗，因此浅深主题、动画与新增页面都使用同一套样式。
 */
export default function Dropdown<Value extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className = "",
}: {
  label: string;
  value: Value;
  options: readonly DropdownOption<Value>[];
  onChange: (value: Value) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { locale } = useI18n();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.findIndex((option) => option.value === value);
  const enabled = options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);
  const inactive = disabled || enabled.length === 0;
  const expanded = open && !inactive;
  function show(index = selected) {
    if (inactive) return;
    search.current = { text: "", time: 0 };
    setActive(enabled.includes(index) ? index : enabled[0]);
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    setOpen(false);
    if (option && !option.disabled && option.value !== value)
      onChange(option.value);
  }
  useEffect(() => {
    if (!expanded) return;
    const close = () => setOpen(false);
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        close();
    };
    const scroll = (event: Event) => {
      // 选项列表自身滚动时保持展开；页面/父滚动容器移动则收起。
      if (
        !(event.target instanceof Node) ||
        !menu.current?.contains(event.target)
      )
        close();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [expanded]);
  useLayoutEffect(() => {
    if (!expanded || !menu.current || !trigger.current || !root.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(trigger.current).fontSize) * 0.5;
    const below = window.innerHeight - rect.bottom - gap * 2;
    const above = rect.top - gap * 2;
    const top =
      below < Math.min(menu.current.scrollHeight, gap * 32) && above > below;
    root.current.dataset.placement = top ? "top" : "bottom";
    menu.current.style.maxHeight = `${Math.max(0, top ? above : below)}px`;
  }, [expanded, locale, options.length]);
  useLayoutEffect(() => {
    const list = menu.current;
    const item = list?.children[active] as HTMLElement | undefined;
    if (!expanded || !list || !item) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (
      item.offsetTop + item.offsetHeight >
      list.scrollTop + list.clientHeight
    )
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  }, [active, expanded]);
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (inactive || event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === "Tab") {
      if (expanded) choose(active);
      return;
    }
    if (event.altKey && event.key === "ArrowUp" && expanded) {
      event.preventDefault();
      choose(active);
      return;
    }
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (expanded) choose(active);
      else show();
      return;
    }
    if (
      ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(
        event.key,
      )
    ) {
      event.preventDefault();
      let index = expanded
        ? active
        : enabled.includes(selected)
          ? selected
          : enabled[0];
      const offset =
        event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowUp"
            ? -1
            : event.key === "PageDown"
              ? 10
              : -10;
      if (event.key === "Home") index = enabled[0];
      else if (event.key === "End") index = enabled[enabled.length - 1];
      else if (expanded)
        index =
          enabled[
            Math.max(
              0,
              Math.min(enabled.length - 1, enabled.indexOf(index) + offset),
            )
          ];
      show(index);
      return;
    }
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const time = performance.now();
      const character = event.key.toLocaleLowerCase(locale);
      const text =
        time - search.current.time < 700
          ? search.current.text + character
          : character;
      const repeated = [...text].every((letter) => letter === character);
      const query = repeated ? character : text;
      const start = expanded ? active : selected;
      const order = repeated
        ? [
            ...enabled.filter((index) => index > start),
            ...enabled.filter((index) => index <= start),
          ]
        : enabled;
      const match = order.find((index) =>
        options[index].label.toLocaleLowerCase(locale).startsWith(query),
      );
      if (match !== undefined) {
        setActive(match);
        setOpen(true);
      }
      search.current = { text, time };
    }
  }
  return (
    <div
      ref={root}
      className={`dropdown ${className}`}
      data-open={expanded}
      onBlur={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? id : undefined}
        aria-activedescendant={expanded ? `${id}-${active}` : undefined}
        disabled={inactive}
        className="dropdown-trigger"
        onClick={() => (expanded ? setOpen(false) : show())}
        onKeyDown={keyDown}
      >
        <span lang={options[selected]?.lang}>
          {options[selected]?.label ?? value}
        </span>
        <Icon name="chevron" />
      </button>
      {expanded && (
        <ul
          ref={menu}
          id={id}
          role="listbox"
          aria-label={label}
          className="dropdown-menu"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              lang={option.lang}
              data-active={active === index}
              className="dropdown-option"
              onPointerDown={(event) => event.preventDefault()}
              onPointerMove={(event) => {
                if (!option.disabled && event.pointerType !== "touch")
                  setActive(index);
              }}
              onClick={() => {
                if (!option.disabled) {
                  choose(index);
                  trigger.current?.focus();
                }
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Icon name="check" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
