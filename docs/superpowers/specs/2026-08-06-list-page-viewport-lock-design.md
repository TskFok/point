# 列表页视口锁：顶栏固定 + 分页钉底

**日期：** 2026-08-06  
**状态：** 已确认  
**关联：** 在 `2026-08-06-paginated-panel-sticky-footer-design.md` 之上补齐视口高度锁与顶部 chrome 固定。先前规格已落地 `paginated-panel` DOM；本规格解决「整页仍滚动导致页头/筛选跟着跑」以及「头/分页相对屏幕固定」的体验。

## 背景

`paginated-panel` 已使分页位于滚动体外，但高度链仍以 `min-height` 为主，文档级滚动未锁死时，页头与筛选仍会随页面上移。

目标：

1. 页头 + 筛选（及同属顶部的批量条 / banner / 特殊页摘要区）固定在视口顶部，不随列表滚动  
2. 分页固定在视口底部（学员小屏在 `MobileNav` 上方）  
3. 仅列表内容区滚动  

## 决策摘要

| 项 | 选择 |
|----|------|
| 顶部固定范围 | **B**：标题区 + 筛选栏（及批量条、页面级 banner；特殊页的表单/摘要等同属 chrome） |
| 覆盖范围 | **A**：所有带分页的列表页（管理端 + 学员端） |
| 学员小屏分页 | **A**：钉在底栏导航上方，两者同时可见 |
| 布局方案 | 视口高度锁 + Flex 分区（不用整页 `position: sticky` / 不用分页 `position: fixed`） |
| 顶部包装 class | `.list-page__chrome` |
| 列表壳 | 沿用 `.paginated-panel` / `.paginated-panel__body` |
| 分页组件 | 不改 API；继续 `Pagination` / `PaginationControls` |

## 非目标

- 合并两端分页组件  
- 改分页 API / `page` / `pageSize`  
- 用 `position: fixed` 钉分页（与学员底栏冲突）  
- 抽通用 `ListPageLayout` 组件  
- 弹窗内列表（如 AI 任务执行记录）  

## 覆盖页面

与既有 paginated-panel 规格相同：

| 端 | 页面 | 列表容器 | 顶部 chrome 含 |
|----|------|----------|----------------|
| 管理 | 题库 | `admin-table-wrap` | heading、筛选、批量条、banner |
| 管理 | 商品 | `admin-product-grid` | heading、筛选、banner |
| 管理 | 订单 | `admin-table-wrap` | heading、筛选、banner |
| 管理 | AI 模型 | `admin-table-wrap` | heading、筛选、banner |
| 管理 | AI 任务 | 主任务表 | heading、筛选、banner |
| 管理 | 积分倍率历史 | `config-history-list` | heading、配置表单、分区小标题 |
| 学员 | 商城 | `product-grid` | heading、banner |
| 学员 | 错题 | `wrong-grid` | heading |
| 学员 | 订单 | `order-list` | heading |
| 学员 | 个人中心流水 | `ledger-list` | heading、账户摘要、分区小标题 |

加载中、错误、空列表：不强制包 `paginated-panel`；成功且有列表数据时使用 panel。空态保持 `EmptyState`。

无分页页（学习首页、练习、预览、管理概览）：不套 `list-page__chrome` 钉底结构；页面自身可滚动，避免被列表布局锁死。

## 布局

```
.app-shell                         /* height: 100dvh; overflow: hidden */
  .app-sidebar                     /* 既有 fixed */
  .app-workspace                   /* height: 100dvh; overflow: hidden; 列 flex */
    .app-content                   /* flex: 1; min-height: 0; overflow: hidden; 列 flex */
      section.admin-page|student-page  /* flex: 1; min-height: 0; 列 flex */
        .list-page__chrome         /* flex-shrink: 0 */
          page-heading / 筛选 / 批量条 / banner /（特殊页表单·摘要）
        .paginated-panel           /* flex: 1; min-height: 0; 列 flex */
          .paginated-panel__body   /* flex: 1; min-height: 0; overflow: auto — 唯一滚动区 */
          nav.pagination           /* flex-shrink: 0 */
```

无 `paginated-panel` 时：`.admin-page` / `.student-page` 使用 `overflow: auto`，整页内容在页面容器内滚动。

### 学员小屏（≤900px）

- CSS 变量 `--student-bottom-nav-space`：底栏高度 + `env(safe-area-inset-bottom)`  
- `paginated-panel` 或分页底边预留该空间，使分页贴在 `MobileNav` **上方**  
- 现有 `.app-content` 的 `padding-bottom` 与底栏避让一并理顺，避免双重空隙或仍被挡住  

### 管理端窄屏

- 继续扣现有顶栏菜单按钮占位（`padding-top: 3.75rem`）  
- 高度链以 `100dvh` 扣 shell/content padding 与该占位为准  

## 实现要点

### CSS（`globals.css`）

1. 为 shell → workspace → content → page 建立 `100dvh` + `min-height: 0` + `overflow: hidden` 高度链（`100vh` 作 fallback）  
2. `.list-page__chrome`：`flex-shrink: 0`；内部 gap 与页面原有间距一致或通过 chrome 内 gap 承接  
3. 保留并校准既有 `.paginated-panel*` 与 `.paginated-panel > .pagination` 样式  
4. 无 panel 的 `.admin-page` / `.student-page`：允许 `overflow: auto`  
5. 学员 ≤900px：引入 `--student-bottom-nav-space`，分页钉在底栏上方  

### 页面 TSX

各带分页列表页统一：

```tsx
<section className="admin-page">{/* 或 student-page */}
  <div className="list-page__chrome">
    {/* heading / 筛选 / 批量条 / banner / 特殊页上方块 */}
  </div>
  {loading ? /* … */ : loadError ? /* … */ : empty ? (
    <EmptyState … />
  ) : (
    <div className="paginated-panel">
      <div className="paginated-panel__body">{/* 仅列表 */}</div>
      {meta ? <Pagination /* 或 PaginationControls */ … /> : null}
    </div>
  )}
</section>
```

弹窗、确认框仍挂在 section 内、chrome/panel 旁，不进滚动体。

### 测试

- 扩展既有「分页不在 `__body` 内」用例  
- 新增（至少题库 + 商城）：  
  - 存在 `.list-page__chrome`  
  - heading（及题库的筛选）在 chrome 内  
  - chrome 与 `nav[aria-label="分页"]` 均不是 `.paginated-panel__body` 的子孙  
- 跑既有分页/筛选相关测试，确保无回归  
- 以 DOM 结构断言为主，不强制视觉截图  

## 验收

1. 列表较长时：页头+筛选钉在视口顶，分页钉在视口底（学员小屏在底栏上方），仅中间列表滚动  
2. 列表较短时：分页仍贴 panel 底，不悬在内容中间  
3. 学员窄屏：分页与 `MobileNav` 同时可见、可点  
4. 无分页页（首页/练习/概览）仍可完整滚动浏览  
5. 翻页、筛选、加载/错误/空态、无障碍（`nav[aria-label="分页"]`）与现网一致  

## 风险与注意

- 积分页 / 个人中心 chrome 较高时，小屏列表区会变矮；接受该取舍（与「B：标题+筛选同固定」一致）  
- `100dvh` 在部分移动浏览器地址栏显隐时可能抖动；优先 `dvh`，保留 `vh` fallback  
- 改 shell overflow 时勿误伤 auth 页（auth 不走 `app-shell`）  
