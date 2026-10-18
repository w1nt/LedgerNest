# LedgerNest

A local-first personal finance and analytics tool, with user-provided API credentials.

免费开源的个人财务工具：由用户在自己的电脑上运行，目标是通过用户自己的 Plaid 凭据同步授权账户流水，在本地完成分类、汇总和图表分析，并可选接入用户自己的 AI API。

## 当前状态

**`0.1.0-SNAPSHOT` 是从已有账单应用分离出的迁移基线，尚不是已完成的 Plaid 本地成品。** 当前代码可以作为本地 React + Spring Boot + MySQL 原型运行；尚未实现 Plaid Link、银行流水同步、嵌入式数据库或 AI agent。下面的计划不代表这些功能已经完成。

| 功能 | 状态 |
| --- | --- |
| 账单列表、搜索筛选、创建、概览和趋势图 | 已有原型 |
| 中英文、主题、共享下拉和金额浮层 | 已有原型 |
| 本地后端、MySQL、账号会话和基础安全边界 | 已有原型，需迁移为本地工具使用流程 |
| 用户自备 Plaid 凭据、Link 银行授权 | 待实现 |
| 银行流水历史导入、增量同步和对账 | 待实现 |
| 嵌入式本地存储、首次启动配置和便捷启动 | 待实现，具体存储方案待选型 |
| 本地个性化规则、预算和提醒 | 待实现 |
| 用户自备 AI API、可选分析助手 | 后续扩展 |

现有应付账单模型与结算代码是原型遗留能力，不能等同于银行流水。原型中的支付网关保持禁用，不执行真实扣款；本项目不提供支付、扣款、代收代付或资金转移功能，也不继续扩展支付网关。

## 产品边界

- 不由项目作者托管用户账户、银行凭据或财务数据库；用户在本地运行应用和保存数据。
- 银行同步仍需联网访问 Plaid 和银行；本地运行不等于完全离线。
- 用户自行注册 Plaid 开发者账户、取得相应访问权限并授权银行账户。项目不内置、共享或代发 API 密钥。
- 初版以 Plaid Trial 的可用能力为目标，兼容性和额度仍以 Plaid 官方规则为准；不是永久免费的承诺。
- 不配置 AI API 也应能使用基础同步与分析。启用第三方 AI 时，应明确告知发送的数据范围；金额计算由本地确定逻辑完成，API 密钥不交给模型。
- 不以投资交易、支付执行或公众在线服务作为交付范围。

## 初版实现顺序

1. 本地配置流程与凭据安全保存，减少安装和启动步骤。
2. Plaid Link 授权、账户与连接持久化，避免重复创建连接。
3. 单独建立银行流水模型，使用 `/transactions/sync` 保存游标，处理分页、新增、修改和删除。
4. 正确关联 pending / posted，处理退款、转账与信用卡还款，避免重复计算收支。
5. 提供流水搜索、分类、标签、收支汇总、趋势图，以及本地数据导出、备份和删除。
6. 在数据闭环稳定后增加本地规则，再扩展可选 AI 查询和分析工具。

历史范围由银行与授权决定。首次最多可以请求 730 天，默认 90 天，不能保证开户以来的全部历史，也不能将未来未产生的水电费等账单当作已有流水。Trial 当前累计最多创建 10 个 Item，删除不恢复额度；令牌和同步游标需要持久化。

同步设计采用启动时、手动和程序运行期间的定时检查，不依赖作者托管的公网 webhook。应用关闭期间不承诺本机任务运行，下次启动补同步；读取 Plaid 的已有更新不等于银行数据即时刷新。

官方参考：[Transactions](https://plaid.com/docs/transactions/)、[Trial 计划](https://support.plaid.com/hc/en-us/articles/39994173227159-What-is-the-Plaid-Trial-plan)。

## 运行当前原型

当前基线仍需 Node.js 22.18+、JDK 17+、本机 MySQL 8.4。MySQL 是现有原型依赖，不代表已完成嵌入式本地数据库迁移。

### 后端

在本机 MySQL 创建空数据库 `ledgernest_dev`，并创建仅供本项目使用的数据库用户。用管理员导入结构后，运行账号仅需该库的 SELECT、INSERT、UPDATE、DELETE 权限。不要指向任何已有真实数据的数据库。

在仓库根目录用 PowerShell 执行以下命令；初始化脚本会交互式提示 MySQL 管理员密码，不读取旧项目的本机凭据：

```powershell
./backend/SpringBoot_demo/init-local-db.ps1 -DatabaseName ledgernest_dev

$env:DB_URL = 'jdbc:mysql://127.0.0.1:3306/ledgernest_dev'
$env:DB_USERNAME = 'ledgernest_app'
$localPassword = Read-Host 'Local database password' -AsSecureString
$env:DB_PASSWORD = [System.Net.NetworkCredential]::new('', $localPassword).Password
$localPassword.Dispose()

./backend/SpringBoot_demo/test-local.ps1
./backend/SpringBoot_demo/start-local.ps1
```

Windows 上如脚本执行策略受限，可使用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File <脚本路径>`。后端默认只监听 `127.0.0.1:8080`。其他系统可设置同名环境变量，在后端目录通过 `./mvnw package` 构建并用 Java 运行 jar。不要将数据库密码写入命令行参数、源码或日志；使用结束后清理当前终端的 `DB_PASSWORD` 环境变量。

### 前端

另开终端执行：

```powershell
cd frontend/my-react-app
npm ci
npm run dev
```

浏览器访问 `http://127.0.0.1:5173`，开发服务器将 `/api` 代理到本地后端。可先注册本地原型账号；开发演示入口使用内置合成数据。若需要 API 测试数据，可在后端运行后执行 `node backend/SpringBoot_demo/seed-example.mjs`；它只创建合成示例，不会连接银行。此流程仍是原型账号流程，尚未实现新的本地首次启动体验。

## 开发与验证

目录结构延续原型，以便逐步迁移：

- `frontend/my-react-app/`：React、TypeScript、Vite。
- `backend/SpringBoot_demo/`：Spring Boot、JDBC、MySQL。
- `scripts/sync-version.mjs`：将根 `VERSION` 同步到前后端。

```powershell
node scripts/sync-version.mjs --check
npm --prefix frontend/my-react-app run build
npm --prefix frontend/my-react-app run lint
npm --prefix frontend/my-react-app run test:security
npm --prefix frontend/my-react-app run test:i18n
npm --prefix frontend/my-react-app run test:trends
# 配置独立本地测试库后：
./backend/SpringBoot_demo/test-local.ps1
```

前端和后端继续分开维护，共用本仓库和根 `VERSION`。后续开发只提交到本项目；这是独立的 Git 历史，不包含私有原型仓库的历史提交。

本地开发日志保留在 `frontend/前端UI开发记录.md` 与 `backend/SpringBoot_demo/后端API开发记录.md`，由 `.gitignore` 排除。公开更新写入对应 README；API 凭据、本地数据库、备份和构建产物不提交。

许可证：[MIT](LICENSE)。
