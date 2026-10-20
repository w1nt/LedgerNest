# LedgerNest Java 参考实现

**本目录不再是日常运行的后端。** 当前桌面由 Electron 主进程的 TypeScript 业务层和加密 SQLite 提供数据，启动方式为仓库根目录 `npm start`。完整功能、安装和 Google Drive 配置见[根 README](../../README.md)。

## 保留范围

本目录保留 Spring Boot/JDBC 原型，供迁移对照及独立回归：账号/偏好、账单 CRUD、汇总趋势、提醒、结算登记，以及 `controller → service → repository` 分层。部分旧接口未迁移至桌面，不能据此判断桌面已支持对应功能。

付款、退款和争议登记属于旧账单模型。`DisabledPaymentGateway` 拒绝真实支付；项目不增加扣款、收款或转账能力。银行流水将另行建模，不能直接沿用正金额、带到期日期的应付账单表。

**Java JDBC 不能读取当前桌面加密库。** 不要将本目录的参考服务指向桌面数据库，也不要与桌面程序同时写入同一个文件。

## 当前本机业务层

新增功能均在根目录 `desktop/` 和 `shared/` 中实现：

- 系统验证、本地档案、账单分页/新增、空闲及系统锁定。
- SQLite3MultipleCiphers 加密数据库、OS 保护密钥、配置加密和私有文件权限。
- 本地加密备份、登录页/设置页恢复，以及 CSV/JSON 账单导出。
- 可选 Google Drive OAuth、加密快照上传/下载、默认 24 小时的可配置调度。锁定/关闭暂停，解锁补一次；后台工作不延长空闲时间。
- Plaid/AI 凭据本地配置；实际银行授权/流水同步及 AI 请求尚未实现。

数据库结构仍为 `database/schema.sql` 的 v1 十表，金额存整数分，UTC 时间存文本。OS 加密的 API、目录/恢复选择器和云配置保存在数据库旁，不进入便携备份；跨设备需重新配置授权并保管备份口令。

## 开发与回归

从仓库根目录运行当前业务层检查：

```powershell
npm run build
npm test
npm run test:desktop
npm run test:settings
npm run test:data
npm run test:cloud
npm run test:storage
```

Electron 测试使用隔离数据库、隐藏窗口和独立验证替身；Google 传输由模拟响应覆盖。真实系统验证/Google 账号仍需人工验收。macOS 需要真机测试，正式分发还需完成签名与打包。

若专门回归 Java 参考层，需要 JDK 17+，可从根目录运行 `./backend/SpringBoot_demo/test-local.ps1`。该测试脚本创建独立临时 SQLite 数据库；不要对桌面库运行旧服务或旧种子脚本。一次性 MySQL 导入工具位于 `scripts/migrate-mysql-to-sqlite.py`，不是当前运行时依赖。

本地开发日志保留在 `backend/SpringBoot_demo/后端API开发记录.md`，由 Git 忽略。
