import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  languages,
  matchLanguage,
  languagePreference,
  translate,
  updateLanguage,
  currentLocale,
  currentPreference,
  subscribeLanguage,
  t,
} from "../src/i18n/core.ts";
import { backendMessage } from "../src/i18n/backendMessages.ts";
import { captureError, errorMessage } from "../src/services/errors.ts";
import { ValidationError, email } from "../src/security/validation.ts";
import {
  fullDateLabel,
  monthKey,
  money,
  statusLabels,
} from "../src/lib/billing.ts";

afterEach(() => updateLanguage("system", []));
const slots = (text) =>
  [...text.matchAll(/\{(\w+)\}/gu)].map((match) => match[1]).sort();
test("语言资源具有相同的键和插值变量，防止新增语言遗漏", () => {
  const reference = languages["zh-CN"].messages;
  for (const { messages } of Object.values(languages)) {
    assert.deepEqual(
      Object.keys(messages).sort(),
      Object.keys(reference).sort(),
    );
    for (const key of Object.keys(reference)) {
      for (const message of typeof messages[key] === "string"
        ? [messages[key]]
        : Object.values(messages[key])) {
        assert.ok(message.trim(), key);
        assert.deepEqual(slots(message), slots(reference[key]), key);
      }
    }
  }
});
test("复数与数量格式使用当前语言规则", () => {
  assert.equal(
    translate("en-US", "bills.totalCount", { count: 1 }),
    "1 bill · Total",
  );
  assert.equal(
    translate("en-US", "bills.totalCount", { count: 1234 }),
    "1,234 bills · Total",
  );
  assert.equal(
    translate("zh-CN", "bills.totalCount", { count: 1 }),
    "共 1 笔 · 合计",
  );
});
test("系统首选顺序、语言族和不支持语言回退", () => {
  assert.equal(matchLanguage(["zh-TW", "en-US"]), "zh-CN");
  assert.equal(matchLanguage(["en-GB", "zh-CN"]), "en-US");
  assert.equal(matchLanguage(["fr-FR", "ZH-cn"]), "zh-CN");
  assert.equal(matchLanguage(["fr-FR"]), "en-US");
  assert.equal(matchLanguage([]), "en-US");
});
test("存储偏好仅接受注册语言，篡改值回退系统", () => {
  for (const value of [
    null,
    undefined,
    "",
    "fr-FR",
    "__proto__",
    "constructor",
    "<script>",
  ])
    assert.equal(languagePreference(value), "system");
  assert.equal(languagePreference("en-US"), "en-US");
  assert.equal(languagePreference("zh-CN"), "zh-CN");
});
test("系统变化实时通知，手动选择保持优先；取消订阅有效", () => {
  let count = 0;
  const unsubscribe = subscribeLanguage(() => count++);
  updateLanguage("system", ["zh-CN"]);
  assert.equal(currentLocale(), "zh-CN");
  updateLanguage("en-US", ["zh-CN"]);
  updateLanguage(currentPreference(), ["zh-CN"]);
  assert.equal(currentLocale(), "en-US");
  assert.equal(count, 2);
  unsubscribe();
  updateLanguage("system", ["zh-CN"]);
  assert.equal(count, 2);
});
test("插值按文本保留用户输入，不递归执行替换", () => {
  const name = "<img src=x onerror=alert(1)> {name} $&";
  assert.equal(
    translate("en-US", "table.detailsAria", { name }),
    `View details for ${name}`,
  );
});
test("已存在的校验错误、结算状态和格式随语言改变，机器月份不变", () => {
  updateLanguage("zh-CN");
  let failure;
  try {
    email("invalid");
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof ValidationError);
  assert.equal(failure.localizedMessage(), "请输入有效的邮箱。");
  const month = monthKey(new Date(2026, 9, 15));
  assert.equal(statusLabels.unpaid, "待支付");
  updateLanguage("en-US");
  assert.equal(failure.localizedMessage(), "Enter a valid email address.");
  assert.equal(statusLabels.unpaid, "Unpaid");
  assert.equal(t("nav.settings"), "Settings");
  assert.equal(monthKey(new Date(2026, 9, 15)), month);
  assert.match(fullDateLabel("2026-10-15"), /Oct 15, 2026/u);
  assert.equal(
    money(123456),
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      currencyDisplay: "narrowSymbol",
    }).format(1234.56),
  );
});
test("后端已知错误本地化，未知错误有安全的英文兜底", () => {
  updateLanguage("en-US");
  assert.equal(
    backendMessage("邮箱或密码不正确。", 401),
    "Incorrect email or password.",
  );
  assert.equal(
    backendMessage("邮箱已被注册。", 409),
    "This email address is already registered.",
  );
  assert.equal(
    backendMessage("未知业务消息", 400),
    "The request failed (400). Please try again later.",
  );
  assert.equal(
    backendMessage("__proto__", 400),
    "The request failed (400). Please try again later.",
  );
});
test("用于重新翻译的错误描述不保留请求密码、响应正文或堆栈", () => {
  const secret = "DO_NOT_RETAIN_PASSWORD";
  const axiosError = {
    isAxiosError: true,
    config: { url: "/login", method: "post", data: { password: secret } },
    stack: secret,
    response: {
      status: 401,
      headers: {},
      data: { message: "邮箱或密码不正确。", password: secret },
    },
  };
  const failure = captureError(axiosError);
  assert.ok(!JSON.stringify(failure).includes(secret));
  assert.equal(failure.config, undefined);
  updateLanguage("en-US");
  assert.equal(errorMessage(failure), "Incorrect email or password.");
  updateLanguage("zh-CN");
  assert.equal(errorMessage(failure), "邮箱或密码错误。");
  const retry = captureError({
    ...axiosError,
    response: { status: 429, headers: { "retry-after": "5" } },
  });
  assert.equal(errorMessage(retry), "请求过于频繁，请在 5 秒后重试。");
  updateLanguage("en-US");
  assert.equal(
    errorMessage(retry),
    "Too many requests. Try again in 5 seconds.",
  );
});
