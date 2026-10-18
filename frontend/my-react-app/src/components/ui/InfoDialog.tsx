import { useState } from "react";
import type { ReactNode } from "react";
import { useI18n } from "../../i18n/LanguageContext";
import { IconButton } from "./IconAction";
import Modal from "./Modal";

/** 说明按需展开：不占据卡片正文，所有页面共用同一交互。 */
export default function InfoDialog({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        icon="help"
        label={t("common.infoFor", { name: title })}
        onClick={() => setOpen(true)}
      />
      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          <div className="help-content">{children}</div>
        </Modal>
      )}
    </>
  );
}
