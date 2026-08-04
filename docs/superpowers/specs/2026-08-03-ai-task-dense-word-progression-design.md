# AI 任务：单词游标密推进

> **已取代（2026-08-04）**：出题单词改为从数据库英文词库 `entry` 表取词，密推进规则随之废弃。见 `2026-08-04-ai-task-entry-word-pos-design.md`。

## 背景

AI 任务按英文字母序推进 `lastWord` 游标，但当前只校验「严格大于上一词」，不限制跨度。模型可能一次从 `advocate` 跳到 `kindle`，导致词表覆盖稀疏、中间大量常用词被永久跳过。

## 目标

在保留「字母序递增」的前提下，改为**尽量密、逐词推进**：相邻题的 `word` 跨度受硬规则约束；违规则整轮失败，不写题、不更新游标。

## 方案（已确认）

软约束（prompt）+ 硬校验；跨度规则为「同首字母且第 2 字母距离 ≤ 2」，换字母时仅允许进入下一个字母且第 2 字母为 `a`–`c`；任一违规 → run `FAILED`。

## 硬规则

对规范化小写词 `prev`、`next`（必须匹配 `^[a-z]+$`，否则拒绝）：

| 情况 | 通过条件 |
|------|----------|
| 同首字母 | 两者均有第 2 字母，且 `\|ord(next[1]) - ord(prev[1])\| ≤ 2` |
| 换字母 | `next[0] === succ(prev[0])`（仅下一个字母，如 `a→b`），且 `next[1] ∈ {a,b,c}` |
| 其它 | 拒绝 |

比较链：

- 本批第 1 题相对任务 `lastWord`（若存在）
- 之后每题相对上一题 `word`
- `lastWord` 为空时：第 1 题不做密度校验，从第 2 题起校验

### 正例

- `advocate` → `advice`（同首字母，第 2 字母 `d` 距离 0）
- `advocate` → `affect`（同首字母，第 2 字母 `d→f` 距离 2）
- `azure` → `baby`（换至下一字母 `b`，第 2 字母 `a`）

### 反例（须拒绝整轮）

- `advocate` → `kindle`（跨多个首字母）
- `advocate` → `airport`（同首字母但第 2 字母 `d→i` 距离 5）
- `azure` → `kindle`（非下一字母）
- `azure` → `brown`（下一字母但第 2 字母 `r` 不在 `a`–`c`）

## 失败策略

任一题密度不达标（或非纯小写字母词）→ 整轮 `FAILED`：

- 不写入任何题目
- 不更新任务 `lastWord`
- `errorMessage` 说明密度/跨度原因（不得含 API Key）

与现有 `parseGeneratedQuestionsJson`「一题校验失败即整体失败」对齐；服务层不得对密度错误做「跳过该题、收下其余」处理。

## 实现

| 位置 | 变更 |
|------|------|
| `generate-questions.ts` | 导出 `isDenseWordProgression(prev, next)`；`validateOneGeneratedQuestion` 在字母序校验后做密度校验；`buildGeneratePrompt` 写入密推进说明与正反例 |
| `generate-questions.spec.ts` | 覆盖上述正反例、prompt 文案、整批 parse 失败 |
| `ai-tasks.service.ts` | 若存在对校验失败「跳过收下」的路径，密度类错误改为整轮失败（与本 spec 一致） |
| `2026-08-03-admin-ai-tasks-design.md` | 「出题约定」同步补充密推进规则 |

常量：`MAX_SECOND_LETTER_DELTA = 2`；换字母时允许的第 2 字母集合为 `a`–`c`。不做任务级可配置（YAGNI）。

## 非目标

- 不引入内置英文词表或「词典相邻词」判定
- 不自动重试 AI 调用
- 不回填已被跳过的历史游标区间
- 不改变题干/选项/解析既有校验

## 验收

1. 单元测试覆盖密推进通过/拒绝与 prompt 约束。
2. 模拟返回 `advocate`→`kindle` 时 run 失败且 `lastWord` 不变。
3. 模拟密推进合法序列时成功入库且 `lastWordAfter` 为最后一词。
