import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amount,
  calendarDate,
  timestamp,
  parseUser,
  parseBills,
  parseBillPage,
  billRequest,
  registerRequest,
  safeReturnPath,
  filters,
  text,
} from "../src/security/validation.ts";
import { cents,sumPaid,sumRemaining,isOverdue } from "../src/lib/billing.ts";
import { apiBase } from "../src/security/apiBase.ts";
import { creationAttempt } from "../src/security/creationAttempt.ts";

test("无点域名的协议相对配置也不得将凭据送到站外", () => {
  for (const destination of ["//evil", "//localhost", "/api//login", "https://example.test/api//login"])
    assert.throws(() => apiBase(destination, "http://localhost:5173", true));
});

test("不确定写入重试复用请求键，变更内容和成功后的新操作使用新键", () => {
  const input = { amount: "12.30", vendorName: "账单", comment: "", dueAt: "2026-10-20T00:00:00Z" };
  const first = creationAttempt(input, null);
  const retry = creationAttempt({ ...input, userId: 999, status: "paid" }, first);
  assert.equal(first.key, retry.key);
  assert.notEqual(creationAttempt({ ...input, amount: "12.31" }, first).key, first.key);
  assert.notEqual(creationAttempt(input, null).key, first.key);
  assert.deepEqual(JSON.parse(first.payload), input);
});

