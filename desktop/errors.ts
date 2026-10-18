import type { Reply } from "../shared/desktop.ts";
export class AppError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export async function reply<T>(
  action: () => T | Promise<T>,
): Promise<Reply<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    if (error instanceof AppError)
      return {
        ok: false,
        error: {
          status: error.status,
          message: error.message,
          ...(error.code ? { code: error.code } : {}),
        },
      };
    // Never serialize database paths, SQL, passwords, stack traces or request payloads.
    return {
      ok: false,
      error: {
        status: 503,
        message: "Local storage is unavailable. Please retry.",
      },
    };
  }
}
