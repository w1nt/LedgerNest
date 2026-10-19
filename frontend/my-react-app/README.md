# LedgerNest 前端

## 设置与交互动效 — 2026-10-18

设置页重做为外观体验、API 与连接、隐私安全、数据备份四组。语言/主题、舒适或紧凑密度、减少动态效果可实际调整并保留；系统减少动态效果始终优先。自动锁定支持 5/10/15/30 分钟，保存后更新主进程策略，系统锁屏/休眠与 8 小时上限保留。版本展示来自根 VERSION。

新增 Plaid 的环境/Client ID/Secret 配置，以及 DeepSeek、OpenAI、Anthropic、自定义兼容服务的地址/模型/API Key 配置。这里只加密保存，银行授权/同步与 AI 调用尚未接通。凭据只回显前四后四，不回填、不提供明文查看/复制；输入支持粘贴，禁止复制、剪切、拖拽与上下文菜单，关闭/锁定清空输入。可替换、留空保留、确认移除；切换环境/服务地址需新凭据。演示模式 API/安全配置只读。设置页移除支付占位项，资料弹窗不再展示历史邮箱/地址。

配置经受限 IPC 保存在数据库旁 OS 加密的 .settings 文件，接口只返回遮罩，密钥不进入 localStorage/sessionStorage；现有便携备份不包含该配置，更换设备需重填。云备份/应用内恢复仍待后续。正式 Windows 解锁的签名策略阻碍仍然存在，未绕过；测试使用独立替身执行入口。

完善解锁入场、验证脉冲、成功交接和锁定撤销交接；统一按钮、卡片、分段、下拉与弹窗，关闭后异步恢复焦点且不滚动。新增根目录 npm run test:settings 验证加密/遮罩/禁复制/重启/移除/偏好/减少动态效果/锁定清空输入与动画竞态，中英文/浅深色/390px 截图在 .local-tools/ui-check（忽略上传）。

当前版本为 `0.1.0-SNAPSHOT`，唯一版本来源是根目录 `VERSION`。本目录是从账单原型继承的 React + TypeScript + Vite 界面；当前支持账单概览、搜索筛选、创建、趋势图、中英文和主题。

## 方向变更 — 2026-10-17

最终交付为用户本地运行的免费开源工具，无需作者提供在线服务。后续界面围绕首次配置、用户自备 Plaid 凭据、银行授权、流水同步状态、分类分析和本地数据管理展开；不提供支付入口，不继续规划云端上线。

**Plaid Link、银行流水页面、新的本地初始化流程和 AI 尚未实现。** 当前账号、应付账单和结算展示属于继承的原型，不表示已经同步银行或实现支付。详细边界与计划见[根 README](../../README.md)。

AI 是后续可选功能：由用户提供 API，基础功能独立工作；界面应明确告知将发送给第三方服务的数据范围。

## 系统解锁 — 2026-10-18

**本机验收限制：** 重建后的未签名 Windows 验证 helper 被系统 Code Integrity 策略阻止，正式可用性检查当前返回 unavailable，不能把替身测试通过视为真实 Windows Hello 已跑通。需要已有可信代码签名证书/允许的签名构建后再人工验证；当前未配置证书。构建支持 LEDGERNEST_WINDOWS_SIGNING_THUMBPRINT，不创建证书、不改系统信任或策略；该可选签名分支尚未实测。详见根 README。

登录页已重做为本地空间解锁页，不再提供账号密码输入或注册入口。Windows 调用 Windows Hello（系统已配置的 PIN/指纹/人脸），macOS 调用 LocalAuthentication（Touch ID 或 Mac 登录密码）；应用不读取系统密码。界面支持中英文、浅深色主题、紧凑布局、取消/不可用错误及独立内存演示入口。设置与侧栏的退出入口改为“锁定空间”。

数据库在主进程完成系统验证后才打开；取消、拒绝或不可用均保持关闭。锁屏、休眠、切换用户、10 分钟无受保护访问/OS 空闲或 8 小时绝对超时会关闭数据库并通知 React 卸载受保护页面；请求与每 5 秒计时器检查过期。旧单用户档案及原账单保持，新空库在验证后创建本地档案，旧多用户库拒绝自动选择。