const bill = {
  id: 1,
  amount: "0.10",
  vendorName: "O'Reilly <script>alert(1)</script>",
  comment: "正常备注\n第二行",
  settlementStatus: "unpaid",settlementVersion:0,
  confirmedAmount:"0.00",processingAmount:"0.00",remainingAmount:"0.10",overpaidAmount:"0.00",
  createdAt: "2026-10-13T12:00:00Z",
  dueAt: "2026-10-20T23:59:00-07:00",
};
test("金额边界：拒绝指数、负数、过多小数、无穷大和过长数字", () => {
  for (const value of [
    "0",
    "-1",
    "1e2",
    "0.001",
    "1000000000",
    "9".repeat(1000),
    NaN,
    Infinity,
    { toString: () => "1" },
  ])
    assert.throws(() => amount(value));
  assert.equal(amount("0.10"), "0.10");
  assert.equal(amount("999999999.99"), "999999999.99");
});
test("日期：拒绝日历溢出、无时区时间和 24:00 隐式滚动", () => {
  for (const value of ["2026-02-30", "2025-02-29", "0999-12-31", "9999-01-01"])
    assert.throws(() => calendarDate(value));
  assert.equal(calendarDate("2024-02-29"), "2024-02-29");
  for (const value of [
    "2026-02-30T12:00:00Z",
    "2026-10-13T24:00:00Z",
    "2026-10-13T12:00:00",
  ])
    assert.throws(() => timestamp(value));
});
test("纯文本保留合法引号和 HTML 字符，拒绝 NUL 与方向欺骗字符", () => {
  assert.equal(text("O'Reilly <script>", "名称", 100), "O'Reilly <script>");
  assert.throws(() => text("normal\u0000hidden", "名称", 100));
  assert.throws(() => text("invoice\u202etxt", "名称", 100));
  assert.throws(() => text("invalid\ud800", "名称", 100));
  assert.equal(text("合法😀", "名称", 100), "合法😀");
});
test("账号只提取安全字段；非法 id、对象字段、超长输入不可通过", () => {
  const user = parseUser(
    JSON.parse(
      '{"id":1,"username":"用户","email":"user@example.com","address":"","password":"secret","token":"secret","__proto__":{"admin":true}}',
    ),
  );
  assert.deepEqual(Object.keys(user), ["id", "username", "email", "address"]);
  assert.equal(Object.prototype.admin, undefined);
  assert.throws(() => parseUser({ ...user, id: 1.5 }));
  assert.throws(() => parseUser({ ...user, id: Number.MAX_SAFE_INTEGER + 1 }));
  assert.throws(() => parseUser({ ...user, username: "x".repeat(101) }));
});
test("账单响应：限制条数、字段类型和长度，拒绝重复编号、非法状态", () => {
  assert.equal(parseBills([bill])[0].amount, "0.10");
  for (const value of [
    [bill, bill],
    [{ ...bill, status: "__proto__" }],
    [{ ...bill, settlementStatus: "paid" }],
    [{ ...bill, amount: "0.001" }],
    [{ ...bill, comment: "x".repeat(501) }],
    Array(10001).fill(bill),
  ])
    assert.throws(() => parseBills(value));
});
test("新结算阶段拒绝旧字段和不一致金额，图表累计部分付款且排除作废",()=>{
  const partial={...bill,amount:"100.00",confirmedAmount:"40.00",remainingAmount:"60.00",dueAt:"2020-01-01T00:00:00Z"};
  const waiting={...partial,id:2,settlementStatus:"awaiting_confirmation",processingAmount:"60.00"};
  const voided={...partial,id:3,settlementStatus:"voided",remainingAmount:"0.00",overpaidAmount:"40.00"};
  const rows=parseBills([partial,waiting,voided]);
  assert.equal(sumPaid(rows),8000);assert.equal(sumRemaining(rows),12000);
  assert.equal(isOverdue(rows[1]),true);assert.equal(isOverdue(rows[2]),false);assert.equal(cents("-0.10"),-10);
  for(const bad of [{...partial,status:"unpaid"},{...partial,settlementStatus:"completed"},{...partial,remainingAmount:"100.00"},
     {...partial,settlementStatus:"awaiting_confirmation"},{...partial,settlementVersion:-1}]) assert.throws(()=>parseBills([bad]));
  assert.equal("status" in rows[0],false);
});
test("写入字段白名单：不发送额外 userId、id、role 或支付状态", () => {
  const payload = billRequest({ ...bill, userId: 99, role: "admin" });
  assert.deepEqual(Object.keys(payload), [
    "amount",
    "vendorName",
    "comment",
    "dueAt",
  ]);
  const signup = registerRequest({
    username: "用户",
    email: "u@example.com",
    address: "",
    password: "long-password",
    confirm: "long-password",
    role: "admin",
  });
  assert.equal("role" in signup, false);
});
test("分页读取：条数、页数和总量必须一致，防止无限加载", () => {
  const page = { items: [bill], total: 1, page: 1, size: 100, pages: 1 };
  assert.equal(parseBillPage(page, 1).items.length, 1);
  for (const bad of [
    { ...page, total: 10001 },
    { ...page, pages: 1000000000 },
    { ...page, size: 1000 },
    { ...page, items: [] },
    { ...page, page: 2 },
  ])
    assert.throws(() => parseBillPage(bad, 1));
});
test("返回路径只允许站内固定路径；危险协议、反斜杠和协议相对 URL 不跳转", () => {
  for (const pathname of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "javascript:alert(1)",
    "/home/bills/../../evil",
  ])
    assert.equal(safeReturnPath({ from: { pathname } }), "/home/homepage");
  assert.equal(
    safeReturnPath({
      from: {
        pathname: "/home/bills",
        search: "?q=ok&next=https://evil.test&status=admin&month=2026-99",
      },
    }),
    "/home/bills?q=ok",
  );
  assert.equal(
    filters(new URLSearchParams("q=" + "a".repeat(1000))).query.length,
    600,
  );
});
test("API 地址：拒绝 JS 协议、凭据、查询参数、非本机明文与协议相对地址", () => {
  for (const base of [
    "javascript:alert(1)",
    "//evil.test/api",
    "https://u:p@evil.test/api",
    "https://api.test/api?next=evil",
    "http://api.test/api",
    "/api/../evil",
    "/api\\evil",
  ])
    assert.throws(() => apiBase(base, "https://app.test", false));
  assert.equal(apiBase(undefined, "https://app.test", false), "/api");
  assert.equal(
    apiBase("https://api.test/api", "https://app.test", false),
    "https://api.test/api",
  );
  assert.equal(
    apiBase("http://127.0.0.1:8080/api", "http://127.0.0.1:5173", true),
    "http://127.0.0.1:8080/api",
  );
});
