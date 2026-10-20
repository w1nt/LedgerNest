# LedgerNest 前端

React + TypeScript + Vite 界面，正常运行于 Electron。安装、Google 配置和产品边界以[根 README](../../README.md)为准；当前版本 `0.1.0-SNAPSHOT` 由根目录 `VERSION` 管理。

## 当前界面

- 系统解锁页：Windows Hello/macOS LocalAuthentication、错误与取消反馈、独立内存演示、备份恢复入口。桌面不再提供账号密码注册/登录。
- 账单概览、搜索筛选、创建、结算状态及趋势图；当前数据是应付账单，尚未接入银行流水。
- 设置页：外观与体验、API 与连接、隐私与安全、数据与备份。支持中英文、浅深色、密度、减少动态效果和 5/10/15/30 分钟自动锁定。
- Plaid/AI 配置：加密保存，凭据只显示前四/后四遮罩，无明文查看或复制；银行授权和 AI 调用未实现。
- 本地数据工具：选择备份目录、加密备份/恢复、全部分页账单的 CSV/JSON 明文导出。CSV 表头和状态跟随界面语言，JSON 字段稳定；明文导出需确认。
- Google Drive：桌面 OAuth JSON 导入、浏览器授权、同步设置、进度/结果、手动上传、可选自动上传、历史备份列表和加密下载。同步与自动默认关闭，间隔默认 24 小时，可设 1–720 整数小时。

云端只保存独立加密快照，不自动覆盖或合并本机记录。软件关闭、锁定或休眠时暂停，解锁后检查到期任务。自动同步口令需用户明确同意由 OS 加密保存在本机，口令不回读；云端下载使用原口令恢复。真实 Google 账号授权/上传及系统身份验证仍需人工验收，macOS 需真机测试。

## 运行与验证

从仓库根目录执行：

```powershell
npm ci
npm --prefix frontend/my-react-app ci
npm start
```

仅预览浏览器 UI/内存演示：

```powershell
npm --prefix frontend/my-react-app run dev
```

系统解锁、本地文件及云端操作需要 Electron，不依赖 Java、MySQL 或 Vite 开发服务器。

```powershell
npm --prefix frontend/my-react-app run build
npm --prefix frontend/my-react-app run lint
npm --prefix frontend/my-react-app run test:security
npm --prefix frontend/my-react-app run test:i18n
npm --prefix frontend/my-react-app run test:trends
npm run test:desktop
npm run test:settings
npm run test:data
npm run test:cloud
```

Electron 测试使用隐藏窗口、隔离数据/系统验证替身；云测试模拟 Google 响应。测试通过不代表已完成真实系统验证或 Google 账号验收。

## 开发约定

- 复用 `src/components/ui/` 的组件及 `src/styles/` 主题/动效令牌，兼容系统和应用内减少动态效果。
- 中英文文案维护于 `src/i18n/locales/`；金额用整数分计算，不翻译用户原始记录。
- 桌面请求走 `services/api.ts` → preload → 主进程 IPC；页面不持有数据库密钥、原始凭据、任意文件路径写入或任意 IPC 能力。
- 锁定立即清理身份和敏感表单；后台状态轮询不延长解锁时间。模态框保留键盘焦点限制和关闭后的焦点恢复。
- `VITE_` 变量会进入前端产物，不能存放任何 secret。Google 网络和 OAuth 回调由主进程处理，渲染端 CSP 不为此放宽。
- 本地开发日志保持在 `frontend/前端UI开发记录.md`，不提交到 Git。
