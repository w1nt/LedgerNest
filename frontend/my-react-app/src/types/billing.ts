/** 字段名跟随后端 BillResponse / Requests；币种仍统一展示为 USD。 */
export type SettlementStatus = "unpaid" | "awaiting_confirmation" | "completed" | "voided";
export interface Bill {
  id: number;
  // 后端以十进制字符串返回金额，避免 JSON 浮点精度损失。
  amount: string;
  vendorName: string;
  comment: string;
  settlementStatus: SettlementStatus;
  settlementVersion: number;
  confirmedAmount: string;
  processingAmount: string;
  remainingAmount: string;
  overpaidAmount: string;
  createdAt: string;
  dueAt: string;
}
export interface CreateBillRequest {
  amount: string;
  vendorName: string;
  comment: string;
  dueAt: string;
}
export interface User {
  id: number;
  username: string;
  email: string;
  address: string;
}
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  confirm: string;
  address: string;
}
