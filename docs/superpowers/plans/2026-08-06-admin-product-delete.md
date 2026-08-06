# Admin Product Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理端商品页支持对已下架且无订单的商品二次确认后硬删除。

**Architecture:** 后端新增 `DELETE /api/v1/admin/products/:productId`，在 `ProductsService.remove` 内校验「存在 / 已下架 / 无订单」后 `prisma.product.delete`。前端对齐 AI 模型页：`useConfirmAction` + `ConfirmDialog`，仅对下架商品显示删除按钮。OpenAPI → api-client 同步暴露 `deleteAdminProduct`。

**Tech Stack:** NestJS、Prisma、Jest（API）、Next.js、RTL/Jest（Web）、`@point-quest/api-client`、`ConfirmDialog` / `useConfirmAction`

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-06-admin-product-delete-design.md`
- 可删条件：`isActive === false` 且无关联 `Order`（按 `productId` 计数）
- 错误码：`PRODUCT_NOT_FOUND`（404）、`PRODUCT_ACTIVE`（409）、`PRODUCT_HAS_ORDERS`（409）
- 成功：`{ success: true }`（`SuccessResponseDto`）
- 前端失败：保留确认弹窗，经 `ConfirmDialog.error` 展示（见 `apps/web/AGENTS.md`）
- 不引入软删除、不删图片文件、不级联订单
- 添加/修改功能须补或更新单元测试，相关测试必须通过
- 未经用户明确要求不 `git commit` / `git push`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/api/src/products/products.service.ts` | `remove(productId)` 业务校验与硬删除 |
| `apps/api/src/products/products.service.spec.ts` | remove 单元测试 |
| `apps/api/src/products/admin-products.controller.ts` | `DELETE :productId` + OpenAPI 契约 |
| `apps/api/src/products/admin-products.controller.spec.ts` | controller 委托测试（新增 describe） |
| `openapi/openapi.json` | 由 `pnpm api:spec` 生成 |
| `packages/api-client/src/schema.ts` | 由 `pnpm api:client` 生成 |
| `packages/api-client/src/client.ts` | ROUTES + `deleteAdminProduct` |
| `packages/api-client/src/client.test.ts` | 方法清单纳入 `deleteAdminProduct` |
| `apps/api/test/products.e2e-spec.ts` | 删除成功 / 上架拒绝 / 有订单拒绝 |
| `apps/web/app/(admin)/admin/products/page.tsx` | 删除按钮、确认流、刷新 |
| `apps/web/app/globals.css` | `admin-product-card__actions` |
| `apps/web/tests/admin-products-page.test.tsx` | 页面删除交互测试（新建） |
| `apps/web/tests/admin-pages.test.tsx` | 既有商品页 mock 补上 `deleteAdminProduct`（若类型收紧需要） |

---

### Task 1: ProductsService.remove（TDD）

**Files:**
- Modify: `apps/api/src/products/products.service.spec.ts`
- Modify: `apps/api/src/products/products.service.ts`

**Interfaces:**
- Produces: `ProductsService.remove(productId: string): Promise<{ success: true }>`
- Errors: `NotFoundException` `{ code: 'PRODUCT_NOT_FOUND', message: '商品不存在' }`；`ConflictException` `{ code: 'PRODUCT_ACTIVE', message: '请先下架再删除' }`；`ConflictException` `{ code: 'PRODUCT_HAS_ORDERS', message: '该商品已有订单，无法删除' }`

- [x] **Step 1: 扩展 createService mock，写入失败用例**

在 `products.service.spec.ts` 将 `createService` 扩展为可注入 `orderCount` 与 `deleteImpl`（保持既有 create/update 测试可用）。示意：

```ts
function createService(
  existing?: Record<string, unknown> | null,
  options: {
    orderCount?: number;
    deleteImpl?: () => Promise<unknown>;
  } = {},
) {
  const product = {
    create: ({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'task7-service-product',
        ...data,
      }),
    findUnique: () => Promise.resolve(existing ?? null),
    update: ({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        ...existing,
        ...data,
      }),
    delete: options.deleteImpl
      ? options.deleteImpl
      : ({ where }: { where: { id: string } }) =>
          Promise.resolve({ id: where.id, ...existing }),
  };
  const order = {
    count: () => Promise.resolve(options.orderCount ?? 0),
  };
  const transactionClient = {
    product,
    order,
    $queryRaw: () =>
      Promise.resolve(existing ? [{ id: existing.id as string }] : []),
  };
  return new ProductsService({
    product,
    order,
    $transaction: <T>(
      callback: (client: typeof transactionClient) => Promise<T>,
    ) => callback(transactionClient),
  } as never);
}
```

