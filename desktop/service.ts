import { createHash } from "node:crypto";
import type { Bill, BillPage, User } from "../shared/desktop.ts";
import { Store, type Row } from "./database.ts";
import { AppError } from "./errors.ts";
import * as v from "./validation.ts";
import { hashPassword, verifyPassword } from "./passwords.ts";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const safeUser = (r: Row): User => ({
  id: v.integer(r.id),
  username: String(r.username),
  email: String(r.email),
  address: String(r.address),
});
const selectBills = `SELECT b.*,s.stage,s.version,s.confirmedAmountCents,s.pendingAmountCents,s.remainingAmountCents,s.overpaidAmountCents FROM bills b JOIN bill_settlements s ON s.billId=b.id`;
function bill(r: Row): Bill {
  return {
    id: v.integer(r.id),
    amount: v.money(r.amountCents),
    vendorName: String(r.vendorName),
    comment: String(r.comment),
    createdAt: v.timestamp(String(r.createdAt) + "Z") + "Z",
    dueAt: v.timestamp(String(r.dueAt) + "Z") + "Z",
    settlementStatus: r.stage as Bill["settlementStatus"],
    settlementVersion: v.integer(r.version),
    confirmedAmount: v.money(r.confirmedAmountCents),
    processingAmount: v.money(r.pendingAmountCents),
    remainingAmount: v.money(r.remainingAmountCents),
    overpaidAmount: v.money(r.overpaidAmountCents),
  };
}
/** Per-window session; never accepts renderer-provided user IDs. No payment capabilities. */
export class LocalService {
  readonly store: Store;
  private session?: {
    id: number;
    hash: string;
    created: number;
    touched: number;
  };
  private revision = 0;
  private attempts: number[] = [];
  private pendingAuth = false;
  private readonly clock: () => number;
  constructor(store: Store, clock = Date.now) {
    this.store = store;
    this.clock = clock;
  }
  private throttle() {
    const now = this.clock();
    this.attempts = this.attempts.filter((t) => t > now - 60000);
    if (this.attempts.length >= 10 || this.pendingAuth)
      throw new AppError(429, "请求过于频繁，请稍后重试。");
    this.attempts.push(now);
  }
  async register(value: unknown) {
    this.throttle();
    const r = v.object(value, [
      "username",
      "email",
      "password",
      "confirm",
      "address",
    ]);
    const username = v.text(r.username, 100),
      email = v.email(r.email),
      password = v.password(r.password, true),
      address = v.text(r.address, 250, false);
    if (r.confirm !== password)
      throw new AppError(400, "两次输入的密码不一致。");
    this.pendingAuth = true;
    try {
      const hash = await hashPassword(password);
      return this.store.transaction(() => {
        if (this.store.one("SELECT id FROM users WHERE email=?", email))
          throw new AppError(409, "邮箱已被注册。");
        const now = v.now();
        const { lastInsertRowid } = this.store.run(
          "INSERT INTO users(username,email,password,address,createdAt,updatedAt) VALUES(?,?,?,?,?,?)",
          username,
          email,
          hash,
          address,
          now,
          now,
        );
        this.store.run(
          "INSERT INTO user_preferences(userId,theme,updatedAt) VALUES(?,'system',?)",
          lastInsertRowid,
          now,
        );
        return safeUser(
          this.store.one("SELECT * FROM users WHERE id=?", lastInsertRowid)!,
        );
      });
    } finally {
      this.pendingAuth = false;
    }
  }
  async login(value: unknown) {
    this.throttle();
    const r = v.object(value, ["email", "password"]),
      email = v.email(r.email),
      secret = v.password(r.password);
    const attempt = ++this.revision;
    this.session = undefined;
    this.pendingAuth = true;
    try {
      const row = this.store.one("SELECT * FROM users WHERE email=?", email);
      const hash = row ? String(row.password) : undefined;
      const valid = await verifyPassword(secret, hash);
      if (attempt !== this.revision)
        throw new AppError(401, "登录已失效，请重新登录。");
      if (
        !valid ||
        !row ||
        this.store.one("SELECT password FROM users WHERE id=?", row.id)
          ?.password !== hash
      )
        throw new AppError(401, "邮箱或密码不正确。");
      const now = this.clock();
      this.session = {
        id: v.integer(row.id),
        hash: hash!,
        created: now,
        touched: now,
      };
      return safeUser(row);
    } finally {
      this.pendingAuth = false;
    }
  }
  logout() {
    this.revision++;
    this.session = undefined;
    return null;
  }
  currentUser(): User {
    const s = this.session,
      now = this.clock();
    if (!s) throw new AppError(401, "请先登录。");
    const row = this.store.one("SELECT * FROM users WHERE id=?", s.id);
    if (
      now - s.touched > 30 * 60000 ||
      now - s.created > 8 * 3600000 ||
      !row ||
      row.password !== s.hash
    ) {
      this.logout();
      throw new AppError(401, "登录已失效，请重新登录。");
    }
    s.touched = now;
    return safeUser(row);
  }
  billPage(value: unknown): BillPage {
    const user = this.currentUser();
    const r = v.object(value, ["page"]);
    if (
      !Number.isSafeInteger(r.page) ||
      Number(r.page) < 1 ||
      Number(r.page) > 100
    )
      throw new AppError(400, "Invalid page.");
    const page = Number(r.page),
      size = 100;
    return this.store.transaction(() => {
      const total = v.integer(
        this.store.one(
          "SELECT count(*) AS n FROM bills WHERE userId=?",
          user.id,
        )!.n,
      );
      if (total > 10000)
        throw new AppError(
          409,
          "This prototype supports at most 10000 bills per account.",
        );
      const items = this.store
        .all(
          selectBills +
            " WHERE b.userId=? ORDER BY b.dueAt DESC,b.id DESC LIMIT ? OFFSET ?",
          user.id,
          size,
          (page - 1) * size,
        )
        .map(bill);
      if (
        items.length !== Math.min(size, Math.max(0, total - (page - 1) * size))
      )
        throw new Error("Missing settlement");
      return { items, page, size, total, pages: Math.ceil(total / size) };
    });
  }
  createBill(value: unknown): Bill {
    const user = this.currentUser();
    const r = v.object(value, ["bill", "idempotencyKey"]);
    if (
      typeof r.idempotencyKey !== "string" ||
      !/^[A-Za-z0-9_-]{16,128}$/u.test(r.idempotencyKey)
    )
      throw new AppError(400, "Invalid request key.");
    const input = v.object(r.bill, [
      "amount",
      "vendorName",
      "comment",
      "dueAt",
    ]);
    const amount = v.cents(input.amount),
      name = v.text(input.vendorName, 100),
      comment = v.text(input.comment, 500, false),
      due = v.timestamp(input.dueAt);
    const key = digest(r.idempotencyKey),
      hash = digest(JSON.stringify([String(amount), name, comment, due]));
    return this.store.transaction(() => {
      const prior = this.store.one(
        "SELECT * FROM bill_creation_requests WHERE userId=? AND keyHash=?",
        user.id,
        key,
      );
      if (prior) {
        if (prior.requestHash !== hash)
          throw new AppError(
            409,
            "Request key has already been used for different data.",
          );
        const row = this.store.one(
          selectBills + " WHERE b.id=? AND b.userId=?",
          prior.billId,
          user.id,
        );
        if (!row)
          throw new AppError(409, "The original bill no longer exists.");
        return bill(row);
      }
      if (
        Number(
          this.store.one(
            "SELECT count(*) AS n FROM bills WHERE userId=?",
            user.id,
          )!.n,
        ) >= 10000
      )
        throw new AppError(409, "Bill limit reached.");
      const now = v.now();
      const { lastInsertRowid: id } = this.store.run(
        "INSERT INTO bills(userId,amountCents,vendorName,comment,createdAt,updatedAt,dueAt) VALUES(?,?,?,?,?,?,?)",
        user.id,
        amount,
        name,
        comment,
        now,
        now,
        due,
      );
      this.store.run(
        "INSERT INTO bill_settlements(billId,remainingAmountCents) VALUES(?,?)",
        id,
        amount,
      );
      this.store.run(
        "INSERT INTO bill_creation_requests(userId,keyHash,requestHash,billId,createdAt) VALUES(?,?,?,?,?)",
        user.id,
        key,
        hash,
        id,
        now,
      );
      return bill(
        this.store.one(
          selectBills + " WHERE b.id=? AND b.userId=?",
          id,
          user.id,
        )!,
      );
    });
  }
}
