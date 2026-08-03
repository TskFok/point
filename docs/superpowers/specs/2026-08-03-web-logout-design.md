# Web 端用户退出设计

**日期：** 2026-08-03  
**状态：** 已确认  

## 目标

补齐 Web 端缺少的用户退出能力：学员与管理员均可在桌面左侧栏底部注销当前会话并回到登录页。

## 非目标

- 不新增后端接口（已有 `POST /api/v1/auth/logout`）。
- 不改变 Cookie / CSRF 协议，不新增 Server Action 或专用 Route Handler。
- 不为窄屏单独增加退出入口（管理员移动抽屉、学员底栏 / 个人中心均不放）。
- 不增加退出二次确认弹窗。
- 不新增 Playwright 端到端用例（API 层已有 logout e2e；Web 以组件单元测试覆盖）。

## 现状

- 后端 `POST /api/v1/auth/logout`：Cookie 模式注销 refresh、清除 `pq_access` / `pq_refresh` / `pq_csrf`；需 CSRF。
- `@point-quest/api-client` 与 `browserApiClient.logout()` 已支持 Cookie + CSRF。
- `AdminShell` / `StudentShell` 均无退出 UI。

## 方案

采用共用客户端组件 + 两侧栏挂载。

### 1. 布局与入口

- 新增 `apps/web/components/layout/logout-button.tsx`（客户端组件）。
- **学员 `StudentShell`**：左侧栏底部，放在现有 `sidebar-tip` **下方**；tip 继续用 `margin-top: auto` 顶开，退出贴底。
- **管理员 `AdminShell`**：桌面左侧栏底部；**不**加入移动抽屉。
- 样式：与侧栏导航风格一致的次要按钮（图标 +「退出」），视觉略弱于主导航链接。
- 窄屏：无额外入口。

### 2. 交互与错误处理

- 点击 → `browserApiClient.logout()`（空 body，`authMode: refresh-cookie`）。
- 成功 → `router.replace("/login")`，避免返回键回到受保护页。
- 进行中 → 按钮 `disabled`，文案「退出中…」，防重复提交。
- 失败 → 留在当前页，展示简短错误（`aria-live`）；不强制跳转。
- 组件可通过 props 注入 `api`（至少含 `logout`）与 `onRedirect`（或 mock `useRouter`），便于单测。

### 3. 样式

- 在 `globals.css` 增加侧栏退出按钮样式（如 `.sidebar-logout`），置于侧栏底部，不破坏现有 tip / 导航布局。
- 管理员侧栏无 tip 时，退出按钮自身使用 `margin-top: auto` 贴底。

## 测试

- **`tests/logout-button.test.tsx`**
  - 成功：调用 `logout()` 后 `replace("/login")`
  - 进行中：按钮禁用且文案为「退出中…」
  - 失败：不跳转，展示错误信息
- **扩展 `tests/navigation.test.tsx`**
  - 学员 / 管理员桌面侧栏可见「退出」
  - 管理员打开移动抽屉后**没有**退出入口

## 成功标准

1. 桌面端学员、管理员左侧栏底部均可退出并进入 `/login`。
2. 退出成功后会话 Cookie 由后端清除，再次访问受保护路径需重新登录。
3. 失败时用户可见错误且会话不被错误地假定已清除。
4. 相关单元测试通过。
