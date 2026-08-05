<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 管理页页头约定

适用范围：`app/(admin)/admin/**/page.tsx`。新建或改版管理页时必须遵守，禁止再引入自定义 header 类（如 `admin-page__header`）。

## 结构

页头统一使用：

```tsx
<div className="page-heading page-heading--split">
  <div>
    <p className="page-kicker">分区/能力名</p>
    <h1>页面标题</h1>
    <p>一句说明当前页职责。</p>
  </div>
  {/* 右侧槽位：见下方二选一 */}
</div>
```

左侧固定为：`page-kicker` + `h1` + 说明文案。右侧槽位二选一，不要同时放两个，也不要留空。

## 右侧槽位

1. **有主操作时**：放 CTA 按钮（如「添加商品」「新建任务」），通常带 `Plus` 图标，点击打开新建弹窗或进入创建流程。
2. **无主操作、需展示关键指标时**：放 `page-heading__stat`（如订单「当前结果」、积分「当前倍率」），结构为图标 + `<span>` 标签 + `<strong>` 数值；加载中或未知用 `"—"`。

```tsx
{/* CTA */}
<Button onClick={() => setEditing("create")}>
  <Plus aria-hidden="true" />
  添加商品
</Button>

{/* 或 stat */}
<div className="page-heading__stat">
  <ClipboardList aria-hidden="true" />
  <span>当前结果</span>
  <strong>{meta?.total ?? "—"}</strong>
</div>
```

## 禁止

- 不要使用 `admin-page__header` 或其他自定义页头 class
- 不要只用裸 `page-heading`（缺少 `--split` 时右侧 CTA/stat 无法与其他页对齐）
- 不要把主 CTA 放进筛选区、表格上方或页面底部来代替页头右侧槽位
