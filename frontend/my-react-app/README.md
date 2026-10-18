# LedgerNest 前端

当前版本为 `0.1.0-SNAPSHOT`，唯一版本来源是根目录 `VERSION`。本目录是从账单原型继承的 React + TypeScript + Vite 界面；当前支持账单概览、搜索筛选、创建、趋势图、中英文和主题。

## 方向变更 — 2026-10-17

最终交付为用户本地运行的免费开源工具，无需作者提供在线服务。后续界面围绕首次配置、用户自备 Plaid 凭据、银行授权、流水同步状态、分类分析和本地数据管理展开；不提供支付入口，不继续规划云端上线。

**Plaid Link、银行流水页面、新的本地初始化流程和 AI 尚未实现。** 当前账号、应付账单和结算展示属于继承的原型，不表示已经同步银行或实现支付。详细边界与计划见[根 README](../../README.md)。

AI 是后续可选功能：由用户提供 API，基础功能独立工作；界面应明确告知将发送给第三方服务的数据范围。

## 本地运行

需要 Node.js 22.18+；先按根 README 启动本地后端。

```powershell
npm ci
npm run dev
```

默认地址为 `http://127.0.0.1:5173`，`/api` 代理到 `http://127.0.0.1:8080`。不需要创建远程服务器。`npm run preview` 默认使用 4173，后端默认来源列表只允许 5173，真实 API 联调使用开发地址。

```powershell
npm run build
npm run lint
npm run test:security
npm run test:i18n
npm run test:trends
```

## 开发约定

- 界面品牌统一为 LedgerNest；复用 `components/ui/` 中的 Dropdown、DataTooltip、Modal 等组件和 `styles/` 主题令牌。
- 文案维护于 `src/i18n/locales/zh-CN.ts` 与 `en-US.ts`，金额与日期按语言格式化；不翻译原始流水内容。
- 当前 `lib/trends.ts` 使用整数分汇总应付账单；银行交易应另建模型，并明确转账、退款与信用卡还款的统计口径。
- 先前的安全边界仍保留：纯文本渲染、受限返回路径、会话、来源校验和 CSP。接入 Plaid Link 时需按官方资源清单调整 CSP，目前策略尚未适配 Link。
- `VITE_` 变量进入浏览器产物，不能保存 Plaid secret、银行 access token 或 AI API key；这些应交由本地后端和安全凭据存储处理。
- 现有 `deploy/security-headers.conf` 是原型的静态托管参考，不是本项目的上线计划，也不是接入 Plaid 后可直接沿用的完整策略。
- 本地日志继续使用 `frontend/前端UI开发记录.md`，由 Git 忽略。后续常规更新提交到 `w1nt/LedgerNest`。

本次仓库分离保留图表金额浮层、月份键盘交互、共享下拉与趋势回归测试；没有增加支付、Plaid 或 AI 功能。
