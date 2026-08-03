import { render, screen, waitFor } from "@testing-library/react";
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
  lastWord: "ability",
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
      lastWordBefore: "ability",
      lastWordAfter: "about",
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
          lastWordBefore: null,
          lastWordAfter: "ability",
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
  it("列表展示任务与游标", async () => {
    render(<AdminAiTasksPage api={createApi()} />);

    await waitFor(() => {
      expect(screen.getByText("每日词汇")).toBeInTheDocument();
    });
    expect(screen.getByText("gpt-test")).toBeInTheDocument();
    expect(screen.getByText("0 8 * * *")).toBeInTheDocument();
    expect(screen.getByText("ability")).toBeInTheDocument();
  });

  it("立即执行调用 runAdminAiTask", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminAiTasksPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("每日词汇")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "立即执行" }));

    await waitFor(() => {
      expect(api.runAdminAiTask).toHaveBeenCalledWith("task-1");
      expect(screen.getByRole("status")).toHaveTextContent("执行成功");
    });
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
