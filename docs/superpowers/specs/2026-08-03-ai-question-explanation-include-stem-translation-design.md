# AI 出题：解析须含整题译文

## 背景

AI 任务生成的词汇题中，`explanation` 常只写词义（如「放弃」），答错后学员看不到题干整句的中文译文，不利于理解语境。

## 目标（方案 A + 仅改 Prompt）

- **解析（`explanation`）**：中文；须同时包含：
  1. 题干（`stem`）整句的中文译文；
  2. 词义 / 考点说明。
- **实现方式**：只加强 `buildGeneratePrompt` 的约束与正例；**不做**结构硬校验（避免误杀合格短解析）。

### 正例

```text
word: abandon
stem: They decided to abandon the plan. What does "abandon" mean?
explanation: 他们决定放弃这个计划。「abandon」表示放弃、抛弃。
```

### 反例（应避免，本期不硬拒绝）

```text
explanation: 放弃
```

## 实现

| 位置 | 变更 |
|------|------|
| `buildGeneratePrompt` | 将「Explanation must be Chinese」改为明确要求：完整 stem 中文译文 + 词义说明，并附正例 |
| `validateOneGeneratedQuestion` | 不改（仍只校验 explanation 非空） |
| `generate-questions.spec.ts` | 断言 prompt 含译文相关约束与正例关键词 |
| `2026-08-03-admin-ai-tasks-design.md` | 「出题约定」中 `explanation` 描述同步更新 |
| `2026-08-03-ai-question-stem-must-include-word-design.md` | 「解析：中文」补充须含整题译文 |

## 非目标

- 不改库表、Admin UI、练习页展示。
- 不做「短解析 / 缺译文」硬拒绝。
- 不回溯改写已入库题目。
- 不拆分 `stemTranslation` 等新 JSON 字段。

## 验收

1. Prompt 明确要求 explanation = 整句译文 + 词义说明，并含正例类文案。
2. 相关单元测试通过。