注意：既有调用 `createService(existingObject)` 的测试保持兼容（第二个参数可选）。`createService()` 无参时 `existing` 为 `undefined`，`findUnique` 返回 `null` 的行为若影响 create 测试，create 路径不依赖 findUnique，应仍通过。

新增用例（新 `describe('ProductsService.remove')`）：

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('ProductsService.remove', () => {
  const inactive = {
    id: 'prod-1',
    name: 'Badge',
    description: 'Reward',
    imageKey,
    stock: 1,
    pointsCost: 20,
    isActive: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('已下架且无订单时删除成功', async () => {
    const service = createService(inactive, { orderCount: 0 });
    await expect(service.remove('prod-1')).resolves.toEqual({ success: true });
  });

  it('不存在时 PRODUCT_NOT_FOUND', async () => {
    const service = createService(null);
    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove('missing')).rejects.toMatchObject({
      response: { code: 'PRODUCT_NOT_FOUND' },
    });
  });

  it('仍上架时 PRODUCT_ACTIVE', async () => {
    const service = createService({ ...inactive, isActive: true });
    await expect(service.remove('prod-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.remove('prod-1')).rejects.toMatchObject({
      response: { code: 'PRODUCT_ACTIVE' },
    });
  });

  it('有订单时 PRODUCT_HAS_ORDERS', async () => {
    const service = createService(inactive, { orderCount: 1 });
    await expect(service.remove('prod-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.remove('prod-1')).rejects.toMatchObject({
      response: { code: 'PRODUCT_HAS_ORDERS' },
    });
  });
});
```

- [x] **Step 2: 跑测试 — 期望 FAIL**

Run: `pnpm --filter @point-quest/api test -- products.service.spec`

Expected: FAIL（`remove` 不存在）

- [x] **Step 3: 实现 remove**

在 `products.service.ts` 增加：

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

function productActiveConflict(): ConflictException {
  return new ConflictException({
    code: 'PRODUCT_ACTIVE',
    message: '请先下架再删除',
  });
}

function productHasOrdersConflict(): ConflictException {
  return new ConflictException({
    code: 'PRODUCT_HAS_ORDERS',
    message: '该商品已有订单，无法删除',
  });
}
```

在 `ProductsService` 类中：

```ts
async remove(productId: string): Promise<{ success: true }> {
  const existing = await this.prisma.product.findUnique({
    where: { id: productId },
  });
  if (!existing) {
    throw productNotFound();
  }
  if (existing.isActive) {
    throw productActiveConflict();
  }
  const orderCount = await this.prisma.order.count({
    where: { productId },
  });
  if (orderCount > 0) {
    throw productHasOrdersConflict();
  }
  await this.prisma.product.delete({ where: { id: productId } });
  return { success: true };
}
```

- [x] **Step 4: 跑测试 — 期望 PASS**

Run: `pnpm --filter @point-quest/api test -- products.service.spec`

Expected: PASS

- [x] **Step 5: 不 commit**（除非用户要求）

---

### Task 2: Admin DELETE 路由 + OpenAPI + api-client

**Files:**
- Modify: `apps/api/src/products/admin-products.controller.ts`
- Modify: `apps/api/src/products/admin-products.controller.spec.ts`
- Generate: `openapi/openapi.json`、`packages/api-client/src/schema.ts`
- Modify: `packages/api-client/src/client.ts`
- Modify: `packages/api-client/src/client.test.ts`

**Interfaces:**
- Consumes: `ProductsService.remove(productId)`
- Produces: `DELETE /api/v1/admin/products/{productId}`，`operationId: adminDeleteProduct`；客户端 `deleteAdminProduct(productId: string)`

- [ ] **Step 1: 写 controller 委托失败测试**

在 `admin-products.controller.spec.ts` 追加：

```ts
import { AdminProductsController } from './admin-products.controller';

describe('AdminProductsController', () => {
  it('remove 委托 ProductsService.remove', async () => {
    const productsService = {
      remove: jest.fn().mockResolvedValue({ success: true }),
    };
    const controller = new AdminProductsController(productsService as never);
    await expect(controller.remove('prod-1')).resolves.toEqual({
      success: true,
    });
    expect(productsService.remove).toHaveBeenCalledWith('prod-1');
  });
});
```

