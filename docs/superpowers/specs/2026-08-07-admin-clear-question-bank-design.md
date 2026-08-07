# 管理端清理题库

**日期：** 2026-08-07  
**状态：** 已确认  

## 目标

在题库管理界面提供「清理题库」能力：管理员经加强二次确认后，强制删除库中全部题目（含启用中、有答题记录的题目）。积分流水与学员余额保留。

## 非目标

- 按当前筛选/分页部分清空
- 软删除 / `deletedAt`
- 删除或回滚积分流水与余额
- 修改 Prisma 全局 `onDelete` 策略（仅在清空事务内显式处理外键）
- 清空后自动重建题目或触发 AI 出题
- 扩展现有 batch 接口以承载全库清空语义

## 决策摘要

| 项 | 选择 |
|----|------|
| 清空范围 | 全部题目，忽略筛选与分页 |
| 有答题记录 | 强制删除：先断开积分流水关联，再删答题记录，再删题目 |
| 积分 | 保留 `PointLedger` 与余额；仅将 `answerAttemptId` 置 `null` |
| API | 独立 `POST /api/v1/admin/questions/clear` |
| 确认 UX | 弹窗内须输入固定文案「清空题库」后方可确认 |
| 空库 | 允许调用，返回 `{ deleted: 0 }` |

## 架构

```
Admin Questions Page
  └─ 「清理题库」→ openConfirm({ kind: "clear" })
       └─ ConfirmDialog（须输入「清空题库」）
            └─ clearAdminQuestions()
                 └─ POST /api/v1/admin/questions/clear
                      └─ QuestionsService.clearAll（单事务）
                           ├─ PointLedger：关联答题的 answerAttemptId → null
                           ├─ AnswerAttempt.deleteMany
                           └─ Question.deleteMany（选项 / QuestionProgress Cascade）
```

## 接口

- `POST /api/v1/admin/questions/clear`
- 鉴权：`ADMIN`
- OpenAPI `operationId`：`adminClearQuestions`
- Body：无（空 body 或不接收业务字段）
- 成功：`200` + `{ deleted: number }`（删除的题目数量）

### 事务顺序（必须）

在同一数据库事务内按序执行，禁止循环逐条查库/删库：

1. 将仍指向答题记录的 `PointLedger.answerAttemptId` 批量置为 `null`
2. `AnswerAttempt.deleteMany`（清空全部答题记录，或等价于删除所有仍存在的题目关联记录）
3. `Question.deleteMany({})`：硬删除全部题目；`QuestionOption`、`QuestionProgress` 随 Cascade 清理

说明：`AnswerAttempt.question` / `selectedOption` 为 `onDelete: Restrict`，`PointLedger.answerAttempt` 亦为 `Restrict`，故必须先断开流水、再删答题，最后删题目，不能直接 `question.deleteMany`。

### 错误

- 非管理员 → `403`
- 事务冲突等基础设施错误 → 现有统一错误映射；失败时整事务回滚，前端保留弹窗展示错误

## 前端

文件：`apps/web/app/(admin)/admin/questions/page.tsx`

- 筛选行（主 CTA「添加题目」旁）增加危险样式按钮「清理题库」
- `ConfirmAction` 扩展 `kind: "clear"`
- 加强确认：
  - 标题：`确认清理题库？`
  - 描述：将永久删除全部题目及答题记录；积分流水与余额保留；此操作不可恢复。请输入「清空题库」以确认。
  - 输入框：须精确匹配 `清空题库`（trim 后全等）；不匹配时确认按钮 `disabled`
  - `confirmVariant="danger"`，确认文案「清理题库」
- 实现方式：扩展 `ConfirmDialog` 增加可选 `challengePhrase` / `challengeInput`（或题库页专用包装组件），避免各页复制门户逻辑；无 challenge 时行为与现有确认弹窗一致
- 遵守 `apps/web/AGENTS.md`：失败保留弹窗并通过 `error` 展示；成功后关闭弹窗、清空 `selectedIds`、刷新列表、提示 `已清理 N 道题目`
- `mutatingBatch` / `mutatingId` 互斥占用期间不可再开清理确认（`useConfirmAction.blocked`）
- api-client：`clearAdminQuestions`

## 测试

### 后端

- `questions.service.spec`：
  - 含启用题、有答题记录、有积分流水时清空成功
  - 流水仍在且 `answerAttemptId === null`，余额不受影响
  - 题目、选项、答题、进度均不存在
  - 返回正确 `deleted`
  - 空库返回 `{ deleted: 0 }`
  - 写入为批量操作，非循环内单条删除
- 控制器 / OpenAPI：`adminClearQuestions` 契约
- e2e：管理员清空成功；学员访问返回稳定 `403`

### 前端

- 题库页展示「清理题库」
- 未输入 / 输入错误时确认按钮禁用；输入「清空题库」后可确认并调用 API
- 成功：列表刷新、展示成功文案、弹窗关闭
- 失败：弹窗保留并展示错误

## 与现有删除能力的关系

- 单条删除、批量删除规则不变（仍仅已停用且无答题记录可删）
- 「清理题库」是唯一允许强制清除有答题记录题目的入口
