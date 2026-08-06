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
