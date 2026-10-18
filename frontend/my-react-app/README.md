# LedgerNest 前端

当前版本为 `0.1.0-SNAPSHOT`，唯一版本来源是根目录 `VERSION`。本目录是从账单原型继承的 React + TypeScript + Vite 界面；当前支持账单概览、搜索筛选、创建、趋势图、中英文和主题。

## 方向变更 — 2026-10-17

最终交付为用户本地运行的免费开源工具，无需作者提供在线服务。后续界面围绕首次配置、用户自备 Plaid 凭据、银行授权、流水同步状态、分类分析和本地数据管理展开；不提供支付入口，不继续规划云端上线。

**Plaid Link、银行流水页面、新的本地初始化流程和 AI 尚未实现。** 当前账号、应付账单和结算展示属于继承的原型，不表示已经同步银行或实现支付。详细边界与计划见[根 README](../../README.md)。

AI 是后续可选功能：由用户提供 API，基础功能独立工作；界面应明确告知将发送给第三方服务的数据范围。

## 桌面运行 — 2026-10-18

从仓库根目录运行，开发环境使用 Node.js 24.17+：

```powershell
npm ci
npm --prefix frontend/my-react-app ci
npm run seed:example
npm start
```

页面和 BrowserRouter 路由保持不变；Electron 从 ledgernest://app 加载构建产物。services/api.ts 在桌面环境调用受限 preload 接口，登录、注册、当前用户、退出、分页账单与新增账单通过 IPC 访问本地 SQLite，不需要 Java、HTTP 或 Vite 服务。图表继续在前端使用整数分汇总。

浏览器 HTTP 适配器仅保留作旧实现回归：先手动启动 Java 后端，再在本目录 npm run dev。当前桌面会话由主进程维护，不使用 Cookie；渲染进程无 Node、SQL、文件路径或任意 IPC 权限。打包分发、首次配置、银行流水及 AI 尚未实现。

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
- 现有本地测试账号与 32 笔预设账单已从旧库保留；邮箱 `example@example.com`，密码 `example123`。通过真实登录使用，不是演示模式。
- 默认数据库为根目录 `data/ledgernest.sqlite`，由 Electron 本机业务层自动初始化；新安装在根目录 npm run seed:example 生成同类合成数据。
- 此迁移不代表已接入 Plaid 或 AI；银行流水仍需后续独立建模。