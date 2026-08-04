import { ApiNetworkError } from "@point-quest/api-client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProductForm } from "@/components/admin/product-form";

function createApi() {
  return {
    createAdminProduct: jest.fn(),
    updateAdminProduct: jest.fn(),
    uploadAdminProductImage: jest.fn(),
  };
}

async function fillProduct(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("商品名称"), "英语笔记本");
  await user.type(screen.getByLabelText("商品描述"), "适合记录生词");
  await user.clear(screen.getByLabelText("库存数量"));
  await user.type(screen.getByLabelText("库存数量"), "8");
  await user.clear(screen.getByLabelText("花费积分"));
  await user.type(screen.getByLabelText("花费积分"), "120");
}

describe("管理员商品表单", () => {
  it("校验必填名称、非负库存和正积分", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<ProductForm api={api} mode="create" />);
    await user.type(screen.getByLabelText("商品描述"), "商品说明");
    await user.clear(screen.getByLabelText("库存数量"));
    await user.type(screen.getByLabelText("库存数量"), "-1");
    await user.clear(screen.getByLabelText("花费积分"));
    await user.type(screen.getByLabelText("花费积分"), "0");

    await user.click(screen.getByRole("button", { name: "保存商品" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请输入商品名称");
    expect(screen.getByRole("alert")).toHaveTextContent("库存必须是非负整数");
    expect(screen.getByRole("alert")).toHaveTextContent("花费积分必须是正整数");
    expect(api.createAdminProduct).not.toHaveBeenCalled();
  });

  it.each([
    {
      file: new File(["plain"], "reward.txt", { type: "text/plain" }),
      message: "图片只支持 JPG、PNG 或 WebP",
    },
    {
      file: new File([new Uint8Array(5 * 1024 * 1024 + 1)], "reward.png", {
        type: "image/png",
      }),
      message: "图片不能超过 5 MB",
    },
  ])("上传前拒绝无效图片：$message", async ({ file, message }) => {
    const user = userEvent.setup({ applyAccept: false });
    const api = createApi();
    render(<ProductForm api={api} mode="create" />);
    await fillProduct(user);

    await user.upload(screen.getByLabelText("商品图片"), file);
    await user.click(screen.getByRole("button", { name: "保存商品" }));

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(api.uploadAdminProductImage).not.toHaveBeenCalled();
  });

  it("提交与上传期间通过 onPendingChange 上报 pending，完成后恢复 false", async () => {
    const user = userEvent.setup();
    const api = createApi();
    let resolveUpload!: (value: { key: string; url: string }) => void;
    let resolveCreate!: (value: { id: string }) => void;
    const uploadPromise = new Promise<{ key: string; url: string }>(
      (resolve) => {
        resolveUpload = resolve;
      },
    );
    const createPromise = new Promise<{ id: string }>((resolve) => {
      resolveCreate = resolve;
    });
    api.uploadAdminProductImage.mockReturnValue(uploadPromise);
    api.createAdminProduct.mockReturnValue(createPromise);

    const onPendingChange = jest.fn();
    render(
      <ProductForm api={api} mode="create" onPendingChange={onPendingChange} />,
    );
    await fillProduct(user);
    await user.upload(
      screen.getByLabelText("商品图片"),
      new File(["image"], "reward.png", { type: "image/png" }),
    );

    await user.click(screen.getByRole("button", { name: "保存商品" }));

    await waitFor(() => {
      expect(onPendingChange).toHaveBeenLastCalledWith(true);
    });

    resolveUpload({
      key: "products/550e8400-e29b-41d4-a716-446655440000.png",
      url: "/uploads/products/550e8400-e29b-41d4-a716-446655440000.png",
    });
    await waitFor(() => {
      expect(onPendingChange).toHaveBeenLastCalledWith(true);
    });

    resolveCreate({ id: "product-1" });
    await waitFor(() => {
      expect(onPendingChange).toHaveBeenLastCalledWith(false);
    });
    expect(await screen.findByText("商品已保存")).toBeVisible();
  });

  it("卸载时在 pending 期间通过 onPendingChange 重置为 false", async () => {
    const user = userEvent.setup();
    const api = createApi();
    let resolveUpdate!: (value: { id: string }) => void;
    const updatePromise = new Promise<{ id: string }>((resolve) => {
      resolveUpdate = resolve;
    });
    api.updateAdminProduct.mockReturnValue(updatePromise);

    const onPendingChange = jest.fn();
    const initialProduct = {
      id: "product-1",
      name: "英语笔记本",
      description: "适合记录生词",
      imageKey: "products/existing.png",
      stock: 8,
      pointsCost: 120,
      isActive: true,
    };
    const view = render(
      <ProductForm
        api={api}
        initialProduct={initialProduct}
        mode="edit"
        onPendingChange={onPendingChange}
        productId="product-1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "保存商品" }));
    await waitFor(() => {
      expect(onPendingChange).toHaveBeenLastCalledWith(true);
    });

    onPendingChange.mockClear();
    view.unmount();
    expect(onPendingChange).toHaveBeenCalledWith(false);
    resolveUpdate({ id: "product-1" });
  });

  it("上传失败保留商品字段并可原样重试", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.uploadAdminProductImage
      .mockRejectedValueOnce(
        new ApiNetworkError("/api/v1/admin/uploads/product-images", "offline"),
      )
      .mockResolvedValueOnce({
        key: "products/550e8400-e29b-41d4-a716-446655440000.png",
        url: "/uploads/products/550e8400-e29b-41d4-a716-446655440000.png",
      });
    api.createAdminProduct.mockResolvedValue({ id: "product-1" });
    render(<ProductForm api={api} mode="create" />);
    await fillProduct(user);
    const image = new File(["image"], "reward.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("商品图片"), image);

    await user.click(screen.getByRole("button", { name: "保存商品" }));

    expect(
      await screen.findByText("网络连接失败，请检查网络后重试"),
    ).toBeVisible();
    expect(screen.getByLabelText("商品名称")).toHaveValue("英语笔记本");
    expect(screen.getByLabelText("库存数量")).toHaveValue(8);

    await user.click(screen.getByRole("button", { name: "重试保存商品" }));
    expect(await screen.findByText("商品已保存")).toBeVisible();
    expect(api.uploadAdminProductImage).toHaveBeenCalledTimes(2);
    expect(api.createAdminProduct).toHaveBeenCalledWith({
      description: "适合记录生词",
      imageKey: "products/550e8400-e29b-41d4-a716-446655440000.png",
      isActive: true,
      name: "英语笔记本",
      pointsCost: 120,
      stock: 8,
    });
  });

  it("图片上传成功但商品保存失败时清空 File 并仅重试保存", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const createObjectUrl = jest.fn().mockReturnValue("blob:reward-preview");
    const revokeObjectUrl = jest.fn();
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
    api.uploadAdminProductImage.mockResolvedValue({
      key: "products/550e8400-e29b-41d4-a716-446655440000.png",
      url: "/uploads/products/550e8400-e29b-41d4-a716-446655440000.png",
    });
    api.createAdminProduct
      .mockRejectedValueOnce(
        new ApiNetworkError("/api/v1/admin/products", "offline"),
      )
      .mockResolvedValueOnce({ id: "product-1" });

    try {
      render(<ProductForm api={api} mode="create" />);
      await fillProduct(user);
      const input = screen.getByLabelText<HTMLInputElement>("商品图片");
      await user.upload(
        input,
        new File(["image"], "reward.png", { type: "image/png" }),
      );

      await user.click(screen.getByRole("button", { name: "保存商品" }));

      expect(
        await screen.findByText("网络连接失败，请检查网络后重试"),
      ).toBeVisible();
      expect(input.files).toHaveLength(0);
      expect(api.uploadAdminProductImage).toHaveBeenCalledTimes(1);
      expect(revokeObjectUrl).toHaveBeenCalledWith("blob:reward-preview");

      await user.click(screen.getByRole("button", { name: "重试保存商品" }));

      expect(await screen.findByText("商品已保存")).toBeVisible();
      expect(api.uploadAdminProductImage).toHaveBeenCalledTimes(1);
      expect(api.createAdminProduct).toHaveBeenCalledTimes(2);
    } finally {
      if (originalCreateObjectUrl) {
        Object.defineProperty(URL, "createObjectURL", {
          configurable: true,
          value: originalCreateObjectUrl,
        });
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
      if (originalRevokeObjectUrl) {
        Object.defineProperty(URL, "revokeObjectURL", {
          configurable: true,
          value: originalRevokeObjectUrl,
        });
      } else {
        Reflect.deleteProperty(URL, "revokeObjectURL");
      }
    }
  });
});
