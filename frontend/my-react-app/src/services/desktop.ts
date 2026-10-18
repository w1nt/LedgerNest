import type { DesktopBridge, Reply } from "../../../../shared/desktop";

declare global {
  interface Window {
    ledgernest?: DesktopBridge;
  }
}
export class DesktopRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function desktopBridge() {
  if (window.location.protocol === "ledgernest:" && !window.ledgernest)
    throw new DesktopRequestError(503, "Desktop communication is unavailable.");
  return window.ledgernest;
}
export async function desktopResult<T>(
  pending: Promise<Reply<T>>,
  signal?: AbortSignal,
): Promise<T> {
  const result = await pending;
  signal?.throwIfAborted();
  if (!result.ok)
    throw new DesktopRequestError(
      result.error.status,
      result.error.message,
      result.error.code,
    );
  return result.value;
}
