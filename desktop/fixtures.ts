/** Explicit synthetic fixture utility, never run automatically by the application. */
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "./errors.ts";
import { LocalService } from "./service.ts";
import { Store } from "./database.ts";
import { now as utcNow } from "./validation.ts";
export async function seedExample(store: Store, date = new Date()) {
  const service = new LocalService(store);
  const email = "example@example.com",
    password = "example123",
    marker = "[example-seed:v1]";
  const profiles = store.all("SELECT email FROM users LIMIT 2");
  if (
    profiles.length > 1 ||
    (profiles.length === 1 && profiles[0].email !== email)
  )
    throw new AppError(
      409,
      "Seed only an empty vault or the existing example profile.",
      "PROFILE_REQUIRED",
    );
  if (!profiles.length)
    await service.register({
      username: "example",
      email,
      password,
      confirm: password,
      address: "123 Example Street, Example City",
    });
  const user = await service.login({ email, password }); // Refuse to reset an existing password.
  const year = date.getFullYear(),
    month = date.getMonth(),
    today = date.getDate();
  const items: {
    amount: string;
    vendorName: string;
    comment: string;
    dueAt: string;
    completed: boolean;
  }[] = [];
  function add(
    offset: number,
    name: string,
    cents: number,
    day: number,
    completed: boolean,
    note: string,
  ) {
    const last = new Date(year, month + offset + 1, 0).getDate();
    const due = new Date(
      year,
      month + offset,
      Math.max(1, Math.min(day, last)),
      23,
      59,
    );
    const period = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`;
    items.push({
      amount: (cents / 100).toFixed(2),
      vendorName: `Example ${name} · ${period}`,
      comment: `${marker} ${note}；用于真实账号账单与图表验证。`,
      dueAt: due.toISOString(),
      completed,
    });
  }
  for (let i = 0; i < 5; i++) {
    add(i - 5, "房租", 110000 + i * 2000, 1, true, "历史固定住房开销");
    add(i - 5, "网络服务", 5499 + i * 100, 8, true, "历史网络账单");
    add(i - 5, "电费", 6825 + i * 450, 15, i !== 4, "历史用电金额变化");
    add(i - 5, "流媒体订阅", 1499 + i * 10, 22, true, "历史订阅账单");
  }
  add(0, "房租", 120000, 1, true, "本月住房开销");
  add(0, "网络服务", 5999, 3, true, "本月固定网络服务");
  add(0, "Netflix", 1549, 5, true, "本月订阅");
  add(0, "健身会员", 3999, today + 4, false, "本月未来到期账单");
  add(
    0,
    "电费",
    8640,
    today - 2,
    false,
    "未支付且已到期，用于验证派生逾期标签",
  );
  add(0, "水费", 3250, today - 1, false, "已到期的未支付账单");
  add(0, "超市采购", 12675, 4, true, "非固定日常开销");
  add(0, "手机套餐", 4500, today + 7, false, "未来待处理账单");
  add(0, "保险", 9990, today + 12, false, "未来保险账单");
  add(0, "交通", 2860, today + 1, false, "近期到期提醒");
  add(1, "房租", 120000, 1, false, "下月预设账单");
  add(1, "网络服务", 5999, 8, false, "下月预设账单");
  let created = 0,
    skipped = 0;
  try {
    for (const { completed, ...input } of items) {
      // Name+marker match the legacy fixture. Re-running never modifies an existing row.
      const prior = store.one(
        "SELECT id FROM bills WHERE userId=? AND vendorName=? AND instr(comment,?)>0",
        user.id,
        input.vendorName,
        marker,
      );
      if (prior) {
        skipped++;
        continue;
      }
      const key = createHash("sha256")
        .update(marker + input.vendorName)
        .digest("hex");
      store.transaction(() => {
        const saved = service.createBill({ bill: input, idempotencyKey: key });
        if (completed) {
          const amount = BigInt(input.amount.replace(".", "")),
            now = utcNow();
          store.run(
            "INSERT INTO bill_payments(id,billId,userId,source,provider,reference,state,amountCents,succeededAt,createdAt) VALUES(?,?,?,'manual','example-seed',?,'succeeded',?,?,?)",
            randomUUID(),
            saved.id,
            user.id,
            "example-paid-" + saved.id,
            amount,
            now,
            now,
          );
          store.run(
            "UPDATE bill_settlements SET version=1,stage='completed',confirmedAmountCents=?,remainingAmountCents=0 WHERE billId=?",
            amount,
            saved.id,
          );
          store.run(
            "UPDATE bills SET paidAt=?,updatedAt=? WHERE id=?",
            now,
            now,
            saved.id,
          );
        }
      });
      created++;
    }
    return { created, skipped, billCount: service.billPage({ page: 1 }).total };
  } finally {
    service.logout();
  }
}
