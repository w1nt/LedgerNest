import { useI18n } from "../../i18n/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import type { ThemeMode } from "../../context/ThemeContext";
import { IconButton } from "./IconAction";
const options = [
  { value: "light", label: "theme.light", icon: "sun" },
  { value: "dark", label: "theme.dark", icon: "moon" },
  { value: "system", label: "common.system", icon: "monitor" },
] as const;
export default function ThemeControl({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { t } = useI18n();
  const { mode, setMode } = useTheme();
  return (
    <div
      className={`theme-control ${compact ? "compact" : ""}`}
      role="group"
      aria-label={t("theme.aria")}
    >
      {options.map((option) => (
        <IconButton
          key={option.value}
          icon={option.icon}
          label={t(option.label)}
          aria-pressed={mode === option.value}
          className={mode === option.value ? "selected" : ""}
          onClick={() => setMode(option.value as ThemeMode)}
        />
      ))}
    </div>
  );
}