（若文件顶部尚未导入 `AdminProductsController`，一并补上；保留既有 uploads 测试。）

- [ ] **Step 2: 跑测试 — 期望 FAIL**

Run: `pnpm --filter @point-quest/api test -- admin-products.controller.spec`

Expected: FAIL（无 `remove`）

- [ ] **Step 3: 实现 controller DELETE**

在 `admin-products.controller.ts`：

```ts
import {
  // ...existing
  Delete,
} from '@nestjs/common';
import {
  // ...existing
  SuccessResponseDto,
} from '../openapi/api-contract.models';

// 在 AdminProductsController 内 update 之后：
@Delete(':productId')
@ApiContract({
  operationId: 'adminDeleteProduct',
  summary: '删除已下架且无订单的商品',
  responseType: SuccessResponseDto,
  authenticated: true,
  mutation: true,
  params: [productIdParam],
})
remove(@Param('productId') productId: string) {
  return this.productsService.remove(productId);
}
```

- [ ] **Step 4: 重新生成 OpenAPI 与 schema**

Run:

```bash
pnpm api:spec
pnpm api:client
```

Expected: `openapi/openapi.json` 含 `adminDeleteProduct`；`packages/api-client/src/schema.ts` 更新。

- [ ] **Step 5: 手写 api-client 方法**

在 `packages/api-client/src/client.ts` 的 ROUTES 中，`adminUpdateProduct` 旁增加：

```ts
adminDeleteProduct: {
  path: "/api/v1/admin/products/{productId}",
  method: "DELETE",
},
```

在 `createApiClient` 返回对象中，`updateAdminProduct` 旁增加：

```ts
deleteAdminProduct: (productId: string) =>
  request("adminDeleteProduct", {
    authMode: "authenticated",
    pathParams: { productId },
  }),
```

在 `client.test.ts` 的排序方法清单中按字母序插入 `"deleteAdminProduct"`（位于 `deleteAdminAiTask` 与 `getAdminAiModel` 之间）。

- [ ] **Step 6: 跑测试 — 期望 PASS**

Run:

```bash
pnpm --filter @point-quest/api test -- admin-products.controller.spec
pnpm --filter @point-quest/api-client test
```

Expected: PASS

- [ ] **Step 7: 不 commit**（除非用户要求）

---

### Task 3: 商品删除 e2e

**Files:**
- Modify: `apps/api/test/products.e2e-spec.ts`

**Interfaces:**
- Consumes: `DELETE /api/v1/admin/products/:productId` 真实行为

- [ ] **Step 1: 替换「DELETE 期望 404」并补场景**

定位现有：

```ts
await request(requireServer())
  .delete(`/api/v1/admin/products/${first.id}`)
  .set('Authorization', adminBearer)
  .expect(404);
```

改为独立清晰用例（可拆成多个 `it`，或保留在同一管理员 CRUD 流末尾）：

**成功：** 先 PATCH 下架（若当前流中 `first` 已下架可直接删），再 DELETE 期望 200 `{ success: true }`，随后 `GET` 列表不再包含该 id，或 `findUnique` 为 null。

**仍上架拒绝：** 创建/使用上架商品，DELETE 期望 409 + `PRODUCT_ACTIVE`（`expectErrorContract`）。

**有订单拒绝：** 创建已下架商品并插入一条 `Order`（字段对齐 schema：`orderNo`、`userId`、`productId`、snapshots、`idempotencyKey` 等），DELETE 期望 409 + `PRODUCT_HAS_ORDERS`。示例订单创建：

```ts
await requirePrisma().order.create({
  data: {
    orderNo: `PQ-DEL-${testRunId}`,
    userId: studentId,
    productId: inactiveWithOrder.id,
    productNameSnapshot: inactiveWithOrder.name,
    productImageKeySnapshot: inactiveWithOrder.imageKey,
    pointsCostSnapshot: inactiveWithOrder.pointsCost,
    status: 'PENDING_PICKUP',
    idempotencyKey: `delete-guard-${testRunId}`,
  },
});
```

清理：沿用文件既有 `productIds` / order 清理逻辑；若新增 order，确保 `afterEach`/`afterAll` 能删掉（先删 order 再删 product）。

