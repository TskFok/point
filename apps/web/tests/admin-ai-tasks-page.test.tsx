import { ApiNetworkError } from "@point-quest/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminAiTasksPage from "@/app/(admin)/admin/ai-tasks/page";

const meta = {
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

const task = {
  id: "task-1",
  name: "每日词汇",
  aiModelConfigId: "model-1",
  aiModelName: "gpt-test",
  questionCount: 5,
  optionCount: 4,
  basePoints: 10,
  cronExpression: "0 8 * * *",
  isEnabled: true,
  lastEntryId: "20",
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T01:00:00.000Z",
  latestRun: {
    id: "run-1",
    status: "SUCCESS" as const,
    trigger: "MANUAL" as const,
    startedAt: "2026-08-03T01:00:00.000Z",
    finishedAt: "2026-08-03T01:01:00.000Z",
    questionsCreated: 5,
  },
};

function createApi(overrides: Record<string, unknown> = {}) {
  return {
    listAdminAiTasks: jest.fn().mockResolvedValue({ data: [task], meta }),
    createAdminAiTask: jest.fn(),
    updateAdminAiTask: jest.fn().mockResolvedValue({
      ...task,
      isEnabled: false,
    }),
    deleteAdminAiTask: jest.fn().mockResolvedValue({ success: true }),
    runAdminAiTask: jest.fn().mockResolvedValue({
      id: "run-2",
      aiTaskId: "task-1",
      trigger: "MANUAL",
      status: "SUCCESS",
      startedAt: "2026-08-03T02:00:00.000Z",
      finishedAt: "2026-08-03T02:01:00.000Z",
      questionsCreated: 3,
      lastEntryIdBefore: "20",
      lastEntryIdAfter: "30",
      errorMessage: null,
    }),
    listAdminAiTaskRuns: jest.fn().mockResolvedValue({
      data: [
        {
          id: "run-1",
          aiTaskId: "task-1",
          trigger: "MANUAL",
          status: "SUCCESS",
          startedAt: "2026-08-03T01:00:00.000Z",
          finishedAt: "2026-08-03T01:01:00.000Z",
          questionsCreated: 5,
          lastEntryIdBefore: null,
          lastEntryIdAfter: "20",
          errorMessage: null,
        },
      ],
      meta,
    }),
    listAdminAiModels: jest.fn().mockResolvedValue({
      data: [
        {
          id: "model-1",
          name: "gpt-test",
          baseUrl: "https://api.example.com/v1",
          apiKeyMasked: "••••abcd",
          isEnabled: true,
          createdAt: "2026-08-03T00:00:00.000Z",
          updatedAt: "2026-08-03T00:00:00.000Z",
        },
      ],
      meta,
    }),
    ...overrides,
  };
}

describe("管理员 AI 任务页", () => {
  it("新建任务按钮在页头右上角，点击打开表单弹窗", async () => {
    const user = userEvent.setup();
    const { container } = render(<AdminAiTasksPage api={createApi()} />);

    await screen.findByText("每日词汇");
    const heading = container.querySelector(".page-heading--split");
    expect(heading).not.toBeNull();
    const createButton = within(heading as HTMLElement).getByRole("button", {
      name: "新建任务",
    });
    await user.click(createButton);

    expect(
      await screen.findByRole("dialog", { name: "新建 AI 任务" }),
    ).toBeVisible();
  });

  it("列表展示任务与游标", async () => {
    render(<AdminAiTasksPage api={createApi()} />);

    await waitFor(() => {
      expect(screen.getByText("每日词汇")).toBeInTheDocument();
    });
    expect(screen.getByText("gpt-test")).toBeInTheDocument();
    expect(screen.getByText("0 8 * * *")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("操作列使用 admin-table__actions 布局", async () => {
    const { container } = render(<AdminAiTasksPage api={createApi()} />);

    await waitFor(() => {
      expect(screen.getByText("每日词汇")).toBeInTheDocument();
    });

    const actions = container.querySelector(".admin-table__actions");
    expect(actions).toBeTruthy();
    expect(actions?.querySelectorAll("button")).toHaveLength(5);
  });

  it("启用状态筛选使用 admin-filter-grid 约束选择框宽度", async () => {
    const { container } = render(<AdminAiTasksPage api={createApi()} />);

    await waitFor(() => {
      expect(screen.getByText("每日词汇")).toBeInTheDocument();
    });

    const filterGrid = container.querySelector(
      ".admin-filter-card .admin-filter-grid",
    );
    expect(filterGrid).toBeTruthy();
    expect(
      filterGrid?.querySelector('select, [aria-label="启用状态"]'),
    ).toBeTruthy();
    expect(container.querySelector(".admin-filter-card__row")).toBeNull();
  });

  it("立即执行需确认后才调用 runAdminAiTask", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminAiTasksPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("每日词汇")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "立即执行" }));

    const dialog = await screen.findByRole("dialog", {
      name: "确认立即执行「每日词汇」？",
    });
    expect(api.runAdminAiTask).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "立即执行" }));

    await waitFor(() => {
      expect(api.runAdminAiTask).toHaveBeenCalledWith("task-1");
      expect(screen.getByRole("status")).toHaveTextContent("执行成功");
    });
  });

  it("取消立即执行不调用 runAdminAiTask", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminAiTasksPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("每日词汇")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "立即执行" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认立即执行「每日词汇」？",
    });
    await user.click(within(dialog).getByRole("button", { name: "取消" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "确认立即执行「每日词汇」？" }),
      ).toBeNull();
    });
    expect(api.runAdminAiTask).not.toHaveBeenCalled();
  });

  it("删除需确认后才调用 deleteAdminAiTask", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminAiTasksPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("每日词汇")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "删除" }));

    const dialog = await screen.findByRole("dialog", {
      name: "确认删除任务「每日词汇」？",
    });
    expect(api.deleteAdminAiTask).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(api.deleteAdminAiTask).toHaveBeenCalledWith("task-1");
      expect(screen.getByRole("status")).toHaveTextContent("已删除");
    });
  });

  it("删除失败保留确认弹窗并展示错误", async () => {
    const user = userEvent.setup();
    const api = createApi({
      deleteAdminAiTask: jest
        .fn()
        .mockRejectedValue(
          new ApiNetworkError("/api/v1/admin/ai-tasks/task-1", "offline"),
        ),
    });
    render(<AdminAiTasksPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("每日词汇")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认删除任务「每日词汇」？",
    });
    await user.click(within(dialog).getByRole("button", { name: "删除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(
      screen.getByRole("dialog", { name: "确认删除任务「每日词汇」？" }),
    ).toBeVisible();
  });

  it("停用需确认后才调用 updateAdminAiTask", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminAiTasksPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("每日词汇")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "停用" }));

    const dialog = await screen.findByRole("dialog", {
      name: "确认停用任务「每日词汇」？",
    });
    expect(api.updateAdminAiTask).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "停用" }));

    await waitFor(() => {
      expect(api.updateAdminAiTask).toHaveBeenCalledWith("task-1", {
        isEnabled: false,
      });
      expect(screen.getByRole("status")).toHaveTextContent("已停用自动调度");
    });
  });

  it("停用失败保留确认弹窗并展示错误", async () => {
    const user = userEvent.setup();
    const api = createApi({
      updateAdminAiTask: jest
        .fn()
        .mockRejectedValue(
          new ApiNetworkError("/api/v1/admin/ai-tasks/task-1", "offline"),
        ),
    });
    render(<AdminAiTasksPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("每日词汇")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "停用" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认停用任务「每日词汇」？",
    });
    await user.click(within(dialog).getByRole("button", { name: "停用" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(
      screen.getByRole("dialog", { name: "确认停用任务「每日词汇」？" }),
    ).toBeVisible();
  });

  it("启用无需确认直接调用 updateAdminAiTask", async () => {
    const user = userEvent.setup();
    const disabledTask = { ...task, isEnabled: false };
    const api = createApi({
      listAdminAiTasks: jest
        .fn()
        .mockResolvedValue({ data: [disabledTask], meta }),
      updateAdminAiTask: jest.fn().mockResolvedValue({
        ...disabledTask,
        isEnabled: true,
      }),
    });
    render(<AdminAiTasksPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("每日词汇")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "启用" }));

    await waitFor(() => {
      expect(api.updateAdminAiTask).toHaveBeenCalledWith("task-1", {
        isEnabled: true,
      });
      expect(screen.getByRole("status")).toHaveTextContent("已启用自动调度");
    });
    expect(
      screen.queryByRole("dialog", { name: /确认停用|确认删除|确认立即执行/ }),
    ).toBeNull();
  });

  it("执行记录调用 listAdminAiTaskRuns", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminAiTasksPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("每日词汇")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "执行记录" }));

    await waitFor(() => {
      expect(api.listAdminAiTaskRuns).toHaveBeenCalledWith("task-1", {
        page: 1,
        pageSize: 20,
      });
      expect(screen.getByText("执行记录 · 每日词汇")).toBeInTheDocument();
    });
  });

  it("翻页时按 page 重新拉取列表并更新 URL", async () => {
    const user = userEvent.setup();
    const api = createApi({
      listAdminAiTasks: jest
        .fn()
        .mockResolvedValueOnce({
          data: [task],
          meta: { ...meta, total: 21, totalPages: 2 },
        })
        .mockResolvedValueOnce({
          data: [{ ...task, id: "task-2", name: "第二页任务" }],
          meta: { ...meta, page: 2, total: 21, totalPages: 2 },
        }),
    });
    window.history.replaceState(null, "", "/admin/ai-tasks");
    render(<AdminAiTasksPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("每日词汇")).toBeInTheDocument();
    });
    expect(screen.getByText("第 1 / 2 页")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() => {
      expect(api.listAdminAiTasks).toHaveBeenLastCalledWith({
        page: 2,
        pageSize: 20,
      });
      expect(screen.getByText("第二页任务")).toBeInTheDocument();
    });
    expect(window.location.search).toBe("?page=2");
  });
});
