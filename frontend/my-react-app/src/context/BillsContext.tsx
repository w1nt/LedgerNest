import { createContext, useContext } from "react";
import type { Bill, CreateBillRequest } from "../types/billing";
export const BillsContext = createContext<{
  bills: Bill[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  addBill: (request: CreateBillRequest) => Promise<void>;
} | null>(null);
export function useBills() {
  const context = useContext(BillsContext);
  if (!context) throw new Error("useBills must be used within BillsProvider");
  return context;
}
