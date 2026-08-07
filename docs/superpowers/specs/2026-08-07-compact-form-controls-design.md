# 整站紧凑控件尺寸

**日期：** 2026-08-07  
**状态：** 已确认  

## 目标

将整站按钮、输入框、选择框的默认视觉尺寸统一为管理端题库页「清理题库」按钮（`Button size="sm"` / `.pq-button--sm`）的紧凑规格，覆盖管理端、学员端、登录注册及侧栏退出等按钮样式。

## 非目标

- 不改侧栏导航链接（`.sidebar-nav__link`）高度（非按钮/输入/选择控件）
- 不改 checkbox / radio 本体尺寸与练习选项交互热区逻辑
- 不改卡片、页面间距、圆角 token、配色
- 不强制收缩多行 `textarea` 的最小高度（仅对齐字号与水平 padding）
- 不引入新的 UI 组件库或尺寸 token 体系（本轮以 CSS 默认值对齐为准）

## 决策摘要

| 项 | 选择 |
|----|------|
| 范围 | 整站（方案用户选项 1） |
| 实现路径 | 改全局 CSS 默认值（方案 A） |
| 视觉基准 | 现有 `.pq-button--sm` |
| `size="sm"` API | 保留；默认按钮与 `sm` 视觉一致 |
| 侧栏导航 | 不缩；侧栏退出按钮对齐 |

## 目标尺寸

以现有 `.pq-button--sm` 为准：

| 属性 | 值 |
|------|-----|
| `min-height` | `2.25rem` |
| `padding` | `0.45rem 0.75rem`（按钮）；输入/选择框采用等价紧凑 padding |
| `font-size` | `0.85rem` |
| `font-weight`（按钮） | `700`（与现 `sm` 一致；默认按钮可一并降到 700） |
| 图标（按钮内 svg） | `1rem × 1rem`（与现 `.pq-button--sm svg` 一致） |

## 改动面

主要文件：`apps/web/app/globals.css`。`packages/ui` 的 `Button` 默认 `size="md"` 可保持不变——因默认 `.pq-button` 已与 `sm` 同高，无需逐页改 TSX。

### 必须对齐的选择器

1. `.pq-button` — 默认改为上述尺寸；`.pq-button--sm` 保留为相同规格（兼容已有 `size="sm"` 与测试断言）
2. `.pq-input` — `min-height` / padding / font-size 对齐
3. `.admin-field input`、`.admin-field select`、`.input-with-icon` 及其内部 `input` — 对齐
4. `.sidebar-logout__button` — 作为按钮对齐
5. 其它显式「按钮型」控件若仍使用 `2.75rem`/`2.9rem` 作为可点击控件高度（如 `.admin-menu-button`、`.toast button`、`.admin-drawer__header button`），一并改为 `2.25rem`，避免局部偏大

### 不对齐的选择器（明确排除）

- `.sidebar-nav__link`
- `.practice-progress`、`.profile-link`、`.back-link`、`.admin-switch`、`.question-option-editor__correct`、`.point-chip` 等非「按钮/输入/选择框」容器
- `.admin-field textarea` 的 `min-height: 7rem`（保留）；仅在与 input 共享规则时避免把 textarea 压成单行高度

## 测试

- 既有「清理题库」断言 `pq-button--sm` 继续通过
- 新增或扩展轻量样式测试（优先挂在现有 UI/页面测试）：断言默认 `.pq-button` 与 `.pq-input`（或管理端筛选 `input`/`select`）具备紧凑 `min-height`（`2.25rem`）或等价 class 行为
- 跑受影响的 web 单测（按钮/表单/题库页相关），确保无回归

## 验收

- 管理端筛选行中「清理题库」与「添加题目」「筛选」等默认按钮视觉高度一致且均为紧凑规格
- 登录/注册输入框与提交按钮为紧凑规格
- 学员端主 CTA（`pq-button` / `Link.pq-button`）为紧凑规格
- 侧栏退出按钮紧凑；侧栏导航链接高度不变
