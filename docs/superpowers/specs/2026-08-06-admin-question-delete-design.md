# 管理端题目删除

**日期：** 2026-08-06  
**状态：** 已确认  

## 目标

在题库管理界面为符合条件的题目提供删除能力；删除需二次确认，交互与错误处理对齐商品 / AI 模型 / AI 任务等管理模块。服务端强制「已停用且无答题记录」才可硬删除。

## 非目标

- 软删除 / `deletedAt` 字段
- 级联删除或改写 `AnswerAttempt` / 积分流水等历史数据
- 批量删除
- 启用中题目的删除入口（前端隐藏；后端仍校验拒绝）
- 编辑弹窗内的删除入口

## 决策摘要

| 项 | 选择 |
|----|------|
| 删除模型 | 硬删除 Question 行（选项与进度随 Cascade 删除） |
| 可删条件 | `isActive === false` 且无关联 `AnswerAttempt`（`hasAttempts === false`） |
| 前端入口 | 仅已停用且无答题记录的行显示「删除」 |
| 确认 UX | 扩展现有 `useConfirmAction`（`disable` \| `delete`）+ `ConfirmDialog` |
| 失败处理 | 保留弹窗，通过 `error` 展示，允许重试或取消 |
| 参考实现 | `admin/products`、`admin/ai-models`、`admin/ai-tasks` 删除流 |

## 架构

```
Admin Questions Page
  └─ 已停用且无记录行「删除」→ openConfirm({ kind: "delete", target })
       └─ ConfirmDialog 确认
            └─ deleteAdminQuestion(id)
                 └─ DELETE /api/v1/admin/questions/:questionId
                      └─ QuestionsService.remove
                           ├─ 不存在 → 404 QUESTION_NOT_FOUND
                           ├─ 仍启用 → 409 QUESTION_ACTIVE
                           ├─ 有答题记录 → 409 QUESTION_HAS_ATTEMPTS
                           └─ 否则 prisma.question.delete → { success: true }
```

停用继续走现有 `kind: "disable"` 确认流，与删除共用 `mutatingId` 互斥。

## 接口

- `DELETE /api/v1/admin/questions/:questionId`
- 鉴权：`ADMIN`
- OpenAPI `operationId`：`adminDeleteQuestion`
- 成功：`200` + `{ success: true }`（`SuccessResponseDto`）
- api-client 暴露：`deleteAdminQuestion(questionId)`

### 错误码

| 条件 | HTTP | code | 文案 |
|------|------|------|------|
| 题目不存在 | 404 | `QUESTION_NOT_FOUND` | 题目不存在 |
| 仍为启用 | 409 | `QUESTION_ACTIVE` | 请先停用再删除 |
| 存在答题记录 | 409 | `QUESTION_HAS_ATTEMPTS` | 已有答题记录，无法删除 |

答题记录以 `AnswerAttempt.questionId` 计数为准（schema 为 `onDelete: Restrict` 的业务前置校验）。删除成功时 `QuestionOption`、`QuestionProgress` 因 Cascade 一并清理。

现有更新路径上的 `QUESTION_HAS_ATTEMPTS`（文案「已有答题记录的题目只能停用」）保留用于内容变更拒绝；删除路径使用上表文案，可在同一 helper 中按场景区分，或拆出删除专用冲突函数，避免误导文案。

## 前端

文件：`apps/web/app/(admin)/admin/questions/page.tsx`

- `QuestionsApi` 增加 `deleteAdminQuestion`
- `ConfirmAction` 扩展为 `{ kind: "disable" | "delete"; target: Question }`
- 仅 `!question.isActive && !question.hasAttempts` 时渲染删除按钮（`Trash2`，`variant="secondary"`）
- 删除确认文案：
  - 标题：`确认删除题目「{stemPreview}」？`，其中 `stemPreview` 为题干截断（超过 40 字则取前 40 字并加省略号）
  - 描述：`此操作不可撤销。仅已停用且无答题记录的题目可删除。`
  - 确认：`删除`（`confirmVariant="danger"`）
- 停用确认文案保持现状
- `useConfirmAction.execute` 按 `kind` 分发到 `toggleStatus` / `removeQuestion`
- 成功：关闭弹窗、提示「已删除」、刷新列表
- 进行中：`mutatingId` 禁用对应操作
- 遵守 `apps/web/AGENTS.md`「确认弹窗失败约定」

## 测试

### 后端

- `questions.service.spec`：成功删除、不存在、仍启用、有答题记录
- 控制器 / OpenAPI：DELETE 路由与 `adminDeleteQuestion` 契约
- e2e：成功删除；启用拒绝；有答题记录拒绝

### 前端

- 题库页测试（对齐 `admin-products-page.test.tsx`）：
  - 启用中或已有答题记录的停用题不显示「删除」
  - 已停用且无答题记录显示「删除」，未确认不调 API
  - 确认后调用 `deleteAdminQuestion`，成功提示并刷新
  - 失败保留弹窗展示错误
  - 取消不调 API
- api-client：若有方法清单测试则纳入 `deleteAdminQuestion`

## 验收

1. 管理端仅已停用且无答题记录的题目可见删除，二次确认后才发起删除
2. 启用或有答题记录无法删除，错误信息可读且确认弹窗可重试
3. 停用二次确认行为不受影响
4. 相关单元测试与 e2e 通过