- [ ] **Step 2: 跑 e2e**

Run: `pnpm --filter @point-quest/api test:e2e -- products.e2e-spec`

Expected: PASS（需本地 test DB；若环境未起，按仓库 README/`db:test:reset` 准备）

- [ ] **Step 3: 不 commit**（除非用户要求）

---

### Task 4: 管理端商品页删除 UI（TDD）

**Files:**
- Create: `apps/web/tests/admin-products-page.test.tsx`
- Modify: `apps/web/app/(admin)/admin/products/page.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/tests/admin-pages.test.tsx`（商品相关 api mock 增加 `deleteAdminProduct: jest.fn()`，避免类型/多余字段问题）

**Interfaces:**
- Consumes: `api.deleteAdminProduct(productId: string) => Promise<{ success: true }>`
- Produces: 仅下架卡片显示删除；确认后调用 API；失败保留弹窗

- [ ] **Step 1: 写失败前端测试**

新建 `apps/web/tests/admin-products-page.test.tsx`，对齐 `admin-ai-models-page.test.tsx`：

```tsx
import { ApiNetworkError } from "@point-quest/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminProductsPage from "@/app/(admin)/admin/products/page";

const meta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };

const activeProduct = {
  createdAt: "2026-07-31T08:00:00.000Z",
  description: "英语学习奖励",
  id: "product-1",
  imageKey: "products/123e4567-e89b-42d3-a456-426614174000.png",
  isActive: true,
  name: "英语笔记本",
  pointsCost: 120,
  stock: 8,
  updatedAt: "2026-07-31T08:00:00.000Z",
};

const inactiveProduct = {
  ...activeProduct,
  id: "product-2",
  isActive: false,
  name: "下架贴纸",
};

function createApi(
  overrides: Partial<{
    listAdminProducts: jest.Mock;
    deleteAdminProduct: jest.Mock;
  }> = {},
) {
  return {
    createAdminProduct: jest.fn(),
    listAdminProducts: jest.fn().mockResolvedValue({
      data: [activeProduct, inactiveProduct],
      meta: { ...meta, total: 2 },
    }),
    updateAdminProduct: jest.fn(),
    uploadAdminProductImage: jest.fn(),
    deleteAdminProduct: jest.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

describe("AdminProductsPage 删除", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin/products");
  });

  it("上架商品不显示删除，下架商品显示删除", async () => {
    render(<AdminProductsPage api={createApi()} />);
    await screen.findByText("英语笔记本");
    expect(
      screen.queryByRole("button", { name: "删除" }),
    ).toBeInTheDocument();
    // 仅一件下架 → 只有一个删除按钮
    expect(screen.getAllByRole("button", { name: "删除" })).toHaveLength(1);
  });

  it("删除需确认后才调用 deleteAdminProduct", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminProductsPage api={api} />);
    await screen.findByText("下架贴纸");
    await user.click(screen.getByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认删除商品「下架贴纸」？",
    });
    expect(api.deleteAdminProduct).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "删除" }));
    await waitFor(() => {
      expect(api.deleteAdminProduct).toHaveBeenCalledWith("product-2");
      expect(screen.getByText("已删除")).toBeVisible();
    });
  });

  it("删除失败保留确认弹窗并展示错误", async () => {
    const user = userEvent.setup();
    const api = createApi({
      deleteAdminProduct: jest
        .fn()
        .mockRejectedValue(
          new ApiNetworkError("/api/v1/admin/products/product-2", "offline"),
        ),
    });
    render(<AdminProductsPage api={api} />);
    await screen.findByText("下架贴纸");
    await user.click(screen.getByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认删除商品「下架贴纸」？",
    });
    await user.click(within(dialog).getByRole("button", { name: "删除" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(
      screen.getByRole("dialog", { name: "确认删除商品「下架贴纸」？" }),
    ).toBeVisible();
  });

  it("取消删除不调用 deleteAdminProduct", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminProductsPage api={api} />);
    await screen.findByText("下架贴纸");
    await user.click(screen.getByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认删除商品「下架贴纸」？",
    });
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "确认删除商品「下架贴纸」？",
        }),
      ).toBeNull();
    });
    expect(api.deleteAdminProduct).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试 — 期望 FAIL**

Run: `pnpm --filter @point-quest/web test -- admin-products-page`

Expected: FAIL（无删除按钮 / 无确认流）

- [ ] **Step 3: 实现页面删除流**

在 `products/page.tsx`：

1. 增加 imports：`Trash2`、`ConfirmDialog`、`useConfirmAction`
2. `ProductsApi` 增加 `"deleteAdminProduct"`
3. 状态：`actionMessage`、`busyId`；类型 `ConfirmAction = { kind: "delete"; target: Product }`
4. `removeProduct` 与 AI 模型页同构：设 busy → `api.deleteAdminProduct` → `setActionMessage("已删除")` → `load()` → 成功返回 `null`，失败返回 `getApiErrorMessage`
5. `useConfirmAction({ blocked: Boolean(busyId), execute: (action) => removeProduct(action.target) })`
6. 渲染 `ConfirmDialog`：
   - title: ``确认删除商品「${confirmAction.target.name}」？``
   - description: `此操作不可撤销。仅已下架且无订单的商品可删除。`
   - confirmLabel: `删除`，`confirmVariant="danger"`
7. 卡片操作区：

```tsx
<div className="admin-product-card__actions">
  <Button
    disabled={busyId === product.id}
    fullWidth
    onClick={() => setEditing(product)}
    variant="secondary"
  >
    <Pencil aria-hidden="true" />
    编辑商品
  </Button>
  {!product.isActive ? (
    <Button
      disabled={busyId === product.id}
      fullWidth
      onClick={() => openConfirm({ kind: "delete", target: product })}
      variant="secondary"
    >
      <Trash2 aria-hidden="true" />
      删除
    </Button>
  ) : null}
