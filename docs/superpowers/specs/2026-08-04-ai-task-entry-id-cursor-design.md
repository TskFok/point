# AI 任务：按 entry.id 游标取词（去掉 word 形态限制）

## 背景

此前 AI 任务从 `entry` 表按 `lastWord` 字母序取词，并带有多道 word 形态限制（`word ~ '^[a-z]{2,}$'`、按 word `GROUP BY` 聚合 pos、校验端 `WORD_PATTERN` 纯小写字母等）。词库中合法词条因此被跳过，且游标语义与「词条行」不对齐。

## 目标

1. 出题仅从 `entry` 取 `word` + `pos`（一行一题候选）。
2. 用 `entry.id` 作为任务游标终点；按 `id` 升序取下一批。
3. 清理此前所有对 word 形态的限制；保留 `lang_code = 'en'` 与 `pos IS NOT NULL`。
4. Schema / API / 前端字段从 `lastWord*` 迁移为 `lastEntryId*`。

## 方案

### 取词（`AiTasksService.listNextEntryWords`）

```sql
SELECT e.id, e.word, e.pos
FROM entry e
WHERE e.lang_code = 'en'
  AND e.pos IS NOT NULL
  AND (:cursor::bigint IS NULL OR e.id > :cursor)
ORDER BY e.id ASC
LIMIT :questionCount
```

- 无 `GROUP BY`、无 word 正则、无字母序 `COLLATE "C"` 比较。
- 同一 `word` 多行 → 可多题（各用自己的 `pos`）。
- 0 行 → run `FAILED`，说明词库游标已到末尾，游标不变。
- 可选迁移：为 `(lang_code, id)` 建索引支撑游标查询（`entry_lang_id_idx`）。

### 类型与 Prompt

- `DictionaryWord`：`{ id: string; word: string; pos: string }`（`id` 用字符串避免 BigInt JSON 问题）。
- Prompt 仍列出 `"word" (pos)`；按给定词性造句/解析的既有约定不变。
- AI 回传不要求 `entryId`；校验仍按本批 `word` 集合匹配与同批去重。

### 游标推进

本轮至少 1 题写入成功后：

- `lastEntryId = max(本批取出的 entry.id)`（数值最大，与是否部分题被跳过无关）。
- 已扫过的 id 不再取到；被跳过的词条也不会在后续轮次重试（接受此取舍，换取简单、不重复扫描）。

词库取尽或 0 题成功 → 游标不变。

### 校验清理

- 删除 `WORD_PATTERN` / 「word 须为纯小写字母」限制。
- 保留：本批词表内、同批去重、stem/explanation/选项数量与恰一正确项、禁挖空、stem 含目标词等质量校验。
- `stemIncludesWord` 等对非纯字母词的边界匹配：保持现有实现；若词含特殊字符导致误拒，属质量校验范畴，本设计不扩展。

### Schema / API / 前端

迁移：

| 旧字段 | 新字段 | 类型 |
|--------|--------|------|
| `AiTask.lastWord` | `AiTask.lastEntryId` | `BigInt?` |
| `AiTaskRun.lastWordBefore` | `AiTaskRun.lastEntryIdBefore` | `BigInt?` |
| `AiTaskRun.lastWordAfter` | `AiTaskRun.lastEntryIdAfter` | `BigInt?` |

- 存量游标清空为 `null`（从最小 id 重新开始）。
- OpenAPI / `@point-quest/api-client` / Admin 列表与表单展示同步改名。
- 取代文档：`2026-08-04-ai-task-entry-word-pos-design.md` 中「按 lastWord 字母序 + word 正则」部分。

## 非目标

- 不在 Prisma 建 `Entry` 模型（继续 `$queryRaw`）。
- 不使用 `sense` / `word_form` / `pronunciation`。
- 不回填历史被跳过的词条；不迁移旧 `lastWord` 字符串到 id。
- 不要求 AI 回传 `entryId`。

## 验收

1. 单测：取词按 id 升序且带 id/word/pos；成功推进到本批最大 id；取尽 / 0 题成功不推进。
2. 单测：无「纯小写字母」拒绝；仍拒绝词表外与同批重复 word。
3. API/前端字段为 `lastEntryId*`；OpenAPI 与相关页面单测通过。
4. 既有运行锁、responseBody、题干质量校验不回归。
