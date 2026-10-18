import { useState } from "react";
import type { ReactNode } from "react";
import { useI18n } from "../../i18n/LanguageContext";
import Icon from "./Icon";
import type { IconName } from "./Icon";
import Modal from "./Modal";

export default function MetricCard({
  label,
  value,
  icon,
  featured = false,
  children,
}: {
  label: string;
  value: string;
  icon: IconName;
  featured?: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`summary-card metric-card ${featured ? "featured" : ""}`}
        aria-label={t("common.metricDetails", { name: label, amount: value })}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="summary-label">
          <span>{label}</span>
          <Icon name={icon} />
        </span>
        {/* 金额立即准确更新；只对文字出现做动画，不生成虚假的滚动金额。 */}
        <strong>
          <span key={value} className="value-reveal">
            {value}
          </span>
        </strong>
        <Icon name="arrow" className="metric-arrow" />
      </button>
      {open && (
        <Modal title={label} onClose={() => setOpen(false)}>
          <div className="metric-detail">
            <strong>{value}</strong>
            <div className="help-content">{children}</div>
          </div>
        </Modal>
      )}
    </>
  );
}
