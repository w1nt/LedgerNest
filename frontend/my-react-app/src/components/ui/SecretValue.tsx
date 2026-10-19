import { useI18n } from "../../i18n/LanguageContext";
/** Only the already-masked summary reaches this component; there is no reveal/copy action. */
export default function SecretValue({ value }: { value: string | null }) {
  const { t } = useI18n();
  return (
    <span
      className="secret-value"
      data-testid="masked-credential"
      draggable={false}
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={t(value ? "config.masked" : "config.notSet")}
    >
      {value || t("config.notSet")}
    </span>
  );
}
