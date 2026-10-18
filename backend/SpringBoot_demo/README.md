# LedgerNest 后端

当前版本为 `0.1.0-SNAPSHOT`，由根目录 `VERSION` 和 `scripts/sync-version.mjs` 管理。目录名与 Java 包名暂沿用原型，以控制迁移范围。

## 方向变更 — 2026-10-17

项目转为免费开源的本地个人财务工具。后端由用户在自己的电脑上运行，不由作者托管在线账户、数据库或 API 服务；不再以云端上线或支付执行作为目标。

初版目标为用户自备 Plaid 凭据、银行授权、流水同步、本地保存与确定性统计。之后可增加本地规则和用户自备 AI API 的只读分析工具。**当前代码尚未实现 Plaid、本地嵌入式数据库、配置向导或 AI。** 具体边界见[根 README](../../README.md)。

## 当前保留的原型

- Spring Boot + JDBC + MySQL，默认监听 `127.0.0.1:8080`。
- `controller/` 负责 HTTP；`service/` 协调业务与事务；`repository/` 集中参数化 SQL 和行映射；`model/` 与 `dto/` 分离。
- 注册、登录、退出、资料、密码和偏好；账单 CRUD、筛选分页、汇总、趋势与提醒。
- `users`、`user_preferences`、`bills`、`bill_creation_requests` 及六张结算相关表，是继承的十表账单模型。
- 会话、来源校验、账号归属、请求上限、密码哈希与幂等边界继续保留。
- 结算阶段仍为 `unpaid` / `awaiting_confirmation` / `completed` / `voided`，属于旧应付账单模型；不直接作为银行流水状态。
- 付款、退款、争议等登记代码仅为原型遗留。`DisabledPaymentGateway` 默认拒绝真实支付，`dispatch` 不能完成扣款；迁移将评估移除这些入口，不增加支付商、验签回调或扣款能力。

## 后续实现原则

1. 银行连接、账户、流水和同步游标单独建模。不能把收入、转账等流水直接写成正金额、有 dueAt 的 bills。
2. 保存连接令牌和同步游标，处理新增、修改、删除、pending/posted 替换及重试，避免重复绑定和重复统计。
3. 本机启动/手动/定时同步，关闭后下次补同步，不依赖作者提供公网 webhook。
4. 首次历史请求最多 730 天，实际可用范围取决于银行和权限；试用额度与数据新鲜度遵循 Plaid 官方规则。
5. 本地数据保护、密钥安全保存、备份、删除及错误日志脱敏仍是必要工作。API 密钥不进入前端产物或模型上下文。
6. 统计用确定的金额逻辑；可选 AI 负责查询理解、解释和建议，明确告知用户外发数据范围，基础功能不依赖 AI。

## 运行与验证

当前仍需本机 MySQL、JDK 17+。按根 README 创建专用空库、导入 `src/main/resources/schema.sql`，并设置 `DB_URL`、`DB_USERNAME`、`DB_PASSWORD`。

```powershell
# 以下命令从仓库根目录运行：
./backend/SpringBoot_demo/init-local-db.ps1 -DatabaseName ledgernest_dev
./backend/SpringBoot_demo/test-local.ps1
./backend/SpringBoot_demo/start-local.ps1
```

初始化仅面向新的独立数据库，不改写旧项目数据库；迁移 SQL 保留作历史参考。运行账号仅需本项目库的 DML 权限。脚本不读取旧目录的 DPAPI 文件，不携带现成数据库账号密码，也不自动复制旧数据。

其他系统可在本目录执行 `./mvnw package`，随后运行 `java -jar target/SpringBoot_demo-0.1.0-SNAPSHOT.jar`。Maven wrapper 负责取得构建工具，首次使用需要网络。

`test-local.ps1` 执行现有 41 项回归测试并打包；测试会在已配置的数据库中创建和清理各自的临时记录，应使用独立开发/测试库。它们验证继承的账单原型，不代表 Plaid、AI 或新本地架构已通过验收。

需要合成数据时可运行 `node backend/SpringBoot_demo/seed-example.mjs`。它通过本地 API 创建 `example@example.com` / `example123` 测试账号和预设账单；不是银行数据，也不会重置已有密码。

本地日志继续使用 `backend/SpringBoot_demo/后端API开发记录.md`，由 Git 忽略。后续常规更新提交到 `w1nt/LedgerNest`。
