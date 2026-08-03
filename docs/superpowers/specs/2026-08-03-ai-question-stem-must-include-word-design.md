# AI 出题：题干须含完整英文原词

## 背景

AI 任务生成的词汇题偶发把目标词挖空（如 `The scholar claimed to ___ violence in all forms.`），导致英文原词未出现在题干中，不符合「语境中认词 + 选中文词义」的预期。

## 目标题型（方案 A + 校验）

- **题干（`stem`）**：完整英文例句，必须原样包含目标词 `word`；并点名考查该词（如 `What does "abhor" mean?`）。
- **禁止**：`___`、`…`（用作挖空）、`[blank]`、`[ ]` 等占位挖空。
- **选项**：中文词义；恰 1 个正确项，对应 `word` 的意思。
- **解析**：中文；须含题干整句译文 + 词义说明。详见 `2026-08-03-ai-question-explanation-include-stem-translation-design.md`。
- **`word`**：仍仅用于字母序游标与校验，不单独落库。

### 正例

```text
word: abhor
stem: The scholar claimed to abhor violence in all forms. What does "abhor" mean?
options: 憎恶(正确) / 崇拜 / 吸收 / 坚持
```

### 反例（须拒绝）

```text
stem: The scholar claimed to ___ violence in all forms.
stem: Choose the correct meaning.   # 未包含 word
```

## 实现

| 位置 | 变更 |
|------|------|
| `buildGeneratePrompt` | 明确上述正反例与约束 |
| `validateOneGeneratedQuestion` | ① stem 含挖空占位 → 拒绝；② stem 未按单词边界包含 `word`（大小写不敏感）→ 拒绝 |
| `generate-questions.spec.ts` | 覆盖 prompt 文案、合法通过、挖空/缺词拒绝 |
| `2026-08-03-admin-ai-tasks-design.md` | 「出题约定」同步补充题干约束 |

## 非目标

- 不改选项语言、游标/入库结构、Admin UI、练习页展示。
- 不做自动改写 stem（拒绝即可，沿用现有跳过摘要逻辑）。

## 验收

1. Prompt 含「完整例句必须包含 word、禁止 blank」类约束。
2. 含 `___` 的 stem 校验失败。
3. stem 不含 `word` 时校验失败。
4. 合法「例句 + What does "word" mean?」+ 中文选项可通过校验。
5. 相关单元测试通过。
