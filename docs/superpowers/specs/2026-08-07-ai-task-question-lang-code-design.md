# AI 任务 / 题目：语言选项（langCode）

## 背景

AI 任务从 `entry` 表取词出题时写死 `lang_code = 'en'`。词库已支持多语言（`en` / `ja` / `it` / `fr` / `de`），需要按任务选择语言取词，并让生成的题目带上语言标识。

## 目标

1. AI 任务可配置语言；取词按 `entry.lang_code` 过滤。
2. 生成 Prompt 与「点名考查」校验随语言切换；选项与 explanation 仍为中文。
3. `Question` 持久化 `langCode`；AI 出题写入任务语言；管理端手工建题/编辑可选。
4. 任务改语言时自动清空 `lastEntryId`。

## 语言枚举

| 展示名 | langCode |
|--------|----------|
| 英语 | `en` |
| 日语 | `ja` |
| 意大利语 | `it` |
| 法语 | `fr` |
| 德语 | `de` |

前后端共用同一常量集合；非法值拒绝写入。

## 数据模型

### `AiTask.langCode`

- 类型：`String`
- 允许值：`en|ja|it|fr|de`
- 默认：`en`
- 存量：migration 回填 `en`

### `Question.langCode`

- 类型：`String`
- 允许值：`en|ja|it|fr|de`
- 默认：`en`
- 存量：migration 回填 `en`
- 索引：`@@index([langCode, isActive])`（便于后续按语言筛题）

## 取词

`listNextEntryWords(lastEntryId, count, langCode)`：

```sql
SELECT e.id, e.word, e.pos
FROM entry e
WHERE e.lang_code = :langCode
  AND e.pos IS NOT NULL
  AND (:cursor::bigint IS NULL OR e.id > :cursor)
ORDER BY e.id ASC
LIMIT :count
```

游标语义不变：成功写入至少 1 题后推进到本批最大 `entry.id`；0 词 / 0 题成功不推进。

## Prompt 与校验

### Prompt

`buildGeneratePrompt` 增加 `langCode`：

- 结构：目标语言完整例句 + 空格 + 点名问句。
- 选项内容、explanation **固定中文**（含整句中译、词性中文、简要释义）。
- 点名问句模板：

| langCode | 点名问句 |
|----------|----------|
| en | `What does "WORD" mean?` |
| ja | `「WORD」はどういう意味ですか？` |
| it | `Che cosa significa "WORD"?` |
| fr | `Que signifie "WORD" ?` |
| de | `Was bedeutet "WORD"?` |

- Prompt 明确要求例句为目标语言；每种语言提供一条 good stem 示例。
- `wordMatchRules` 仍按任务配置注入，**不随语言自动切换默认后缀**。

### 校验

- `stemNamesTargetWord(stem, word, langCode)`：按语言匹配对应点名问句（引号 / `「」` 等可选）。
- `stemIncludesWord`、禁挖空、选项数量与恰一正确项等规则不变。
- `normalizeWord` 仍 trim + 小写（日语无大小写，行为可接受）。

### 写入

AI 任务 `question.create` 时写入 `langCode: task.langCode`。

## 改语言与游标

更新 AI 任务时，若请求中的 `langCode` 与库中值不同：

- 强制 `lastEntryId = null`
- 忽略本次请求中附带的 `lastEntryId`（改语言优先于手动设游标）

未改语言时，`lastEntryId` 行为与现有编辑游标逻辑一致。

## API

- `CreateAiTaskDto`：`langCode` 可选；省略时服务端默认 `en`。
- `UpdateAiTaskDto`：可选 `langCode`。
- `AiTaskDto`：返回 `langCode`。
- `CreateQuestionDto`：`langCode` 可选，省略默认 `en`。
- `UpdateQuestionDto`：可选 `langCode`。
- `AdminQuestionDto` 及学生侧已暴露的题目主体 DTO：返回 `langCode`。
- 校验：`IsIn(['en','ja','it','fr','de'])`。
- OpenAPI / `@point-quest/api-client` 同步。

## 管理端 UI

- AI 任务表单：语言下拉（英语 / 日语 / 意大利语 / 法语 / 德语）；新建默认选中英语。
- AI 任务列表：展示语言列或标签。
- 题目表单：语言下拉；新建默认英语。
- 题目列表：展示语言；本轮一并加语言筛选（与 `langCode` 索引配套）。
- 编辑任务切换语言并保存后，游标展示为空（与后端清空一致）。

## 学生端

本轮**不**按语言过滤学生练题/预览分流；仅保证题目数据携带 `langCode`。无现成展示位则可不改学生 UI。

## 非目标

- 不按语言切换默认 `wordMatchRules`。
- 不做学生端按语言分轨。
- 不在 Prisma 建模 `Entry` 表（继续 `$queryRaw`）。
- 不把语言编码进 stem 文案前缀（如 `[JA]`）；语言以字段为准。

## 测试与验收

1. 取词 SQL / service：按任务 `langCode` 过滤；默认 `en` 行为与现网一致。
2. 更新任务改 `langCode` → `lastEntryId` 被清空；同语言更新不误清游标。
3. Prompt：`en` 保持现有约束；`ja`（及其他语言）含对应点名问句与「例句为目标语言」要求。
4. `stemNamesTargetWord`：各语言合法 stem 通过；缺点数名问句拒绝；至少覆盖 `en` + `ja`。
5. AI 出题写入的 `Question.langCode` 等于任务语言。
6. 管理端题目 create/update 可读写 `langCode`；存量默认 `en`；列表可按语言筛选。
7. 前端 AI 任务 / 题目表单单测提交含 `langCode`。
8. 相关既有单测全部通过。

## 取代关系

- 扩展（不废除）`2026-08-04-ai-task-entry-id-cursor-design.md` 中写死 `lang_code = 'en'` 的取词约定。
- 扩展 `stemNamesTargetWord` 仅匹配英文 `What does … mean?` 的约定（见 `2026-08-07-ai-prompt-exact-target-word-design.md`）。
