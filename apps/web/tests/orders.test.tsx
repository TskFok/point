import { ApiNetworkError } from "@point-quest/api-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";

import OrdersPage from "@/app/(student)/learn/orders/page";

import {
  cancelledOrder,
  completedOrder,
  pageMeta,
  pendingOrder,
} from "./student-fixtures";

function createApi() {
  return {
    listOrders: jest.fn(),
  };
}

describe("学员订单页面", () => {
  it("开发 StrictMode 下不会重复加载同一页订单", async () => {
    const api = createApi();
    api.listOrders.mockResolvedValue({
      data: [pendingOrder],
      meta: pageMeta,
    });

    render(
      <StrictMode>
        <OrdersPage api={api} />
      </StrictMode>,
    );

    expect(await screen.findByText(pendingOrder.orderNo)).toBeVisible();
    expect(api.listOrders).toHaveBeenCalledTimes(1);
  });

  it("三个订单状态同时使用文字和可访问图标表达", async () => {
    const api = createApi();
    api.listOrders.mockResolvedValue({
      data: [pendingOrder, completedOrder, cancelledOrder],
      meta: { ...pageMeta, total: 3 },
    });

    const { container } = render(<OrdersPage api={api} />);

    expect(await screen.findByText("待领取")).toBeVisible();
    expect(screen.getByRole("img", { name: "待领取状态图标" })).toBeVisible();
    expect(screen.getByText("已完成")).toBeVisible();
    expect(screen.getByRole("img", { name: "已完成状态图标" })).toBeVisible();
    expect(screen.getByText("已取消")).toBeVisible();
    expect(screen.getByRole("img", { name: "已取消状态图标" })).toBeVisible();
    expect(container.querySelector(".page-heading")).toBeNull();
    expect(container.querySelector(".list-page__chrome")).toBeNull();
  });

  it("显示商品快照、花费积分、订单号和创建时间", async () => {
    const api = createApi();
    api.listOrders.mockResolvedValue({
      data: [pendingOrder],
      meta: pageMeta,
    });

    render(<OrdersPage api={api} />);

    expect(await screen.findByText("英语学习笔记本")).toBeVisible();
    expect(screen.getByText("花费 80 积分")).toBeVisible();
    expect(screen.getByText("PQ-PENDING")).toBeVisible();
    expect(screen.getByText(/2026/)).toBeVisible();
  });

  it("旧版 seed 订单图片快照不请求受限图片代理", async () => {
    const api = createApi();
    api.listOrders.mockResolvedValue({
      data: [
        {
          ...pendingOrder,
          productImageKeySnapshot:
            "seed/products/vocabulary-notebook.png",
        },
      ],
      meta: pageMeta,
    });

    render(<OrdersPage api={api} />);

    expect(
      await screen.findByRole("img", { name: "英语学习笔记本" }),
    ).toHaveAttribute("src", "/file.svg");
  });

  it("空订单和网络错误提供可恢复的下一步", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listOrders
      .mockRejectedValueOnce(new ApiNetworkError("/api/v1/orders", "offline"))
      .mockResolvedValueOnce({
        data: [],
        meta: { ...pageMeta, total: 0, totalPages: 0 },
      });

    render(<OrdersPage api={api} />);

    expect(
      await screen.findByText("网络连接失败，请检查网络后重试"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "重新加载" }));
    expect(
      await screen.findByRole("heading", { name: "还没有兑换订单" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "去积分商城看看" })).toHaveAttribute(
      "href",
      "/learn/store",
    );
  });
});
