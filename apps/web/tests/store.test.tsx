import {
  ApiClientError,
  ApiNetworkError,
} from "@point-quest/api-client";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";

import StorePage from "@/app/(student)/learn/store/page";
import { RedeemDialog } from "@/components/store/redeem-dialog";

import {
  pageMeta,
  pendingOrder,
  productOne,
  productOutOfStock,
} from "./student-fixtures";

function createApi() {
  return {
    createOrder: jest.fn(),
    getPointBalance: jest.fn(),
    listProducts: jest.fn(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("积分商城页面", () => {
  it("兑换弹窗参与服务端渲染时不访问 portal 宿主", () => {
    expect(() =>
      renderToString(
        <RedeemDialog
          balance={200}
          onCancel={jest.fn()}
          onConfirm={jest.fn()}
          product={productOne}
        />,
      ),
    ).not.toThrow();
  });

  it("开发 StrictMode 下不会重复加载同一页商品", async () => {
    const api = createApi();
    api.listProducts.mockResolvedValue({
      data: [productOne],
      meta: pageMeta,
    });

    render(
      <StrictMode>
        <StorePage api={api} initialBalance={200} />
      </StrictMode>,
    );

    expect(await screen.findByText(productOne.name)).toBeVisible();
    expect(api.listProducts).toHaveBeenCalledTimes(1);
  });

  it("积分不足时说明差额且不发送兑换请求", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listProducts.mockResolvedValue({
      data: [productOne],
      meta: pageMeta,
    });

    render(<StorePage api={api} initialBalance={50} />);

    await user.click(
      await screen.findByRole("button", { name: "兑换 80 积分" }),
    );
    expect(screen.getByText("还差 30 积分")).toBeVisible();
    expect(api.createOrder).not.toHaveBeenCalled();
  });

  it("确认兑换显示商品、花费和兑换后余额", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listProducts.mockResolvedValue({
      data: [productOne],
      meta: pageMeta,
    });
    api.createOrder.mockResolvedValue(pendingOrder);

    render(<StorePage api={api} initialBalance={200} />);

    await user.click(
      await screen.findByRole("button", { name: "兑换 80 积分" }),
    );
    const dialog = screen.getByRole("dialog", { name: "确认兑换商品" });
    expect(dialog).toHaveTextContent("英语学习笔记本");
    expect(dialog).toHaveTextContent("需要 80 积分");
    expect(dialog).toHaveTextContent("兑换后余额 120 积分");

    await user.click(screen.getByRole("button", { name: "确认兑换" }));
    expect(await screen.findByText("兑换成功，订单已生成")).toBeVisible();
  });

  it.each([
    { outcome: "SUCCESS_LAST", title: "成功兑换最后一件库存" },
    { outcome: "OUT_OF_STOCK", title: "服务端判定售罄" },
    { outcome: "PRODUCT_INACTIVE", title: "服务端判定商品下架" },
  ] as const)(
    "$title导致 opener 不可用时将焦点移到稳定页面目标",
    async ({ outcome }) => {
      const user = userEvent.setup();
      const api = createApi();
      const product = {
        ...productOne,
        stock: outcome === "SUCCESS_LAST" ? 1 : productOne.stock,
      };
      const firstPage = { data: [product], meta: pageMeta };
      if (outcome === "PRODUCT_INACTIVE") {
        api.listProducts
          .mockResolvedValueOnce(firstPage)
          .mockResolvedValueOnce({
            data: [],
            meta: { ...pageMeta, total: 0, totalPages: 0 },
          });
      } else {
        api.listProducts.mockResolvedValue(firstPage);
      }
      if (outcome === "SUCCESS_LAST") {
        api.createOrder.mockResolvedValue(pendingOrder);
      } else {
        api.createOrder.mockRejectedValue(
          new ApiClientError(409, {
            code: outcome,
            details: {},
            message:
              outcome === "OUT_OF_STOCK"
                ? "商品库存不足"
                : "商品已下架",
            requestId: `request-${outcome.toLowerCase()}`,
          }),
        );
      }

      const { container } = render(
        <StorePage api={api} initialBalance={200} />,
      );

      const opener = await screen.findByRole("button", {
        name: "兑换 80 积分",
      });
      const fallback = container.querySelector<HTMLElement>(
        ".list-page-focus-target",
      );
      expect(fallback).not.toBeNull();
      await user.click(opener);
      await user.click(screen.getByRole("button", { name: "确认兑换" }));

      if (outcome === "SUCCESS_LAST") {
        expect(
          await screen.findByText("兑换成功，订单已生成"),
        ).toBeVisible();
      } else if (outcome === "OUT_OF_STOCK") {
        expect(await screen.findByText("已售罄")).toBeVisible();
      } else {
        expect(
          await screen.findByRole("heading", {
            name: "商城正在补充奖励",
          }),
        ).toBeVisible();
      }
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      if (outcome === "PRODUCT_INACTIVE") {
        expect(opener).not.toBeInTheDocument();
      } else {
        expect(opener).toBeDisabled();
      }
      expect(fallback).toHaveAttribute("tabindex", "-1");
      expect(fallback).toHaveFocus();
      expect(document.body).not.toHaveFocus();
    },
  );

  it("兑换失败后重试复用原幂等键", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listProducts.mockResolvedValue({
      data: [productOne],
      meta: pageMeta,
    });
    api.createOrder
      .mockRejectedValueOnce(new ApiNetworkError("/api/v1/orders", "offline"))
      .mockResolvedValueOnce(pendingOrder);

    render(<StorePage api={api} initialBalance={200} />);

    await user.click(
      await screen.findByRole("button", { name: "兑换 80 积分" }),
    );
    await user.click(screen.getByRole("button", { name: "确认兑换" }));
    expect(
      await screen.findByText("网络连接失败，请检查网络后重试"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "重试兑换" }));

    expect(await screen.findByText("兑换成功，订单已生成")).toBeVisible();
    expect(api.createOrder).toHaveBeenCalledTimes(2);
    expect(api.createOrder.mock.calls[0][0].idempotencyKey).toBe(
      api.createOrder.mock.calls[1][0].idempotencyKey,
    );
  });

  it("兑换处理中保持焦点和背景隔离，且不能取消或替换兑换请求", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const orderRequest = deferred<typeof pendingOrder>();
    api.listProducts.mockResolvedValue({
      data: [productOne],
      meta: pageMeta,
    });
    api.createOrder.mockReturnValue(orderRequest.promise);

    const { container } = render(
      <StorePage api={api} initialBalance={200} />,
    );

    const opener = await screen.findByRole("button", {
      name: "兑换 80 积分",
    });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "确认兑换商品" });
    expect(dialog.closest(".dialog-layer")?.parentElement).toBe(
      document.body,
    );
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(container).toHaveAttribute("inert");

    await user.click(screen.getByRole("button", { name: "确认兑换" }));
    expect(await screen.findByText("正在兑换")).toBeVisible();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    opener.focus();
    fireEvent.focusIn(opener);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    fireEvent.click(screen.getByRole("button", { name: "关闭兑换确认" }));
    fireEvent.click(screen.getByRole("button", { name: "正在兑换" }));
    expect(screen.getByRole("dialog", { name: "确认兑换商品" })).toBeVisible();
    expect(api.createOrder).toHaveBeenCalledTimes(1);
    expect(api.createOrder.mock.calls[0][0]).toEqual({
      idempotencyKey: expect.any(String),
      productId: productOne.id,
    });

    orderRequest.resolve(pendingOrder);

    expect(await screen.findByText("兑换成功，订单已生成")).toBeVisible();
    expect(container).not.toHaveAttribute("aria-hidden");
    expect(container).not.toHaveAttribute("inert");
    expect(opener).toHaveFocus();
  });

  it("服务端发现积分变化时采用最新余额并关闭过期确认", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listProducts.mockResolvedValue({
      data: [productOne],
      meta: pageMeta,
    });
    api.createOrder.mockRejectedValue(
      new ApiClientError(409, {
        code: "INSUFFICIENT_POINTS",
        details: { balance: 50, required: 80 },
        message: "积分不足，当前还差 30 积分",
        requestId: "request-balance",
      }),
    );

    render(<StorePage api={api} initialBalance={200} />);

    await user.click(
      await screen.findByRole("button", { name: "兑换 80 积分" }),
    );
    await user.click(screen.getByRole("button", { name: "确认兑换" }));

    expect(await screen.findByText("还差 30 积分")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/当前可用积分/)).not.toBeInTheDocument();
  });

  it("服务端发现库存变化时立即将商品标为售罄", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listProducts.mockResolvedValue({
      data: [productOne],
      meta: pageMeta,
    });
    api.createOrder.mockRejectedValue(
      new ApiClientError(409, {
        code: "OUT_OF_STOCK",
        details: {},
        message: "商品库存不足",
        requestId: "request-stock",
      }),
    );

    render(<StorePage api={api} initialBalance={200} />);

    await user.click(
      await screen.findByRole("button", { name: "兑换 80 积分" }),
    );
    await user.click(screen.getByRole("button", { name: "确认兑换" }));

    expect(await screen.findByText("已售罄")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "暂时无库存" })).toBeDisabled();
  });

  it("库存为零时使用文字说明并禁用兑换", async () => {
    const api = createApi();
    api.listProducts.mockResolvedValue({
      data: [productOutOfStock],
      meta: pageMeta,
    });

    render(<StorePage api={api} initialBalance={500} />);

    expect(await screen.findByText("已售罄")).toBeVisible();
    expect(screen.getByRole("button", { name: "暂时无库存" })).toBeDisabled();
  });

  it("商品为空和加载失败都有明确状态", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listProducts
      .mockRejectedValueOnce(
        new ApiNetworkError("/api/v1/products", "offline"),
      )
      .mockResolvedValueOnce({
        data: [],
        meta: { ...pageMeta, total: 0, totalPages: 0 },
      });

    render(<StorePage api={api} initialBalance={200} />);

    expect(
      await screen.findByText("网络连接失败，请检查网络后重试"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "重新加载" }));
    expect(
      await screen.findByRole("heading", { name: "商城正在补充奖励" }),
    ).toBeVisible();
  });

  it("商城分页在 paginated-panel 底栏且不在滚动体内", async () => {
    const api = createApi();
    api.listProducts.mockResolvedValue({
      data: [productOne],
      meta: { ...pageMeta, page: 1, total: 2, totalPages: 2 },
    });

    const { container } = render(
      <StorePage api={api} initialBalance={200} />,
    );

    await screen.findByRole("navigation", { name: "分页" });

    const panel = container.querySelector(".paginated-panel");
    const body = panel?.querySelector(":scope > .paginated-panel__body");
    const nav = panel?.querySelector(':scope > nav[aria-label="分页"]');
    expect(panel).not.toBeNull();
    expect(body).not.toBeNull();
    expect(nav).not.toBeNull();
    expect(body?.contains(nav as Node)).toBe(false);
    expect(body?.querySelector(".product-grid")).not.toBeNull();

    const chrome = container.querySelector(".list-page__chrome");
    expect(chrome).not.toBeNull();
    expect(chrome?.querySelector(".page-heading")).toBeNull();
    expect(chrome?.querySelector(".balance-card")).toBeNull();
    expect(chrome?.querySelector(".list-page-focus-target")).not.toBeNull();
    expect(body?.contains(chrome as Node)).toBe(false);
    expect(chrome?.contains(nav as Node)).toBe(false);
  });

  it("失效商品使末页越界时回退并重新加载最后一个有效页", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const lastPageProduct = {
      ...productOne,
      id: "product-last-page",
      name: "末页限定奖励",
    };
    api.listProducts
      .mockResolvedValueOnce({
        data: [productOne],
        meta: { ...pageMeta, page: 1, total: 2, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        data: [lastPageProduct],
        meta: { ...pageMeta, page: 2, total: 2, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        data: [],
        meta: { ...pageMeta, page: 2, total: 1, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        data: [productOne],
        meta: { ...pageMeta, page: 1, total: 1, totalPages: 1 },
      });
    api.createOrder.mockRejectedValue(
      new ApiClientError(409, {
        code: "PRODUCT_INACTIVE",
        details: {},
        message: "商品已下架",
        requestId: "request-inactive",
      }),
    );

    render(<StorePage api={api} initialBalance={200} />);

    await user.click(await screen.findByRole("button", { name: "下一页" }));
    expect(await screen.findByText(lastPageProduct.name)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "兑换 80 积分" }));
    await user.click(screen.getByRole("button", { name: "确认兑换" }));

    expect(await screen.findByText(productOne.name)).toBeVisible();
    expect(api.listProducts.mock.calls).toEqual([
      [{ page: 1, pageSize: 12 }],
      [{ page: 2, pageSize: 12 }],
      [{ page: 2, pageSize: 12 }],
      [{ page: 1, pageSize: 12 }],
    ]);
  });

  it("旧版 seed 商品图片键回退到本地占位图", async () => {
    const api = createApi();
    api.listProducts.mockResolvedValue({
      data: [
        {
          ...productOne,
          imageKey: "seed/products/vocabulary-notebook.png",
        },
      ],
      meta: pageMeta,
    });

    render(<StorePage api={api} initialBalance={200} />);

    expect(
      await screen.findByRole("img", { name: productOne.name }),
    ).toHaveAttribute("src", "/file.svg");
  });
});
