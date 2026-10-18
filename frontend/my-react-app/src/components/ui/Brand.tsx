import { useI18n } from "../../i18n/LanguageContext";
import { Link } from "react-router-dom";
export default function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <Link
      className={`brand ${compact ? "brand-compact" : ""}`}
      to="/"
      aria-label={t("brand.home")}
    >
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className={compact ? "sr-only" : undefined}>
        LedgerNest<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
