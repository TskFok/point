import { ApiNetworkError } from "@point-quest/api-client";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminOrdersPage from "@/app/(admin)/admin/orders/page";

const pendingOrder = {
  balance: 80,
  cancelledAt: null,
  completedAt: null,
  createdAt: "2026-07-31T08:30:00.000Z",
  id: "order-1",
  orderNo: "PQ-ADMIN-1",
  pointsCostSnapshot: 120,
  productId: "product-1",
  productImageKeySnapshot: "products/550e8400-e29b-41d4-a716-446655440000.png",
  productNameSnapshot: "英语笔记本",
  status: "PENDING_PICKUP" as const,
  updatedBy: null,
  user: { id: "student-1", username: "student_01" },
  userId: "student-1",
};
const meta = {
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

function createApi() {
  return {
    cancelAdminOrder: jest.fn(),
    completeAdminOrder: jest.fn(),
    listAdminOrders: jest.fn().mockResolvedValue({
      data: [pendingOrder],
      meta,
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("管理员订单页面", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin/orders");
  });

  it("日期筛选转换为带 +08:00 时区的完整 ISO 且写入 URL", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminOrdersPage api={api} />);
    await screen.findByText("PQ-ADMIN-1");

    await user.type(screen.getByLabelText("开始日期"), "2026-07-01");
    await user.type(screen.getByLabelText("结束日期"), "2026-07-31");
    await user.click(screen.getByRole("button", { name: "应用筛选" }));

    await waitFor(() =>
      expect(api.listAdminOrders).toHaveBeenLastCalledWith({
        createdFrom: "2026-07-01T00:00:00.000+08:00",
        createdTo: "2026-07-31T23:59:59.999+08:00",
        page: 1,
        pageSize: 20,
      }),
    );
    expect(window.location.search).toContain("createdFrom=2026-07-01");
    expect(window.location.search).toContain("createdTo=2026-07-31");
  });

  it("取消订单前确认并在成功后显示已取消", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.cancelAdminOrder.mockResolvedValue({
      ...pendingOrder,
      cancelledAt: "2026-07-31T09:00:00.000Z",
      status: "CANCELLED",
    });
    api.listAdminOrders
      .mockResolvedValueOnce({
        data: [pendingOrder],
        meta,
      })
      .mockResolvedValueOnce({
        data: [
          {
            ...pendingOrder,
            cancelledAt: "2026-07-31T09:00:00.000Z",
            status: "CANCELLED",
          },
        ],
        meta,
      });
    const { container } = render(<AdminOrdersPage api={api} />);
    const opener = await screen.findByRole("button", { name: "取消订单" });

    expect(container.querySelector(".page-heading")).toBeNull();
    expect(
      within(container.querySelector(".admin-filter-card") as HTMLElement).queryByText(
        "当前结果",
      ),
    ).toBeNull();

    await user.click(opener);
    expect(screen.getByRole("dialog", { name: "确认取消订单" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "确认取消并退款" }));

    expect(
      await screen.findByText("订单已取消，积分与库存已退回"),
    ).toBeVisible();
    expect(screen.getByRole("img", { name: "已取消状态图标" })).toBeVisible();
    const fallback = container.querySelector(
      ".admin-filter-focus-target",
    ) as HTMLElement | null;
    expect(fallback).not.toBeNull();
    expect(opener).not.toBeInTheDocument();
    await waitFor(() => expect(fallback).toHaveFocus());
  });

  it("订单操作中隔离背景、锁住焦点并阻止重复请求", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const request = deferred<{
      status: "COMPLETED";
      completedAt: string;
    }>();
    api.completeAdminOrder.mockReturnValue(request.promise);
    const { container } = render(<AdminOrdersPage api={api} />);
    const opener = await screen.findByRole("button", { name: "完成订单" });

    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "确认完成订单" }));
    const dialog = screen.getByRole("dialog", { name: "确认完成订单" });
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(container).toHaveAttribute("inert");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    fireEvent.click(screen.getByRole("button", { name: "正在处理" }));
    await user.keyboard("{Escape}");
    expect(api.completeAdminOrder).toHaveBeenCalledTimes(1);
    expect(dialog).toBeVisible();

    request.resolve({
      ...pendingOrder,
      completedAt: "2026-07-31T09:00:00.000Z",
      status: "COMPLETED",
    });
    expect(await screen.findByText("订单已完成，可交付商品")).toBeVisible();
    expect(container).not.toHaveAttribute("aria-hidden");
    expect(container).not.toHaveAttribute("inert");
  });

  it("网络失败保留确认上下文并支持重试", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.cancelAdminOrder
      .mockRejectedValueOnce(
        new ApiNetworkError("/api/v1/admin/orders/order-1/cancel", "offline"),
      )
      .mockResolvedValueOnce({
        ...pendingOrder,
        cancelledAt: "2026-07-31T09:00:00.000Z",
        status: "CANCELLED",
      });
    render(<AdminOrdersPage api={api} />);
    await user.click(await screen.findByRole("button", { name: "取消订单" }));
    await user.click(screen.getByRole("button", { name: "确认取消并退款" }));

    expect(
      await screen.findByText("网络连接失败，请检查网络后重试"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "重试取消并退款" }));
    expect(
      await screen.findByText("订单已取消，积分与库存已退回"),
    ).toBeVisible();
    expect(api.cancelAdminOrder).toHaveBeenCalledTimes(2);
  });

  it("第二页最后一条取消后按当前筛选重载并回到有效末页", async () => {
    const user = userEvent.setup();
    const replacement = {
      ...pendingOrder,
      id: "order-replacement",
      orderNo: "PQ-ADMIN-REPLACEMENT",
    };
    const api = createApi();
    api.listAdminOrders
      .mockReset()
      .mockResolvedValueOnce({
        data: [pendingOrder],
        meta: { ...meta, page: 2, total: 21, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        data: [],
        meta: { ...meta, page: 2, total: 20, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        data: [replacement],
        meta: { ...meta, page: 1, total: 20, totalPages: 1 },
      });
    api.cancelAdminOrder.mockResolvedValue({
      ...pendingOrder,
      cancelledAt: "2026-07-31T09:00:00.000Z",
      status: "CANCELLED",
    });
    window.history.replaceState(
      null,
      "",
      "/admin/orders?status=PENDING_PICKUP&page=2",
    );
    render(<AdminOrdersPage api={api} />);

    await user.click(await screen.findByRole("button", { name: "取消订单" }));
    await user.click(screen.getByRole("button", { name: "确认取消并退款" }));

    expect(await screen.findByText("PQ-ADMIN-REPLACEMENT")).toBeVisible();
    expect(api.listAdminOrders).toHaveBeenNthCalledWith(2, {
      page: 2,
      pageSize: 20,
      status: "PENDING_PICKUP",
    });
    expect(api.listAdminOrders).toHaveBeenNthCalledWith(3, {
      page: 1,
      pageSize: 20,
      status: "PENDING_PICKUP",
    });
    expect(window.location.search).toBe("?status=PENDING_PICKUP");
  });
});
