/** Renderer capability contract: no SQL, paths, arbitrary channels or Node handles. */
import type {
  Bill,
  CreateBillRequest,
  RegisterRequest,
  User,
} from "./billing.ts";
export type { Bill, CreateBillRequest, RegisterRequest, User };
export interface BillPage {
  items: Bill[];
  page: number;
  size: number;
  total: number;
  pages: number;
}
export type Reply<T> =
  | { ok: true; value: T }
  | { ok: false; error: { status: number; message: string } };
export interface DesktopBridge {
  login(value: { email: string; password: string }): Promise<Reply<User>>;
  register(value: RegisterRequest): Promise<Reply<User>>;
  currentUser(): Promise<Reply<User>>;
  logout(): Promise<Reply<null>>;
  billPage(value: { page: number }): Promise<Reply<BillPage>>;
  createBill(value: {
    bill: CreateBillRequest;
    idempotencyKey: string;
  }): Promise<Reply<Bill>>;
}
