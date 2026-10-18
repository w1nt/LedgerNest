// 首次绘制前应用非敏感的外观偏好；独立文件使生产 CSP 无需允许内联脚本。
try {
  const mode = localStorage.getItem("billing-theme") || "system";
  document.documentElement.dataset.theme =
    mode === "dark" ||
    (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
      ? "dark"
      : "light";
} catch {
  /* 存储不可用时使用默认浅色。 */
}
