import { reducedMotion } from "../../lib/motion";
import { useI18n } from "../../i18n/LanguageContext";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { IconButton } from "./IconAction";

/** 原生 dialog 提供焦点限制与 Escape；卸载前主动恢复触发按钮焦点。 */
export default function Modal({
  title,
  onClose,
  children,
  preventClose = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  preventClose?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const restoreTarget = useRef<HTMLElement | null>(null);
  const restoreContainer = useRef<HTMLElement | null>(null);
  const [closing, setClosing] = useState(false);
  const closeRequested = useRef(false);
  const closeTimer = useRef<number | undefined>(undefined);
  function requestClose() {
    if (preventClose || closeRequested.current) return;
    closeRequested.current = true;
    // 减少动态效果时立即关闭；其余情况保持原生模态/焦点限制直到退场结束。
    if (reducedMotion()) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 160);
  }
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (
      !restoreTarget.current &&
      document.activeElement instanceof HTMLElement
    ) {
      restoreTarget.current = document.activeElement;
      restoreContainer.current = document.activeElement.parentElement;
    }
    const trigger = restoreTarget.current;
    dialog?.showModal();
    return () => {
      window.clearTimeout(closeTimer.current);
      dialog?.close();
      // React 会移除弹窗节点，不能仅依赖浏览器关闭后的自动焦点恢复。
      // Restore after React removes the native dialog, without scrolling the page.
      queueMicrotask(() => {
        if (document.querySelector("dialog[open]")) return;
        const target =
          trigger?.isConnected && !trigger.matches(":disabled")
            ? trigger
            : restoreContainer.current?.isConnected
              ? restoreContainer.current.querySelector<HTMLElement>(
                  'button:not(:disabled),a[href],[tabindex="0"]',
                )
              : null;
        target?.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      data-closing={closing}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      }}
      onClick={(event) => {
        // 通过边界判断遮罩点击，避免点击弹窗内部留白误关闭。
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            requestClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <IconButton
          icon="close"
          label={t("modal.close")}
          disabled={preventClose}
          onClick={requestClose}
        />
      </div>
      {children}
    </dialog>
  );
}
