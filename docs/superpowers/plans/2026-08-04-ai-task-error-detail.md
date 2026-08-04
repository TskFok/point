# AI 任务失败错误明细 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 调用失败时 `errorMessage` 附带 HTTP body / 底层 Error / 响应摘要，便于管理端排查。

**Architecture:** 仅增强 `apps/api/src/ai-tasks/generate-questions.ts` 的失败 message 拼装；前端与 DB 不变。

**Tech Stack:** NestJS / Jest / fetch mock

## Global Constraints

- 摘要截断约 500 字符；不落 apiKey。
- 业务校验失败文案不动。
- 添加/修改功能须同步单元测试并通过。

---

## File map

| 文件 | 职责 |
|------|------|
| `apps/api/src/ai-tasks/generate-questions.ts` | 失败文案增强 + 截断/摘要 helper |
| `apps/api/src/ai-tasks/generate-questions.spec.ts` | 失败路径单测 |

---

### Task 1: HTTP / 网络失败明细

**Files:**
- Modify: `apps/api/src/ai-tasks/generate-questions.spec.ts`
- Modify: `apps/api/src/ai-tasks/generate-questions.ts`

- [x] **Step 1: 写失败测试** — HTTP 401 带 `error.message`；超时/网络带 `Error.message`
- [x] **Step 2: 跑测确认失败**
- [x] **Step 3: 实现 message 拼装（含 500 字截断）**
- [x] **Step 4: 跑测通过**

### Task 2: 解析失败附摘要

**Files:** 同上

- [x] **Step 1: 写失败测试** — 非 JSON、缺 choices、content 空
- [x] **Step 2: 跑测确认失败**
- [x] **Step 3: 实现**
- [x] **Step 4: `pnpm --filter api test -- generate-questions`**
