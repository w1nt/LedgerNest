import { useI18n } from "../i18n/LanguageContext";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { isCancel } from "axios";
import type { Bill, CreateBillRequest } from "../types/billing";
import { createDemoBills } from "../data/demoBills";
import {
  createBill,
  captureError,
  errorMessage,
  getBills,
} from "../services/api";
import { useSession } from "./SessionContext";
import { BillsContext } from "./BillsContext";
import { billRequest } from "../security/validation";
import { creationAttempt } from "../security/creationAttempt";
import type { CreationAttempt } from "../security/creationAttempt";

export default function BillsProvider({ children }: { children: ReactNode }) {
  useI18n(); // 语言改变时重新格式化已有错误；不重新请求账单。
  const { user, isDemo } = useSession();
  const [bills, setBills] = useState<Bill[]>(createDemoBills);
  const [loading, setLoading] = useState(!isDemo);
  const [failure, setError] = useState<unknown>(null);
  const error = failure ? errorMessage(failure) : "";
  const pendingCreation = useRef<CreationAttempt | null>(null);
  const userId = user?.id;
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (isDemo || userId === undefined) return;
      setLoading(true);
      setError("");
      try {
        setBills(await getBills(signal));
      } catch (error) {
        if (!isCancel(error)) {
          setBills([]);
          setError(captureError(error));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [isDemo, userId],
  );
  useEffect(() => {
    const controller = new AbortController();
    if (!isDemo) void refresh(controller.signal);
    return () => controller.abort();
  }, [isDemo, refresh]);
  async function addBill(request: CreateBillRequest) {
    request = billRequest(request);
    if (isDemo) {
      // 演示数据仅留在本次挂载内，不向后端写入，也不与真实账号混用。
      setBills((previous) => [
        ...previous,
        {
          ...request,
          id: Math.max(0, ...previous.map((bill) => bill.id)) + 1,
          settlementStatus: "unpaid",
          settlementVersion: 0,
          confirmedAmount: "0.00",
          processingAmount: "0.00",
          remainingAmount: request.amount,
          overpaidAmount: "0.00",
          createdAt: new Date().toISOString(),
        },
      ]);
    } else {
      pendingCreation.current = creationAttempt(
        request,
        pendingCreation.current,
      );
      await createBill(request, pendingCreation.current.key);
      pendingCreation.current = null;
      await refresh();
    }
  }
  return (
    <BillsContext.Provider
      value={{
        bills: isDemo || !loading ? bills : [],
        loading,
        error,
        refresh,
        addBill,
      }}
    >
      {children}
    </BillsContext.Provider>
  );
}
