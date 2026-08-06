# 管理端商品删除

**日期：** 2026-08-06  
**状态：** 已确认  

## 目标

在商品管理界面为已下架商品提供删除能力；删除需二次确认，交互与错误处理对齐 AI 模型 / AI 任务等管理模块。服务端强制「已下架且无关联订单」才可硬删除。

## 非目标

- 软删除 / `deletedAt` 字段
- 级联删除订单或改写历史订单
- 同步清理商品图片文件（本地或 R2 孤儿文件）
- 批量删除
- 上架商品的删除入口（前端隐藏；后端仍校验拒绝）

## 决策摘要

| 项 | 选择 |
|----|------|
| 删除模型 | 硬删除 Product 行 |
| 可删条件 | `isActive === false` 且无关联 `Order` |
| 前端入口 | 仅已下架商品卡片显示「删除」 |
| 确认 UX | `useConfirmAction` + `ConfirmDialog` |
| 失败处理 | 保留弹窗，通过 `error` 展示，允许重试或取消 |
| 参考实现 | `admin/ai-models`、`admin/ai-tasks` 删除流 |

## 架构

```
Admin Products Page
  └─ 已下架卡片「删除」→ openConfirm
       └─ ConfirmDialog 确认
            └─ deleteAdminProduct(id)
                 └─ DELETE /api/v1/admin/products/:productId
                      └─ ProductsService.remove
                           ├─ 不存在 → 404 PRODUCT_NOT_FOUND
                           ├─ 仍上架 → 409 PRODUCT_ACTIVE
                           ├─ 有订单 → 409 PRODUCT_HAS_ORDERS
                           └─ 否则 prisma.product.delete → { success: true }
```

## 接口

- `DELETE /api/v1/admin/products/:productId`
- 鉴权：`ADMIN`
- OpenAPI `operationId`：`adminDeleteProduct`
- 成功：`200` + `{ success: true }`（`SuccessResponseDto`）
- api-client 暴露：`deleteAdminProduct(productId)`

### 错误码

| 条件 | HTTP | code | 文案方向 |
|------|------|------|----------|
| 商品不存在 | 404 | `PRODUCT_NOT_FOUND` | 商品不存在 |
| 仍为上架 | 409 | `PRODUCT_ACTIVE` | 请先下架再删除 |
| 存在关联订单 | 409 | `PRODUCT_HAS_ORDERS` | 该商品已有订单，无法删除 |

订单关联以 `Order.productId` 是否存在为准（`onDelete: Restrict` 的业务前置校验，避免依赖裸 P2003 文案）。

## 前端

文件：`apps/web/app/(admin)/admin/products/page.tsx`

- `ProductsApi` 增加 `deleteAdminProduct`
- 仅 `!product.isActive` 时渲染删除按钮（`Trash2`，`variant="secondary"`）
- 确认文案：
  - 标题：`确认删除商品「{name}」？`
  - 描述：`此操作不可撤销。仅已下架且无订单的商品可删除。`
  - 确认：`删除`（`confirmVariant="danger"`）
- 成功：关闭弹窗、提示「已删除」、刷新列表
- 进行中：`busyId` 禁用对应操作
- 遵守 `apps/web/AGENTS.md`「确认弹窗失败约定」

布局：编辑与删除并排；必要时增加 `admin-product-card__actions` 类，风格贴近现有 `admin-table__actions`。

## 测试

### 后端

- `products.service.spec`：成功删除、不存在、仍上架、有订单
- `admin-products.controller.spec`：DELETE 路由委托 service
- e2e：成功删除；上架拒绝；有订单拒绝（替换现有 DELETE 期望 404 的断言）

### 前端

- 商品页测试：
  - 上架不显示「删除」
  - 下架显示「删除」，未确认不调 API
  - 确认后调用 `deleteAdminProduct`，成功提示并刷新
  - 失败保留弹窗展示错误
  - 取消不调 API
- api-client：若有方法清单测试则纳入 `deleteAdminProduct`

## 验收

1. 管理端仅已下架商品可见删除，二次确认后才发起删除
2. 上架或有订单无法删除，错误信息可读且确认弹窗可重试
3. 相关单元测试与 e2e 通过