现有 example 档案/32 笔数据继续保留，正常桌面操作不再输入 example123。测试执行入口与正式入口分离，没有环境变量跳过正式系统验证的路径。Windows 较早原生探测曾通过，最终未签名构建被 Code Integrity 阻止，当前不可用；自动化使用隔离验证替身覆盖流程，需先解决可信签名再人工确认真实 Windows Hello，macOS 需在 Mac 构建与实测。用户自选云备份/快速跨设备重读仅备案，当前不开发。已有终端便携备份保留，存储命令也先要求系统验证。

## 数据加密 — 2026-10-18

桌面主进程已启用 SQLite 整库页加密、系统密钥保护、WAL 加密及私有文件权限。页面不获取数据库密钥，系统验证结果由主进程处理；历史应用密码与数据库随机密钥相互独立。旧数据自动验证并迁移，测试账号 example@example.com / example123 与 32 笔账单保留。

便携密码备份/恢复目前通过根目录 storage:backup / storage:restore 命令执行，设置页尚无入口；更换电脑或重装系统前应生成便携备份。不能直接用 Java/普通 SQLite 打开当前加密文件。详见根 README。未接入 Plaid/AI。

## 桌面运行 — 2026-10-18

从仓库根目录运行，开发环境使用 Node.js 24.17+：

```powershell
npm ci
npm --prefix frontend/my-react-app ci
npm run seed:example
npm start
```

账单及设置路由保持，根路径进入解锁页，旧 /register 重定向到 /login；Electron 从 ledgernest://app 加载构建产物。services/api.ts 在桌面环境调用受限 preload 接口，设备检查、解锁、当前档案、锁定、分页账单与新增账单通过 IPC 访问本地 SQLite，不需要 Java、HTTP 或 Vite 服务。图表继续在前端使用整数分汇总。

浏览器 npm run dev 可预览解锁界面和内存演示，但系统解锁仅适用于 Electron；共享界面已不再提供旧 HTTP 账号登录。HTTP 适配器/Java 只作直接接口回归参考，需独立可丢弃明文库，不能打开桌面加密库。当前桌面会话由主进程维护，不使用 Cookie；渲染进程无 Node、SQL、文件路径或任意 IPC 权限。打包分发、首次配置、银行流水及 AI 尚未实现。

```powershell
npm run build
npm run lint
npm run test:security
npm run test:i18n
npm run test:trends
# 仓库根目录另有 npm test / npm run test:desktop
```

## 开发约定

- 界面品牌统一为 LedgerNest；复用 `components/ui/` 中的 Dropdown、DataTooltip、Modal 等组件和 `styles/` 主题令牌。
- 文案维护于 `src/i18n/locales/zh-CN.ts` 与 `en-US.ts`，金额与日期按语言格式化；不翻译原始流水内容。
- 当前 `lib/trends.ts` 使用整数分汇总应付账单；银行交易应另建模型，并明确转账、退款与信用卡还款的统计口径。
- 先前的安全边界仍保留：纯文本渲染、受限返回路径、会话、IPC 调用方校验和 CSP。接入 Plaid Link 时需按官方资源清单调整 CSP，目前策略尚未适配 Link。
- `VITE_` 变量进入浏览器产物，不能保存 Plaid secret、银行 access token 或 AI API key；这些应交由本地后端和安全凭据存储处理。
- 现有 `deploy/security-headers.conf` 是原型的静态托管参考，不是本项目的上线计划，也不是接入 Plaid 后可直接沿用的完整策略。
- 本地日志继续使用 `frontend/前端UI开发记录.md`，由 Git 忽略。后续常规更新提交到 `w1nt/LedgerNest`。

本次仓库分离保留图表金额浮层、月份键盘交互、共享下拉与趋势回归测试；没有增加支付、Plaid 或 AI 功能。

## SQLite 联调 — 2026-10-17

- 后端已迁移到本机 SQLite，前端 API、金额字符串及现有账单/图表接口保持兼容，无需配置 MySQL。
- 现有本地测试账号与 32 笔预设账单已从旧库保留；邮箱 `example@example.com`，密码 `example123`。这是保留的历史合成档案；当前通过系统验证打开原数据，不是内存演示模式。
- 默认数据库为根目录 `data/ledgernest.sqlite`，由 Electron 本机业务层自动初始化；新安装在根目录 npm run seed:example 生成同类合成数据。
- 此迁移不代表已接入 Plaid 或 AI；银行流水仍需后续独立建模。