/** Local test fixture: uses real APIs so password hashing, ownership and validation stay intact.
 * Run after start-local.ps1: node seed-example.mjs
 * Repeat runs add missing fixture bills only; never reset passwords or delete existing data.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
process.env.TZ = 'America/Los_Angeles';
const base = process.env.EXAMPLE_API_URL || 'http://127.0.0.1:8080';
const email = 'example@example.com';
const password = 'example123';
const marker = '[example-seed:v1]';
let cookie = '';
async function request(method, path, body, allowed = [200]) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(cookie ? { Cookie: cookie } : {}), ...(method === 'POST' && (path === '/bills' || path.endsWith('/settlement/operations')) ? { 'Idempotency-Key': randomUUID() } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) cookie = cookies.map(value => value.split(';')[0]).join('; ');
  const raw = await response.text();
  if (!allowed.includes(response.status)) throw new Error(`${method} ${path}: ${response.status} ${raw}`);
  return raw ? JSON.parse(raw) : null;
}
const now = new Date();
const year = now.getFullYear(), month = now.getMonth(), today = now.getDate();
const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const due = (offset, day) => {
  const last = new Date(year, month + offset + 1, 0).getDate();
  return new Date(year, month + offset, Math.max(1, Math.min(day, last)), 23, 59).toISOString();
};
const fixtures = [];
function add(offset, name, cents, day, settlementStatus, note) {
  const period = monthKey(new Date(year, month + offset, 1));
  fixtures.push({
    input: { amount: (cents / 100).toFixed(2), vendorName: `Example ${name} · ${period}`,
      comment: `${marker} ${note}；用于真实账号账单与图表验证。`, dueAt: due(offset, day) },
    settlementStatus,
  });
}
// Five completed months plus this month give the existing six-month chart meaningful variation.
for (let index = 0; index < 5; index++) {
  const offset = index - 5;
  add(offset, '房租', 110000 + index * 2000, 1, 'completed', '历史固定住房开销');
  add(offset, '网络服务', 5499 + index * 100, 8, 'completed', '历史网络账单');
  add(offset, '电费', 6825 + index * 450, 15, index === 4 ? 'unpaid' : 'completed', '历史用电金额变化');
  add(offset, '流媒体订阅', 1499 + index * 10, 22, 'completed', '历史订阅账单');
}
add(0, '房租', 120000, 1, 'completed', '本月住房开销');
add(0, '网络服务', 5999, 3, 'completed', '本月固定网络服务');
add(0, 'Netflix', 1549, 5, 'completed', '本月订阅');
add(0, '健身会员', 3999, today + 4, 'unpaid', '本月未来到期账单');
add(0, '电费', 8640, today - 2, 'unpaid', '未支付且已到期，用于验证派生逾期标签');
add(0, '水费', 3250, today - 1, 'unpaid', '已到期的未支付账单');
add(0, '超市采购', 12675, 4, 'completed', '非固定日常开销');
add(0, '手机套餐', 4500, today + 7, 'unpaid', '未来待处理账单');
add(0, '保险', 9990, today + 12, 'unpaid', '未来保险账单');
add(0, '交通', 2860, today + 1, 'unpaid', '近期到期提醒');
add(1, '房租', 120000, 1, 'unpaid', '下月预设账单');
add(1, '网络服务', 5999, 8, 'unpaid', '下月预设账单');

const registration = await request('POST', '/register', {
  username: 'example', email, password, confirm: password, address: '123 Example Street, Example City',
}, [201, 409]);
const user = await request('POST', '/login', { email, password });
assert.equal(user.email, email);
assert.equal(user.username, 'example');
assert.equal((await request('GET', '/me')).id, user.id);
let created = 0, skipped = 0;
try {
  const existing = await request('GET', '/bills');
  for (const fixture of fixtures) {
    const matches = existing.filter(row => row.vendorName === fixture.input.vendorName && row.comment.includes(marker));
    if (matches.length) { skipped++; continue; }
    const saved = await request('POST', '/bills', fixture.input, [201]);
    if (fixture.settlementStatus === 'completed') {
      await request('POST', '/bills/'+saved.id+'/settlement/operations', {
        type:'record_payment', version:saved.settlementVersion, reason:'Example fixture manual payment',
        source:'manual', provider:'example-seed', reference:'example-paid-'+saved.id,
        amount:fixture.input.amount, state:'succeeded',
      });
    }
    created++;
  }
  const bills = await request('GET', '/bills');
  assert.equal(new Set(bills.map(row => row.id)).size, bills.length);
  for (const fixture of fixtures)
    assert.ok(bills.some(row => row.vendorName === fixture.input.vendorName && row.comment.includes(marker)));
  const timezone = 'America/Los_Angeles';
  const period = monthKey(now);
  const summary = await request('GET', `/bills/summary?month=${period}&timezone=${encodeURIComponent(timezone)}`);
  const trend = await request('GET', `/bills/trend?endMonth=${period}&months=6&timezone=${encodeURIComponent(timezone)}`);
  console.log(JSON.stringify({ user, created, skipped, billCount: bills.length, fixtureCount: fixtures.length, month: period, summary, trend }, null, 2));
} finally {
  await request('POST', '/logout', undefined, [204]);
}
