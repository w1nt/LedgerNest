# LedgerNest 后端（Java 迁移参考）

当前版本为 `0.1.0-SNAPSHOT`，由根目录 `VERSION` 和 `scripts/sync-version.mjs` 管理。目录名与 Java 包名暂沿用原型，以控制迁移范围。

## 系统身份验证 — 2026-10-18

**本机验收限制：** 重建后的未签名 Windows 验证 helper 被系统 Code Integrity 策略阻止，正式可用性检查当前返回 unavailable，不能把替身测试通过视为真实 Windows Hello 已跑通。需要已有可信代码签名证书/允许的签名构建后再人工验证；当前未配置证书。构建支持 LEDGERNEST_WINDOWS_SIGNING_THUMBPRINT，不创建证书、不改系统信任或策略；该可选签名分支尚未实测。详见根 README。

正式桌面入口已使用 Windows Hello / macOS LocalAuthentication 取代账号密码登录。device-auth 封装受限原生 helper，DeviceSession 在验证成功前不创建/打开数据库或解包密钥；取消/失败保持关闭，无密码或测试环境变量降级。锁屏/休眠/切换用户、10 分钟应用无受保护访问或 OS 空闲、8 小时上限触发锁定、关闭句柄与前端通知；验证竞态和迟到结果被拒绝。

桌面 IPC 删除 login/register，新增设备状态、解锁和锁定通知，账单接口保留。原单用户/ID/哈希/32 笔账单直接采用；新空库创建本地档案，多个旧档案拒绝自动选择。seed 工具拒绝向已有其他档案的库增加第二个 example 用户。旧密码方法只留在迁移/fixture/业务回归内部，不再是桌面入口。

存储 CLI 同样先进行系统验证。测试替身只在独立临时测试执行入口构建；生产始终使用原生 helper。Windows 较早原生探测曾通过，最终未签名构建被 Code Integrity 阻止；真实 Hello 验证需先解决可信签名再人工完成，macOS 构建与 LocalAuthentication/Keychain 要在 Mac 验证。用户自选云备份和快速跨设备恢复留待后续设计，当前不开发在线服务或新备份 UI。

## 本地存储加密 — 2026-10-18

桌面持久化已从 node:sqlite 换用 better-sqlite3-multiple-ciphers / SQLite3MultipleCiphers，采用 AES-256 页加密和 SHA-512 HMAC。随机数据库密钥由 Windows CurrentUser DPAPI 或 macOS/Linux safeStorage 保护；Linux basic_text 降级被拒绝。渲染进程不接触密钥，密钥不进入 SQL、环境变量、命令行或日志。

现有明文 v1 库启动时验证、逐表复制并核对后迁移，保留加密恢复副本及原账号/账单；加密库缺失或错误密钥不会自动初始化。WAL 页加密、临时 SQL 数据内存化、私有文件 ACL/权限、进程锁、外键、完整性检查和事务保护已接入。Windows 已实测；macOS/Linux 系统密钥后端尚需平台验证。

根目录新增 storage:encrypt / storage:backup / storage:restore。便携备份使用独立随机密钥、scrypt 和 AES-256-GCM，可在新系统账户恢复并重新绑定 OS 保护；恢复拒绝覆盖已有数据库。操作方式及 512 MiB 备份上限见根 README。当前无备份设置页面，数据库加密不替代 OS 账号和磁盘安全，不保护同一已解锁账号中的恶意软件。

本目录的 JDBC 驱动不能读取桌面加密文件。下方 HTTP 测试或旧导入流程只能使用单独的可丢弃明文库，禁止将 Java 参考程序指向当前桌面数据库。

## Electron 替代进度 — 2026-10-18

日常桌面启动已改为仓库根目录 npm start，不需要本目录的 Java 进程。desktop/ 下的 TypeScript 本机业务层通过受限 IPC 提供系统验证、当前档案、锁定、账单分页及新增；使用 SQLite3MultipleCiphers，兼容当前十表结构、整数分、UTC 时间和 PBKDF2 密码哈希。现有 React 账单、概览和趋势图已接通本地数据。

