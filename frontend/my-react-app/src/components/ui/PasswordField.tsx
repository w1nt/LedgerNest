import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { useI18n } from "../../i18n/LanguageContext";
import { IconButton } from "./IconAction";

/** 登录与注册共享的显隐控件；不复制、缓存或持久化密码。 */
export default function PasswordField({
  label,
  ...props
}: { label: string } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "aria-label"
>) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <label>
      {label}
      <span className="password-field">
        <input
          {...props}
          aria-label={label}
          type={visible ? "text" : "password"}
        />
        <IconButton
          icon={visible ? "eye-off" : "eye"}
          label={t(visible ? "auth.hidePassword" : "auth.showPassword")}
          aria-pressed={visible}
          onClick={() => setVisible((previous) => !previous)}
        />
      </span>
    </label>
  );
}
