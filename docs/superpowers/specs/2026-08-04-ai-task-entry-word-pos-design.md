# AI 任务：entry 词库取词与按词性出题

## 背景

数据库新增英文词库数据表（`raw_entry` / `entry` / `sense` / `word_form` / `pronunciation`，由外部导入流程建表与灌数据）。此前 AI 任务由模型自行沿 `lastWord` 游标「密推进」选词，词是否真实、覆盖是否完整均不可控。

## 目标

1. 出题单词改为取自 `entry` 表 `word` 字段（数据库驱动，模型不再自选词）。
2. **不重复出题**：跨轮靠 `lastWord` 游标严格递增；同轮内去重。
3. 用 `entry` 表 `pos` 字段判断词性，prompt 按词性出题（例句须按该词性使用目标词，解析注明词性）。

## 方案

### 取词（`AiTasksService.listNextEntryWords`）

每轮执行时一次性查询（无循环查库）：

```sql
SELECT e.word, ARRAY_AGG(DISTINCT e.pos) AS pos_list
FROM entry e
WHERE e.lang_code = 'en'
  AND e.pos IS NOT NULL
  AND e.word ~ '^[a-z]{2,}$'          -- 与题目 word 规范一致：纯小写字母、至少 2 字符
  AND (:cursor::text IS NULL OR e.word COLLATE "C" > :cursor)
GROUP BY e.word
ORDER BY e.word COLLATE "C"
LIMIT :questionCount
```

- 同一 `word` 多词性行 → `GROUP BY` 去重、`ARRAY_AGG(DISTINCT pos)` 聚合词性。
- `COLLATE "C"` 使数据库排序/比较与 JS 字符串比较一致（词已限定纯小写 ASCII）。
- 词库取尽（0 行）→ run `FAILED`，`errorMessage` 说明词库无更多单词，游标不变。
- 迁移 `0009_add_dictionary_tables`：`CREATE TABLE IF NOT EXISTS` 兼容存量库并让全新/测试库可用；新增 `entry (lang_code, word COLLATE "C")` 索引支撑游标查询。

### Prompt（`buildGeneratePrompt`）

- 输入从「游标 + 数量」改为 `words: { word, pos[] }[]`。
- 逐词列出 `"word" (pos1/pos2)`，要求：只用给定词、不增删/替换/重复；例句必须按给定词性使用目标词（多词性时选最常用）；解析为中文且含整句译文、**中文词性**（名词/动词/形容词…）与词义说明。
- 题干含目标词、禁挖空、选项中文、恰一正确项、严格 JSON 等既有约定不变。

### 校验（`validateOneGeneratedQuestion` / `parseGeneratedQuestionsJson`）

- 第三参数由 `minWordExclusive`（字母序 + 密推进）改为 `allowedWords: ReadonlySet<string> | null`：`word` 必须在本批词表内；接受一题后从集合移除，同批重复 → 拒绝。
- 删除 `isDenseWordProgression` 及相关密推进规则（词由数据库保证真实、有序、稠密）。
- 服务层沿用「单题不过则跳过、0 题成功整轮 `FAILED`」策略；不再有密度类整轮失败特例。

### 游标推进

成功轮次将 `lastWord` 更新为**本轮已接受题目中字母序最大的 `word`**：

- 已接受的词永不再被取到（不重复出题）。
- 被跳过且大于新游标的词，下轮会重新取到（未出过题，重试非重复）。
- 被跳过且小于新游标的词永久跳过（与既有部分失败语义一致，接受此取舍）。

## 非目标

- 不改动 Admin API / Web 管理端（`lastWord` 展示等外部行为不变）。
- 不在 Prisma schema 建词库模型（只读单查询，用 `$queryRaw`；导入流程拥有表结构）。
- 不使用 `sense` / `word_form` / `pronunciation` 数据（词义仍由 AI 生成）。
- 不回填历史游标之前被跳过的单词。

## 验收

1. 单测：取词结果（词表 + 词性）传入 generate；词库取尽 `FAILED`；词表外/同批重复的 `word` 被跳过；全部无效 → `FAILED` 且游标不变；游标推进到已接受最大词。
2. 单测：prompt 含词表、词性、按词性出题与中文词性解析要求；校验拒绝词表外与重复词。
3. 既有题干/选项/解析校验与运行锁、responseBody 等行为不回归。
