# AI 任务执行记录弹窗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将管理端 AI 任务「执行记录」从页面内嵌 Card 改为复用 `FormDialog` 弹窗展示。

**Architecture:** 仅改 `AdminAiTasksPage` 的 `runsFor` 渲染分支：用已有 `FormDialog` 包裹原 loading / EmptyState / 表格；关闭走 `setRunsFor(null)`。不新增组件、不改 API、不改 CSS。

**Tech Stack:** Next.js (apps/web) / React Testing Library / Jest / `FormDialog`

## Global Constraints

- 表格字段与文案保持现状（触发、状态、开始、结束、题数、游标、错误）。
- 不改 `listAdminAiTaskRuns` 入参（`page: 1`, `pageSize: 20`）。
- 不向执行记录 `FormDialog` 传 `pending`。
- 弹窗样式必须复用 `.form-dialog`（经 `FormDialog`），不加宽专用 class。
- 添加/修改功能须同步单元测试并通过。

---

## File map

| 文件 | 职责 |
|------|------|
| `apps/web/tests/admin-ai-tasks-page.test.tsx` | 断言执行记录以 dialog 打开/关闭 |
| `apps/web/app/(admin)/admin/ai-tasks/page.tsx` | `runsFor` 分支改用 `FormDialog`；移除未用 `X` import |

Spec: `docs/superpowers/specs/2026-08-05-ai-task-runs-dialog-design.md`

---

### Task 1: 执行记录以 FormDialog 展示

**Files:**
- Modify: `apps/web/tests/admin-ai-tasks-page.test.tsx`
- Modify: `apps/web/app/(admin)/admin/ai-tasks/page.tsx`

**Interfaces:**
- Consumes: `FormDialog` from `@/components/ui/form-dialog`（已 import）
- Produces: 无新导出；页面行为：`runsFor` 非空时渲染 `role="dialog"`，标题 `执行记录 · {name}`

- [x] **Step 1: 更新失败测试（dialog 打开 + 关闭）**

将现有用例 `执行记录调用 listAdminAiTaskRuns` 改为断言 dialog，并追加关闭断言：

```tsx
  it("执行记录调用 listAdminAiTaskRuns", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminAiTasksPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("每日词汇")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "执行记录" }));

    await waitFor(() => {
      expect(api.listAdminAiTaskRuns).toHaveBeenCalledWith("task-1", {
        page: 1,
        pageSize: 20,
      });
      expect(
        screen.getByRole("dialog", { name: "执行记录 · 每日词汇" }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "执行记录 · 每日词汇" }),
      ).toBeNull();
    });
  });
```

说明：`FormDialog` 关闭按钮 `aria-label` 默认为「关闭」（见 `apps/web/tests/form-dialog.test.tsx`）。点击关闭后 dialog 应从文档移除。

- [x] **Step 2: 跑测确认失败（或行为不符）**

Run:

```bash
pnpm --filter web test -- admin-ai-tasks-page.test.tsx -t "执行记录调用 listAdminAiTaskRuns"
```

Expected: 失败——当前实现是页面内 `h2` + 文案「关闭」的 `Button`，不是 `role="dialog"`；或关闭后行为与断言不符。若因旧实现碰巧能匹配部分断言，以「缺少 `role="dialog"`」为准确认需改实现。

- [x] **Step 3: 将 runs 区块改为 FormDialog**

在 `apps/web/app/(admin)/admin/ai-tasks/page.tsx`：

1. 从 `lucide-react` import 中移除未再使用的 `X`。
2. 将 `{runsFor ? ( <Card className="admin-form-card">…</Card> ) : null}` 替换为：

```tsx
      {runsFor ? (
        <FormDialog
          onClose={() => setRunsFor(null)}
          title={`执行记录 · ${runsFor.name}`}
        >
          {runsLoading ? (
            <p>
              <LoaderCircle aria-hidden="true" className="spin" /> 加载中
            </p>
          ) : runs.length === 0 ? (
            <EmptyState
              title="暂无执行记录"
              description="立即执行或等待 crontab 触发后会出现记录。"
            />
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>触发</th>
                    <th>状态</th>
                    <th>开始</th>
                    <th>结束</th>
                    <th>题数</th>
                    <th>游标</th>
                    <th>错误</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td>{run.trigger}</td>
                      <td>{run.status}</td>
                      <td>{formatter.format(new Date(run.startedAt))}</td>
                      <td>
                        {run.finishedAt
                          ? formatter.format(new Date(run.finishedAt))
                          : "—"}
                      </td>
                      <td>{run.questionsCreated}</td>
                      <td>
                        {run.lastEntryIdBefore ?? "∅"} →{" "}
                        {run.lastEntryIdAfter ?? "∅"}
                      </td>
                      <td className="admin-table__error">
                        {run.errorMessage ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FormDialog>
      ) : null}
```

注意：

- 不要传 `pending`。
- 保留 `Card` import（筛选区仍用 `Card`）。
- 不要改 `loadRuns` / API / 表格列。

- [x] **Step 4: 跑测通过**

Run:

```bash
pnpm --filter web test -- admin-ai-tasks-page.test.tsx
```

Expected: 全部 PASS。

- [x] **Step 5: Commit**

```bash
git add apps/web/app/\(admin\)/admin/ai-tasks/page.tsx apps/web/tests/admin-ai-tasks-page.test.tsx
git commit -m "$(cat <<'EOF'
feat: AI 任务执行记录改为 FormDialog 弹窗展示

EOF
)"
```
