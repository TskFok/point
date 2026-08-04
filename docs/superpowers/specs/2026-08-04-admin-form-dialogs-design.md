# Admin 添加/编辑改为弹窗

## 背景

管理端添加与编辑目前有两种形态：

- 商品、AI 模型、AI 任务：列表页内嵌 `admin-editor-panel` 展开表单
- 题目：独立路由页 `/admin/questions/new` 与 `/admin/questions/[questionId]`

目标是统一为**大号居中弹窗**（内容区可滚动），保存成功后关闭并刷新列表，且不把编辑状态同步到 URL。

## 决策摘要

| 项 | 选择 |
|----|------|
| 范围 | 商品、AI 模型、AI 任务、题目（含去掉题目独立编辑路由） |
| URL | 纯前端 state；不使用 `?create` / `?edit` |
| 形态 | 大号居中弹窗 + 可滚动内容区 |
| 实现 | 抽取共享 `FormDialog`，复用现有 `*Form` 组件 |
| 仪表盘「新建题目」 | `sessionStorage` 一次性标记，进入题库列表后自动打开创建弹窗 |
| 未保存离开确认 | 不做（与现网内嵌表单一致） |
| 范围外 | 积分配置页、订单确认弹窗、学生端兑换弹窗；本轮不强制迁移旧确认弹窗到 `FormDialog` |

## 架构

### 共享组件：`FormDialog`

路径：`apps/web/components/ui/form-dialog.tsx`。

行为对齐现有 `OrderStatusDialog` / `RedeemDialog`：

- 由父级条件渲染（`editing ? <FormDialog>…`），不设独立 `open` prop
- portal 到 `document.body`，使用 `.dialog-layer`
- 遮罩 `.dialog-backdrop`：点击关闭（`pending` 时不关闭）
- `role="dialog"`、`aria-modal="true"`、`aria-labelledby` 指向标题
- 右上角关闭按钮、Esc 关闭（`pending` 时不关闭）
- 焦点陷阱；关闭后焦点回到打开前元素（可选 `fallbackFocusRef`）
- `document.body.style.overflow = "hidden"` 期间锁定背景滚动
- 打开时对背景节点设置 `aria-hidden` / `inert`（与现有弹窗一致）

视觉：

- 新样式类 `.form-dialog`：宽度 `min(100%, 48rem)`，`max-height: calc(100vh - 2rem)`，内容区可滚动
- 复用现有 dialog 关闭按钮与浮层阴影 token，避免引入新设计语言

Props：

```ts
type FormDialogProps = {
  title: string;
  description?: string;
  pending?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
};
```

### 各模块接入

| 模块 | 页面 | 状态 | 弹窗内容 |
|------|------|------|----------|
| 商品 | `admin/products/page.tsx` | `editing: Product \| "create" \| null` | `ProductForm` |
| AI 模型 | `admin/ai-models/page.tsx` | 同上（模型类型） | `AiModelForm` |
| AI 任务 | `admin/ai-tasks/page.tsx` | 同上（任务类型） | `AiTaskForm` |
| 题目 | `admin/questions/page.tsx` | `editing: Question \| "create" \| null` 或等价 | 新建直接 `QuestionForm`；编辑先 `getAdminQuestion` 再挂表单 |

各页移除 `admin-editor-panel` 区块；「关闭表单」按钮由弹窗关闭控件替代。

### 题目路由清理

- 删除 `apps/web/app/(admin)/admin/questions/new/page.tsx`
- 删除 `apps/web/app/(admin)/admin/questions/[questionId]/page.tsx`
- 删除仅服务独立编辑页的 `QuestionEditor`；题目编辑的加载/错误态放在题库列表弹窗内的小型包装（如 `QuestionFormDialog`）中处理
- 列表「编辑」由 `Link` 改为 `button`，打开弹窗并拉取详情
- 仪表盘等指向 `/admin/questions/new` 的链接改为：写入 `sessionStorage` 键（如 `admin-questions-open-create=1`）后导航至 `/admin/questions`；题库页 mount 读取后打开创建弹窗并清除该键

## 数据流与交互

1. 用户点击「添加」→ `editing = "create"` → 渲染 `FormDialog` + Form  
2. 用户点击「编辑」→ `editing = row`（题目为 id/行数据，再拉详情）→ 同上  
3. 保存成功 → Form `onSaved` → `editing = null` → 刷新列表  
4. 关闭（X / Esc / 遮罩）→ `editing = null`；`pending` 时忽略关闭  
5. 表单校验/提交错误留在 Form 内，不关闭弹窗  
6. 题目详情加载失败：弹窗内错误 + 重试；可关闭弹窗  

筛选、分页、URL 查询参数（search/page/isActive）保持不变；**不**把 create/edit 写入 URL。

## 错误处理

- 列表加载失败：页面级 `AsyncError`，与弹窗无关  
- 表单提交失败：Form 内展示  
- 题目编辑拉取失败：弹窗内展示，可重试或关闭  
- 关闭失败/网络异常不影响列表已有数据  

## 测试

### 单元测试

- `FormDialog`：可见 `role="dialog"`；Esc/关闭按钮关闭；`pending` 时不关闭；焦点在弹窗内  
- 商品 / AI 模型 / AI 任务页：添加/编辑打开弹窗（非 `admin-editor-panel`）；保存成功后弹窗消失并触发刷新  
- 题目页：添加/编辑走弹窗；编辑请求 `getAdminQuestion`；`sessionStorage` 标记可自动打开创建弹窗  
- 更新依赖独立路由或 `returnTo` 的用例（如 `admin-pages.test.tsx`）  

### E2E

- `playwright/auth-and-questions.spec.ts`：不再 `goto /admin/questions/new`，改为列表页打开创建弹窗完成流程  

## 非目标

- 不改造积分配置页为弹窗  
- 不强制将 `OrderStatusDialog` / `RedeemDialog` 重构为 `FormDialog`  
- 不做未保存确认、不做 URL 深链编辑  

## 验收标准

1. 四个管理模块的添加/编辑均在居中弹窗中完成，列表仍在背景可见（inert）  
2. 题目独立新建/编辑路由移除后，相关入口与测试已切换到列表弹窗流程  
3. 仪表盘「新建题目」经 `sessionStorage` 进入题库并自动打开创建弹窗  
4. 新增/更新的单元测试与相关 E2E 通过