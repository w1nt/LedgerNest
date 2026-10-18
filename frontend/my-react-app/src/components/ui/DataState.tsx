import { useI18n } from "../../i18n/LanguageContext";
import { useBills } from "../../context/BillsContext";
import { IconButton } from "./IconAction";
export default function DataState() {
  const { t } = useI18n();
  const { loading, error, refresh } = useBills();
  if (loading)
    return (
      <div className="data-state" role="status">
        <span className="spinner" />
        {t("bills.loading")}
      </div>
    );
  if (!error) return null;
  return (
    <div className="data-state error" role="alert">
      <div>
        <strong>{t("bills.loadError")}</strong>
        <p>{error}</p>
      </div>
      <IconButton icon="refresh" label={t("common.retry")} onClick={() => void refresh()} />
    </div>
  );
}