本目录保留为迁移对照：资料/密码修改、偏好接口、账单编辑/删除、独立汇总/提醒及结算操作尚未移植到桌面接口，不应视为全量迁移完成。不增加支付执行；新业务在 desktop/ 开发。数据库文件沿用根目录 data/ledgernest.sqlite，桌面测试使用隔离文件；不要同时运行两套写入程序。桌面 schema 在 database/schema.sql，测试核对与本目录 schema 一致。

本文件下方的 HTTP 启动、Cookie、Java 分层与支付登记说明仅描述保留的参考实现。桌面启动、测试与安全边界见根 README。测试数据改用根目录 npm run seed:example，不依赖 HTTP 服务。

## 方向变更 — 2026-10-17

项目转为免费开源的本地个人财务工具。后端由用户在自己的电脑上运行，不由作者托管在线账户、数据库或 API 服务；不再以云端上线或支付执行作为目标。

初版目标为用户自备 Plaid 凭据、银行授权、流水同步、本地保存与确定性统计。之后可增加本地规则和用户自备 AI API 的只读分析工具。**已完成 SQLite 本地存储迁移；Plaid、配置向导和 AI 尚未实现。** 具体边界见[根 README](../../README.md)。

## 当前保留的原型

- Spring Boot + JDBC + SQLite，默认监听 `127.0.0.1:8080`。
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

仅需 JDK 17+，不再需要 MySQL 服务、数据库用户或 DB_URL / DB_USERNAME / DB_PASSWORD。默认从项目根目录创建 `data/ledgernest.sqlite`，启动时自动建表；可用 `LEDGERNEST_DB_PATH` 指定其他文件。

```powershell
# 从仓库根目录执行；测试数据库自动隔离：
./backend/SpringBoot_demo/test-local.ps1
./backend/SpringBoot_demo/start-local.ps1
```

`init-local-db.ps1` 仅保留为提示入口，无需手动初始化。其他系统在本目录执行 `./mvnw package` 后，回到根目录运行 `java -jar backend/SpringBoot_demo/target/SpringBoot_demo-0.1.0-SNAPSHOT.jar`。首次构建需要网络下载依赖。

### SQLite 迁移 — 2026-10-17

- 删除 MySQL 运行时驱动与旧 MySQL 专用迁移 SQL，改用嵌入式 SQLite JDBC；原十张业务表暂保留以兼容现有功能，不扩展支付。
- 金额列改为 `amountCents` 等 INTEGER 分值，API 继续返回十进制金额字符串；UTC 时间保存为固定九位小数的文本，避免驱动时区和排序差异。
- 使用 STRICT 表、每个连接启用外键、WAL、10 秒 busy timeout、IMMEDIATE 事务和有限连接池。通过数据库写事务串行化替代 MySQL 的 FOR UPDATE，保留事务回滚、版本检查与幂等行为。
- `test-local.ps1` 在全新的临时 SQLite 文件运行 45 项后端测试并打包，不再连接应用文件或旧 MySQL。另有 4 项 Python 迁移工具测试，覆盖数据保留、拒绝覆盖、失败不留下半成品与金额精度。
- `scripts/migrate-mysql-to-sqlite.py` 提供可重复使用的一次性只读迁移流程：保留账号、密码哈希、编号和历史，校验所有行、外键与数据库完整性；目标已存在时拒绝覆盖。工具仅迁移时需要 Python/MySQL CLI，正常运行不需要它们。
- SQLite 数据文件及 WAL/SHM、日志、缓存由 Git 忽略；文件不是自动加密的，备份时先停止应用或使用 SQLite backup API。后续移动端选型需支持当前 STRICT 表格式（SQLite 3.37+）。

需要合成数据时可运行 `node backend/SpringBoot_demo/seed-example.mjs`。它通过本地 API 创建 `example@example.com` / `example123` 测试账号和预设账单；不是银行数据，也不会重置已有密码。

本地日志继续使用 `backend/SpringBoot_demo/后端API开发记录.md`，由 Git 忽略。后续常规更新提交到 `w1nt/LedgerNest`。
