import type { CreateBillRequest } from "../types/billing.ts";
import { billRequest, ValidationError } from "./validation.ts";

export interface CreationAttempt {
  payload: string;
  key: string;
}

/** Keep a stable key for an uncertain result; changing the payload starts a new operation. */
export function creationAttempt(
  request: CreateBillRequest,
  previous: CreationAttempt | null,
): CreationAttempt {
  const payload = JSON.stringify(billRequest(request));
  if (previous?.payload === payload) return previous;
  if (typeof globalThis.crypto?.randomUUID !== "function")
    throw new ValidationError("security.secureContext");
  return { payload, key: globalThis.crypto.randomUUID() };
}
