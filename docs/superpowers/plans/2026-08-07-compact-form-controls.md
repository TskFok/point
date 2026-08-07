# Compact Form Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将整站按钮、输入框、选择框的默认尺寸统一为「清理题库」按钮（`.pq-button--sm`）的紧凑规格。

**Architecture:** 仅改 `apps/web/app/globals.css` 中控件默认值，使 `.pq-button` / `.pq-input` / `.admin-field input|select` 等与现有 `.pq-button--sm` 同高；不逐页改 TSX。用读取 CSS 源文件的单测锁定关键选择器的 `min-height` / `padding` / `font-size`。

**Tech Stack:** Next.js web、`globals.css`、Jest（读取 CSS 文本断言）

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-07-compact-form-controls-design.md`
- 视觉基准：`.pq-button--sm` → `min-height: 2.25rem`、`padding: 0.45rem 0.75rem`、`font-size: 0.85rem`
- 范围：整站；侧栏导航链接不缩；checkbox/radio、进度条等非表单控件容器不缩
- `textarea` 保留较大 `min-height`（如 `7rem`），仅共享紧凑 padding/字号时不得压成单行
- `size="sm"` API 保留；默认按钮与 `sm` 视觉一致即可
- 添加/修改功能须补或更新单元测试，相关测试必须通过
- 未经用户明确要求不 `git commit` / `git push`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/web/tests/compact-form-controls.test.tsx` | 锁定 globals.css 紧凑尺寸规则（web jest 仅匹配 `*.test.tsx`） |
| `apps/web/app/globals.css` | 默认按钮/输入/选择/退出等控件尺寸 |
| `docs/superpowers/specs/2026-08-07-compact-form-controls-design.md` | 状态改为已确认 |

---

### Task 1: 紧凑尺寸 CSS 契约测试（TDD）

**Files:**
- Create: `apps/web/tests/compact-form-controls.test.tsx`
- Test: `apps/web/tests/compact-form-controls.test.tsx`

**Interfaces:**
- Consumes: `apps/web/app/globals.css` 文本
- Produces: 对关键选择器块内 `min-height: 2.25rem` 等的断言（失败则驱动 Task 2）

- [ ] **Step 1: 写入失败用例**

创建 `apps/web/tests/compact-form-controls.test.tsx`：

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(
  join(__dirname, "../app/globals.css"),
  "utf8",
);

/** 取第一个匹配选择器块的声明体（不含嵌套 @media） */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`);
  const match = css.match(re);
  if (!match) {
    throw new Error(`selector not found: ${selector}`);
  }
  return match[1];
}

describe("紧凑表单控件尺寸（globals.css）", () => {
  it(".pq-button 默认与 .pq-button--sm 同为紧凑规格", () => {
    const button = ruleBody(".pq-button");
    const sm = ruleBody(".pq-button--sm");

    expect(button).toMatch(/min-height:\s*2\.25rem/);
    expect(button).toMatch(/padding:\s*0\.45rem\s+0\.75rem/);
    expect(button).toMatch(/font-size:\s*0\.85rem/);

    expect(sm).toMatch(/min-height:\s*2\.25rem/);
    expect(sm).toMatch(/padding:\s*0\.45rem\s+0\.75rem/);
    expect(sm).toMatch(/font-size:\s*0\.85rem/);
  });

  it(".pq-input 为紧凑规格", () => {
    const input = ruleBody(".pq-input");
    expect(input).toMatch(/min-height:\s*2\.25rem/);
    expect(input).toMatch(/padding:\s*0\.45rem\s+0\.75rem/);
    expect(input).toMatch(/font-size:\s*0\.85rem/);
  });

  it("管理端字段 input/select 为紧凑规格", () => {
    expect(css).toMatch(
      /\.admin-field input,\s*\n\.admin-field select,\s*\n\.admin-field textarea,\s*\n\.input-with-icon\s*\{[^}]*min-height:\s*2\.25rem/,
    );
    expect(css).toMatch(
      /\.admin-field input,\s*\n\.admin-field select,\s*\n\.admin-field textarea\s*\{[^}]*padding:\s*0\.45rem\s+0\.75rem/,
    );
    expect(css).toMatch(
      /\.admin-field input,\s*\n\.admin-field select,\s*\n\.admin-field textarea,\s*\n\.input-with-icon\s*\{[^}]*font-size:\s*0\.85rem/,
    );
  });

  it(".sidebar-logout__button 为紧凑规格，侧栏导航不强制 2.25rem", () => {
    const logout = ruleBody(".sidebar-logout__button");
    expect(logout).toMatch(/min-height:\s*2\.25rem/);

    const nav = ruleBody(".sidebar-nav__link");
    expect(nav).not.toMatch(/min-height:\s*2\.25rem/);
  });

  it("textarea 保留多行最小高度", () => {
    const textarea = ruleBody(".admin-field textarea");
    expect(textarea).toMatch(/min-height:\s*7rem/);
  });
});
```

