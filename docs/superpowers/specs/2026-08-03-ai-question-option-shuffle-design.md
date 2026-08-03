# AI 出题：入库前打乱选项顺序

## 背景

LLM 生成选择题时，正确项高度倾向落在 `A`。当前流水线完全信任模型返回的选项顺序，练习侧又按 `position` 原样展示，导致题库中正确答案分布严重偏斜，学生可猜「多数选 A」。

## 目标（方案：入库时打乱）

- AI 出题校验通过后、写入题库前，对每题选项做 **Fisher–Yates 洗牌**。
- 洗牌后按新顺序重标 `label` 为 `A/B/C/...`，`position` 与数组下标一致。
- `isCorrect` 跟随选项内容迁移，不跟随原字母。
- 洗牌逻辑可注入 `rng`（默认 `Math.random`），便于单测确定性断言。

## 实现

| 位置 | 变更 |
|------|------|
| `apps/api/src/ai-tasks/generate-questions.ts` | 新增 `shuffleQuestionOptions`；在 `parseGeneratedQuestionsJson` 成功组装每题后调用，保证所有生成路径一致 |
| `apps/api/src/ai-tasks/generate-questions.spec.ts` | 固定 `rng` 覆盖顺序变化、标签重排、正解唯一；可保留轻量随机分布断言 |
| Prompt | 可选一句「选项顺序无关」；**不以 prompt 要求模型随机为主手段** |

## 非目标

- 不回填/不迁移已有题库题目。
- 不改练习侧展示逻辑（仍按 `position`）。
- 不在答题时二次打乱。
- 不改 stem / explanation / word 游标等既有校验。

## 验收

1. 解析出口对每题选项洗牌并重标 `A/B/C/...`。
2. 洗牌后仍恰好一个 `isCorrect=true`，内容与洗牌前正确项一致。
3. 固定 `rng` 的单元测试可断言确定顺序与标签。
4. 相关单元测试通过。