</div>
```

8. 在筛选卡与列表之间（或参考 AI 模型页位置）渲染：

```tsx
{actionMessage ? (
  <p className="success-banner" role="status">
    {actionMessage}
  </p>
) : null}
```

成功提示与 AI 模型页一致：`<p className="success-banner" role="status">已删除</p>`。测试用 `getByText("已删除")`，避免与加载中 `role="status"` 冲突。

- [ ] **Step 4: CSS**

在 `globals.css` 的 `.admin-product-card__facts` 附近增加：

```css
.admin-product-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.admin-product-card__actions .pq-button {
  flex: 1;
}
```

在 `@media (max-width: 640px)` 中与 `admin-table__actions` 一并加入 `.admin-product-card__actions` 的 grid 全宽规则（若需要）。

- [ ] **Step 5: 修补 admin-pages 商品 mock**

凡构造商品页 `api` 对象处增加 `deleteAdminProduct: jest.fn()`。

- [ ] **Step 6: 跑测试 — 期望 PASS**

Run:

```bash
pnpm --filter @point-quest/web test -- admin-products-page
pnpm --filter @point-quest/web test -- admin-pages
```

Expected: PASS

- [ ] **Step 7: 不 commit**（除非用户要求）

---

### Task 5: 回归核对

**Files:** 无新文件

- [ ] **Step 1: 跑相关测试套件**

```bash
pnpm --filter @point-quest/api test -- products.service.spec
pnpm --filter @point-quest/api test -- admin-products.controller.spec
pnpm --filter @point-quest/api-client test
pnpm --filter @point-quest/web test -- admin-products-page
pnpm --filter @point-quest/web test -- admin-pages
```

可选（环境允许时）：

```bash
pnpm --filter @point-quest/api test:e2e -- products.e2e-spec
```

Expected: 全部 PASS

- [ ] **Step 2: 对照规格验收清单**

1. 仅已下架显示删除，二次确认后才请求  
2. 上架 / 有订单后端拒绝，弹窗可展示错误  
3. 测试通过  

- [ ] **Step 3: 请用户决定是否 commit**

---

## Spec Coverage Checklist

| 规格要求 | Task |
|----------|------|
| `DELETE` + `adminDeleteProduct` + `{ success: true }` | 2 |
| `PRODUCT_NOT_FOUND` / `PRODUCT_ACTIVE` / `PRODUCT_HAS_ORDERS` | 1, 3 |
| 硬删除、无软删、无级联、不删图 | 1（实现边界） |
| 仅下架显示删除按钮 | 4 |
| `useConfirmAction` + `ConfirmDialog`，失败保留弹窗 | 4 |
| 确认文案与「已删除」提示 | 4 |
| service / controller / e2e / 前端 / api-client 测试 | 1–5 |
