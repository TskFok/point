import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminDashboardPage from "@/app/(admin)/admin/page";
import AdminPointsPage from "@/app/(admin)/admin/points/page";
import AdminProductsPage from "@/app/(admin)/admin/products/page";
import AdminQuestionsPage from "@/app/(admin)/admin/questions/page";

const meta = {
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

const question = {
  basePoints: 10,
  createdAt: "2026-07-31T08:00:00.000Z",
  createdBy: "admin-1",
  explanation: "Singular subject.",
  id: "question-1",
  isActive: true,
  options: [
    {
      content: "is",
      id: "option-1",
      isCorrect: true,
      label: "A",
      position: 0,
      questionId: "question-1",
    },
    {
      content: "are",
      id: "option-2",
      isCorrect: false,
      label: "B",
      position: 1,
      questionId: "question-1",
    },
  ],
  stem: "She ___ a student.",
  updatedAt: "2026-07-31T08:00:00.000Z",
};

const product = {
  createdAt: "2026-07-31T08:00:00.000Z",
  description: "英语学习奖励",
  id: "product-1",
  imageKey: "seed/unsafe-image.png",
  isActive: true,
  name: "英语笔记本",
  pointsCost: 120,
  stock: 8,
  updatedAt: "2026-07-31T08:00:00.000Z",
};

describe("管理员运营页面", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin");
  });

  it("概览显示四项真实运营指标", async () => {
    const api = {
      getAdminDashboard: jest.fn().mockResolvedValue({
        activeProductCount: 6,
        activeQuestionCount: 12,
        pendingOrderCount: 5,
        todayAnswerCount: 34,
      }),
    };
    render(<AdminDashboardPage api={api} />);

    expect(await screen.findByText("12")).toBeVisible();
    expect(screen.getByText("34")).toBeVisible();
    expect(screen.getByText("5")).toBeVisible();
    expect(screen.getByText("6")).toBeVisible();
    expect(screen.getByText("启用题目")).toBeVisible();
    expect(screen.getByText("今日答题")).toBeVisible();
  });

  it("题库搜索、状态与分页写入 URL 并保留到编辑链接", async () => {
    const user = userEvent.setup();
    const api = {
      listAdminQuestions: jest.fn().mockResolvedValue({
        data: [question],
        meta,
      }),
      updateAdminQuestion: jest.fn(),
    };
    window.history.replaceState(null, "", "/admin/questions?page=2");
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText(question.stem);

    await user.type(screen.getByLabelText("搜索题目"), "singular");
    await user.selectOptions(screen.getByLabelText("启用状态"), "true");
    await user.click(screen.getByRole("button", { name: "应用筛选" }));

    await waitFor(() =>
      expect(api.listAdminQuestions).toHaveBeenLastCalledWith({
        isActive: true,
        page: 1,
        pageSize: 20,
        search: "singular",
      }),
    );
    expect(window.location.search).toContain("search=singular");
    expect(window.location.search).toContain("isActive=true");
    expect(screen.getByRole("link", { name: "编辑题目" })).toHaveAttribute(
      "href",
      expect.stringContaining("returnTo="),
    );
  });

  it("题库停用成功后同步文字与图标状态", async () => {
    const user = userEvent.setup();
    const api = {
      listAdminQuestions: jest.fn().mockResolvedValue({
        data: [question],
        meta,
      }),
      updateAdminQuestion: jest.fn().mockResolvedValue({
        ...question,
        isActive: false,
      }),
    };
    window.history.replaceState(null, "", "/admin/questions");
    render(<AdminQuestionsPage api={api} />);

    await user.click(await screen.findByRole("button", { name: "停用题目" }));
    expect(api.updateAdminQuestion).toHaveBeenCalledWith("question-1", {
      isActive: false,
    });
    expect(
      await screen.findByRole("img", { name: "已停用状态图标" }),
    ).toBeVisible();
  });

  it("倍率限制为 1–10 整数并刷新配置历史", async () => {
    const user = userEvent.setup();
    const config = {
      createdAt: "2026-07-31T08:00:00.000Z",
      id: "config-1",
      multiplier: 2,
      updatedBy: "admin-1",
      updater: { id: "admin-1", username: "admin" },
    };
    const api = {
      getAdminPointConfig: jest.fn().mockResolvedValue(config),
      listAdminPointConfigHistory: jest.fn().mockResolvedValue({
        data: [config],
        meta,
      }),
      updateAdminPointConfig: jest.fn().mockResolvedValue({
        ...config,
        id: "config-2",
        multiplier: 3,
      }),
    };
    render(<AdminPointsPage api={api} />);
    const input = await screen.findByLabelText("积分倍率");

    await user.clear(input);
    await user.type(input, "11");
    await user.click(screen.getByRole("button", { name: "保存倍率" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "积分倍率必须是 1–10 的整数",
    );
    expect(api.updateAdminPointConfig).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "3");
    await user.click(screen.getByRole("button", { name: "保存倍率" }));
    expect(await screen.findByText("倍率已更新为 3×")).toBeVisible();
    expect(api.updateAdminPointConfig).toHaveBeenCalledWith({ multiplier: 3 });
  });

  it("倍率历史从 URL 恢复分页并在翻页后更新 URL", async () => {
    const user = userEvent.setup();
    const config = {
      createdAt: "2026-07-31T08:00:00.000Z",
      id: "config-1",
      multiplier: 2,
      updatedBy: "admin-1",
      updater: { id: "admin-1", username: "admin" },
    };
    const api = {
      getAdminPointConfig: jest.fn().mockResolvedValue(config),
      listAdminPointConfigHistory: jest
        .fn()
        .mockImplementation(({ page }: { page: number }) =>
          Promise.resolve({
            data: [config],
            meta: { ...meta, page, total: 60, totalPages: 3 },
          }),
        ),
      updateAdminPointConfig: jest.fn(),
    };
    window.history.replaceState(null, "", "/admin/points?page=2");
    render(<AdminPointsPage api={api} />);

    await waitFor(() =>
      expect(api.listAdminPointConfigHistory).toHaveBeenCalledWith({
        page: 2,
        pageSize: 20,
      }),
    );
    expect(window.location.search).toBe("?page=2");

    await user.click(await screen.findByRole("button", { name: "上一页" }));
    await waitFor(() =>
      expect(api.listAdminPointConfigHistory).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
      }),
    );
    expect(window.location.search).toBe("");
  });

  it("商品列表安全回退不受信任图片并可打开新增表单", async () => {
    const user = userEvent.setup();
    const api = {
      createAdminProduct: jest.fn(),
      listAdminProducts: jest.fn().mockResolvedValue({
        data: [product],
        meta,
      }),
      updateAdminProduct: jest.fn(),
      uploadAdminProductImage: jest.fn(),
    };
    window.history.replaceState(null, "", "/admin/products");
    render(<AdminProductsPage api={api} />);

    expect(
      await screen.findByRole("img", { name: product.name }),
    ).toHaveAttribute("src", "/file.svg");
    expect(screen.getByText("库存 8")).toBeVisible();
    expect(screen.getByText("120 积分")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "添加商品" }));
    expect(screen.getByRole("heading", { name: "添加新商品" })).toBeVisible();
    expect(screen.getByLabelText("商品名称")).toBeVisible();
  });
});
