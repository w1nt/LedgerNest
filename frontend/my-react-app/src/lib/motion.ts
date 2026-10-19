export function reducedMotion() {
  return (
    document.documentElement.dataset.motion === "reduce" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
export function waitForUnlock(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Canceled", "AbortError"));
    };
    const timer = window.setTimeout(
      () => {
        signal.removeEventListener("abort", cancel);
        resolve();
      },
      reducedMotion() ? 0 : 420,
    );
    signal.addEventListener("abort", cancel, { once: true });
  });
}
