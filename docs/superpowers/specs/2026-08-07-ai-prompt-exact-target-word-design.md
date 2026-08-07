# AI 出题 Prompt：题干须含目标词原样拼写

## 背景

AI 任务偶发生成不合格题干，触发校验失败「题目 {word} stem 未包含目标词」。典型案例如下（目标词 `why`）：

- 例句用变形：`She whys every decision...`（`whys` 不满足单词边界包含 `why`）
- 串成近形词：`When did you arrive?`（题干与 `word` 字段都变成 `when`）

既有校验（`stemIncludesWord`：大小写不敏感的单词边界匹配）与 fail-fast 解析行为保持不变；本改动只加强 prompt，降低模型写出上述坏题的概率。

## 目标

在 `buildGeneratePrompt` 中明确：

1. **原样拼写**：stem 必须出现目标词的 exact spelling（允许大小写差异），禁止仅用屈折/派生形式代替（如 `whys` / `running` 代替 `why` / `run`）。
2. **禁止换词**：每题 JSON 的 `word` 与 stem 中的考查词必须与本批词表对应项一致，禁止换成近形词或其它词。
3. **点名考查**：继续要求句末点名，如 `What does \"why\" mean?`，使目标词以独立词形式出现在 stem 中。

## 实现

| 位置 | 变更 |
|------|------|
| `apps/api/src/ai-tasks/generate-questions.ts` | `buildGeneratePrompt` 增加上述英文约束句 |
| `apps/api/src/ai-tasks/generate-questions.spec.ts` | 断言 prompt 含 exact spelling / no inflection / no substitute 类约束 |

## 非目标

- 不放宽 `stemIncludesWord` / `validateOneGeneratedQuestion`。
- 不改 `parseGeneratedQuestionsJson` 的 fail-fast（一题失败则整批失败）。
- 不做坏题跳过、不做 stem 自动改写、不加重试。

## 验收

1. Prompt 文案含「exact spelling / 禁止变形代替 / 禁止换词」类约束。
2. 既有 stem 校验与相关单测仍通过。
3. 新增 prompt 相关单测通过。