实现时保持 `globals.css` 中 admin-field 选择器换行格式与现网一致（四行选择器共享 `min-height`/`font-size`；三行选择器共享 `padding`），以便上述正则匹配。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @point-quest/web test -- compact-form-controls.test.tsx`

Expected: FAIL（`.pq-button` / `.pq-input` 仍为 `2.75rem` / `2.9rem`）

---

### Task 2: 更新 globals.css 默认控件尺寸

**Files:**
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/tests/compact-form-controls.test.tsx`

**Interfaces:**
- Consumes: Task 1 的尺寸契约
- Produces: 整站默认控件视觉与 `.pq-button--sm` 一致

- [ ] **Step 1: 改 `.pq-button` 默认块**

将：

```css
.pq-button {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 0.75rem 1.1rem;
  font-weight: 750;
  /* ... */
}
```

改为：

```css
.pq-button {
  display: inline-flex;
  min-height: 2.25rem;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 700;
  /* transitions 保持不变 */
}
```

并在 `.pq-button` 后增加（若尚无默认 svg 规则）：

```css
.pq-button svg {
  width: 1rem;
  height: 1rem;
}
```

`.pq-button--sm` 与 `.pq-button--sm svg` 保持现有紧凑值不变（可与默认相同）。

- [ ] **Step 2: 改 `.pq-input`**

```css
.pq-input {
  width: 100%;
  min-height: 2.25rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  color: var(--color-text);
  background: #fff;
  /* transitions 保持不变 */
}
```

- [ ] **Step 3: 改管理端字段与图标输入**

将 `.admin-field input, .admin-field select, .admin-field textarea, .input-with-icon` 共享块中的：

- `min-height: 2.9rem` → `min-height: 2.25rem`
- 其后单独的 padding 规则改为 `padding: 0.45rem 0.75rem`
- 增加 `font-size: 0.85rem`（若写在共享块或 padding 块均可，须被测试匹配到）

将 `.input-with-icon input` 的 `min-height: 2.75rem` → `min-height: 2.25rem`（或 `auto` / `0` 若由容器撑开；优先 `2.25rem` 以通过契约）。

**注意：** `.admin-field textarea` 单独规则必须仍含 `min-height: 7rem`（覆盖共享块的 2.25rem）。

- [ ] **Step 4: 改侧栏退出与其它按钮型控件**

```css
.sidebar-logout__button {
  /* ... */
  min-height: 2.25rem;
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  /* 其余颜色/布局保持 */
}
```

将 `.admin-menu-button, .admin-drawer__header button, .toast button` 的 `min-height: 2.75rem`（及对称 `min-width` 若存在）改为 `2.25rem`。

**不要改：** `.sidebar-nav__link`、`.practice-progress`、`.profile-link`、`.back-link`、`.admin-switch`、`.question-option-editor__correct`、`.point-chip`。

- [ ] **Step 5: 跑契约测试确认通过**

Run: `pnpm --filter @point-quest/web test -- compact-form-controls.test.tsx`

Expected: PASS

- [ ] **Step 6: 跑相关回归**

Run: `pnpm --filter @point-quest/web test -- admin-questions-page.test.tsx auth-forms.test.tsx logout-button.test.tsx form-dialog.test.tsx confirm-dialog.test.tsx`

Expected: PASS（含「清理题库」仍带 `pq-button--sm`）

- [ ] **Step 7: 更新 spec 状态**

将 `docs/superpowers/specs/2026-08-07-compact-form-controls-design.md` 顶部 `**状态：** 待确认` 改为 `**状态：** 已确认`。

- [ ] **Step 8: Commit（仅当用户明确要求）**

若用户要求提交：

```bash
git add \
  apps/web/app/globals.css \
  apps/web/tests/compact-form-controls.test.tsx \
  docs/superpowers/specs/2026-08-07-compact-form-controls-design.md \
  docs/superpowers/plans/2026-08-07-compact-form-controls.md
git commit -m "$(cat <<'EOF'
style(web): 整站按钮与表单控件改为紧凑尺寸

以题库「清理题库」按钮规格为基准，统一默认按钮、输入框与选择框高度。
EOF
)"
```

---

## Spec Coverage Checklist

| Spec 要求 | Task |
|-----------|------|
| `.pq-button` 默认 = sm 规格 | Task 2 Step 1 |
| `.pq-input` 对齐 | Task 2 Step 2 |
| admin-field input/select / input-with-icon | Task 2 Step 3 |
| sidebar-logout 对齐；nav 不缩 | Task 2 Step 4 |
| textarea 保留多行高度 | Task 2 Step 3 + Task 1 断言 |
| `size="sm"` 兼容 | Task 2 Step 1（`--sm` 不变） |
| 单元测试锁定尺寸 | Task 1 |
| 相关测试通过 | Task 2 Step 6 |
