import { ApiNetworkError } from "@point-quest/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminDashboardPage from "@/app/(admin)/admin/page";
import AdminPointsPage from "@/app/(admin)/admin/points/page";
import AdminProductsPage from "@/app/(admin)/admin/products/page";
import AdminQuestionsPage from "@/app/(admin)/admin/questions/page";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const meta = {
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

const question = {
  basePoints: 10,
  createdAt: "2026-07-31T08:00:00.000Z",
  createdBy: "admin-1",
  explanation: "Singular subject.",
  hasAttempts: false,
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
    mockPush.mockClear();
    sessionStorage.clear();
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

  it("概览快捷入口标记并跳转到题库创建弹窗", async () => {
    const user = userEvent.setup();
    render(
      <AdminDashboardPage
        api={{
          getAdminDashboard: jest.fn().mockResolvedValue({
            activeProductCount: 6,
            activeQuestionCount: 12,
            pendingOrderCount: 5,
            todayAnswerCount: 34,
          }),
        }}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "添加英语题目" }),
    );

    expect(sessionStorage.getItem("admin-questions-open-create")).toBe("1");
    expect(mockPush).toHaveBeenCalledWith("/admin/questions");
  });

  it("题库搜索、状态与分页写入 URL 并使用按钮编辑", async () => {
    const user = userEvent.setup();
    const api = {
      createAdminQuestion: jest.fn(),
      deleteAdminQuestion: jest.fn(),
      getAdminQuestion: jest.fn(),
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
    expect(screen.getByRole("button", { name: "编辑题目" })).toBeVisible();
  });

  it("读取 sessionStorage 后自动打开新建题目弹窗", async () => {
    sessionStorage.setItem("admin-questions-open-create", "1");
    const api = {
      createAdminQuestion: jest.fn(),
      deleteAdminQuestion: jest.fn(),
      getAdminQuestion: jest.fn(),
      listAdminQuestions: jest.fn().mockResolvedValue({
        data: [question],
        meta,
      }),
      updateAdminQuestion: jest.fn(),
    };
    window.history.replaceState(null, "", "/admin/questions");

    render(<AdminQuestionsPage api={api} />);

    expect(
      await screen.findByRole("dialog", { name: "添加英语选择题" }),
    ).toBeVisible();
    expect(sessionStorage.getItem("admin-questions-open-create")).toBeNull();
  });

  it("题库停用成功后同步文字与图标状态", async () => {
    const user = userEvent.setup();
    const api = {
      createAdminQuestion: jest.fn(),
      deleteAdminQuestion: jest.fn(),
      getAdminQuestion: jest.fn(),
      listAdminQuestions: jest
        .fn()
        .mockResolvedValueOnce({
          data: [question],
          meta,
        })
        .mockResolvedValueOnce({
          data: [{ ...question, isActive: false }],
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
    const dialog = await screen.findByRole("dialog", {
      name: "确认停用该题目？",
    });
    expect(api.updateAdminQuestion).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "停用题目" }));
    expect(api.updateAdminQuestion).toHaveBeenCalledWith("question-1", {
      isActive: false,
    });
    expect(
      await screen.findByRole("img", { name: "已停用状态图标" }),
    ).toBeVisible();
    expect(api.listAdminQuestions).toHaveBeenCalledTimes(2);
  });

  it("题库停用失败保留确认弹窗并展示错误", async () => {
    const user = userEvent.setup();
    const api = {
      createAdminQuestion: jest.fn(),
      deleteAdminQuestion: jest.fn(),
      getAdminQuestion: jest.fn(),
      listAdminQuestions: jest.fn().mockResolvedValue({
        data: [question],
        meta,
      }),
      updateAdminQuestion: jest
        .fn()
        .mockRejectedValue(
          new ApiNetworkError("/api/v1/admin/questions/question-1", "offline"),
        ),
    };
    window.history.replaceState(null, "", "/admin/questions");
    render(<AdminQuestionsPage api={api} />);

    await user.click(await screen.findByRole("button", { name: "停用题目" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认停用该题目？",
    });
    await user.click(within(dialog).getByRole("button", { name: "停用题目" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(
      screen.getByRole("dialog", { name: "确认停用该题目？" }),
    ).toBeVisible();
  });

  it("题库第二页最后一条停用后按当前筛选重载并回到有效末页", async () => {
    const user = userEvent.setup();
    const replacement = {
      ...question,
      id: "question-replacement",
      stem: "Replacement question",
    };
    const api = {
      createAdminQuestion: jest.fn(),
      deleteAdminQuestion: jest.fn(),
      getAdminQuestion: jest.fn(),
      listAdminQuestions: jest
        .fn()
        .mockResolvedValueOnce({
          data: [question],
          meta: { ...meta, page: 2, total: 21, totalPages: 2 },
        })
        .mockResolvedValueOnce({
          data: [],
          meta: { ...meta, page: 2, total: 20, totalPages: 1 },
        })
        .mockResolvedValueOnce({
          data: [replacement],
          meta: { ...meta, page: 1, total: 20, totalPages: 1 },
        }),
      updateAdminQuestion: jest.fn().mockResolvedValue({
        ...question,
        isActive: false,
      }),
    };
    window.history.replaceState(
      null,
      "",
      "/admin/questions?isActive=true&page=2",
    );
    render(<AdminQuestionsPage api={api} />);

    await user.click(await screen.findByRole("button", { name: "停用题目" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认停用该题目？",
    });
    await user.click(within(dialog).getByRole("button", { name: "停用题目" }));

    expect(await screen.findByText("Replacement question")).toBeVisible();
    expect(api.listAdminQuestions).toHaveBeenNthCalledWith(2, {
      isActive: true,
      page: 2,
      pageSize: 20,
    });
    expect(api.listAdminQuestions).toHaveBeenNthCalledWith(3, {
      isActive: true,
      page: 1,
      pageSize: 20,
    });
    expect(window.location.search).toBe("?isActive=true");
  });

  it("题库中已有答题记录的停用题目不能重新启用", async () => {
    const api = {
      createAdminQuestion: jest.fn(),
      deleteAdminQuestion: jest.fn(),
      getAdminQuestion: jest.fn(),
      listAdminQuestions: jest.fn().mockResolvedValue({
        data: [{ ...question, hasAttempts: true, isActive: false }],
        meta,
      }),
      updateAdminQuestion: jest.fn(),
    };
    window.history.replaceState(null, "", "/admin/questions");
    render(<AdminQuestionsPage api={api} />);

    expect(
      await screen.findByRole("button", { name: "已有记录不可启用" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "启用题目" }),
    ).not.toBeInTheDocument();
    expect(api.updateAdminQuestion).not.toHaveBeenCalled();
  });

  it("页头使用 page-heading--split 并展示当前倍率", async () => {
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
      updateAdminPointConfig: jest.fn(),
    };
    const { container } = render(<AdminPointsPage api={api} />);

    const heading = container.querySelector(".page-heading--split");
    expect(heading).not.toBeNull();
    expect(
      within(heading as HTMLElement).getByRole("heading", { name: "积分倍率" }),
    ).toBeVisible();
    expect(
      await within(heading as HTMLElement).findByText("2×"),
    ).toBeVisible();
    expect(within(heading as HTMLElement).getByText("当前倍率")).toBeVisible();
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

  it("倍率保存切回第一页时忽略后到的第二页响应并显示历史加载态", async () => {
    const user = userEvent.setup();
    const initialConfig = {
      createdAt: "2026-07-31T08:00:00.000Z",
      id: "config-initial",
      multiplier: 2,
      updatedBy: "admin-1",
      updater: { id: "admin-1", username: "initial_admin" },
    };
    const savedConfig = {
      ...initialConfig,
      createdAt: "2026-07-31T09:00:00.000Z",
      id: "config-saved",
      multiplier: 3,
      updater: { id: "admin-1", username: "new_admin" },
    };
    const staleConfig = {
      ...initialConfig,
      id: "config-stale-page-2",
      updater: { id: "admin-1", username: "stale_admin" },
    };
    const page2 = deferred<{
      data: (typeof initialConfig)[];
      meta: typeof meta;
    }>();
    const refreshedPage1 = deferred<{
      data: (typeof initialConfig)[];
      meta: typeof meta;
    }>();
    const api = {
      getAdminPointConfig: jest
        .fn()
        .mockResolvedValueOnce(initialConfig)
        .mockResolvedValueOnce(initialConfig)
        .mockResolvedValue(savedConfig),
      listAdminPointConfigHistory: jest
        .fn()
        .mockResolvedValueOnce({
          data: [initialConfig],
          meta: { ...meta, total: 21, totalPages: 2 },
        })
        .mockReturnValueOnce(page2.promise)
        .mockReturnValueOnce(refreshedPage1.promise),
      updateAdminPointConfig: jest.fn().mockResolvedValue(savedConfig),
    };
    window.history.replaceState(null, "", "/admin/points");
    render(<AdminPointsPage api={api} />);
    await screen.findByText("initial_admin");

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(
      await screen.findByRole("status", { name: "正在加载倍率历史" }),
    ).toBeVisible();

    const multiplier = screen.getByLabelText("积分倍率");
    await user.clear(multiplier);
    await user.type(multiplier, "3");
    await user.click(screen.getByRole("button", { name: "保存倍率" }));
    await waitFor(() =>
      expect(api.listAdminPointConfigHistory).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
      }),
    );

    refreshedPage1.resolve({
      data: [savedConfig],
      meta,
    });
    expect(await screen.findByText("new_admin")).toBeVisible();

    page2.resolve({
      data: [staleConfig],
      meta: { ...meta, page: 2, total: 21, totalPages: 2 },
    });
    await waitFor(() =>
      expect(screen.queryByText("stale_admin")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("new_admin")).toBeVisible();
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
      deleteAdminProduct: jest.fn(),
    };
    window.history.replaceState(null, "", "/admin/products");
    render(<AdminProductsPage api={api} />);

    expect(
      await screen.findByRole("img", { name: product.name }),
    ).toHaveAttribute("src", "/file.svg");
    expect(screen.getByText("库存 8")).toBeVisible();
    expect(screen.getByText("120 积分")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "添加商品" }));
    expect(
      screen.getByRole("dialog", { name: "添加新商品" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "添加新商品" })).toBeVisible();
    expect(screen.getByLabelText("商品名称")).toBeVisible();
  });

  it("商品编辑从 A 切换到 B 时完整重置表单状态", async () => {
    const user = userEvent.setup();
    const secondProduct = {
      ...product,
      id: "product-2",
      name: "英语帆布袋",
      stock: 3,
    };
    const api = {
      createAdminProduct: jest.fn(),
      listAdminProducts: jest.fn().mockResolvedValue({
        data: [product, secondProduct],
        meta: { ...meta, total: 2 },
      }),
      updateAdminProduct: jest.fn(),
      uploadAdminProductImage: jest.fn(),
      deleteAdminProduct: jest.fn(),
    };
    window.history.replaceState(null, "", "/admin/products");
    render(<AdminProductsPage api={api} />);
    await screen.findByText(product.name);

    const editButtons = screen.getAllByRole("button", { name: "编辑商品" });
    await user.click(editButtons[0]);
    const dialog = screen.getByRole("dialog", {
      name: `编辑 ${product.name}`,
    });
    await user.clear(within(dialog).getByLabelText("商品名称"));
    await user.type(
      within(dialog).getByLabelText("商品名称"),
      "A 的未保存内容",
    );

    await user.click(editButtons[1]);

    const switchedDialog = screen.getByRole("dialog", {
      name: `编辑 ${secondProduct.name}`,
    });
    expect(within(switchedDialog).getByLabelText("商品名称")).toHaveValue(
      "英语帆布袋",
    );
    expect(within(switchedDialog).getByLabelText("库存数量")).toHaveValue(3);
  });

  it("商品第二页最后一条保存后按当前筛选重载并回到有效末页", async () => {
    const user = userEvent.setup();
    const replacement = {
      ...product,
      id: "product-replacement",
      name: "英语贴纸",
    };
    const api = {
      createAdminProduct: jest.fn(),
      listAdminProducts: jest
        .fn()
        .mockResolvedValueOnce({
          data: [product],
          meta: { ...meta, page: 2, total: 21, totalPages: 2 },
        })
        .mockResolvedValueOnce({
          data: [],
          meta: { ...meta, page: 2, total: 20, totalPages: 1 },
        })
        .mockResolvedValueOnce({
          data: [replacement],
          meta: { ...meta, page: 1, total: 20, totalPages: 1 },
        }),
      updateAdminProduct: jest.fn().mockResolvedValue({
        ...product,
        isActive: false,
      }),
      uploadAdminProductImage: jest.fn(),
      deleteAdminProduct: jest.fn(),
    };
    window.history.replaceState(
      null,
      "",
      "/admin/products?search=%E8%8B%B1%E8%AF%AD&isActive=true&page=2",
    );
    render(<AdminProductsPage api={api} />);

    await user.click(await screen.findByRole("button", { name: "编辑商品" }));
    await user.click(screen.getByRole("checkbox", { name: "上架商品" }));
    await user.click(screen.getByRole("button", { name: "保存商品" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认下架商品「英语笔记本」？",
    });
    await user.click(within(dialog).getByRole("button", { name: "下架商品" }));

    expect(await screen.findByText("英语贴纸")).toBeVisible();
    expect(api.listAdminProducts).toHaveBeenNthCalledWith(2, {
      isActive: true,
      page: 2,
      pageSize: 20,
      search: "英语",
    });
    expect(api.listAdminProducts).toHaveBeenNthCalledWith(3, {
      isActive: true,
      page: 1,
      pageSize: 20,
      search: "英语",
    });
    expect(window.location.search).toContain("search=%E8%8B%B1%E8%AF%AD");
    expect(window.location.search).toContain("isActive=true");
    expect(window.location.search).not.toContain("page=2");
  });
});
