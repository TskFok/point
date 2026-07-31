import {
  ApiClientError,
  ApiNetworkError,
} from "@point-quest/api-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";

import StorePage from "@/app/(student)/learn/store/page";

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

describe("积分商城页面", () => {
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
    expect(screen.getByLabelText("当前可用积分 120")).toBeVisible();
  });

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

    expect(
      await screen.findByLabelText("当前可用积分 50"),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("还差 30 积分")).toBeVisible();
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
});
