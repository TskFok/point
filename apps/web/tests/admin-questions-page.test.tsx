import { ApiNetworkError } from "@point-quest/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminQuestionsPage from "@/app/(admin)/admin/questions/page";

const meta = { page: 1, pageSize: 20, total: 3, totalPages: 1 };

const baseQuestion = {
  basePoints: 10,
  createdAt: "2026-07-31T08:00:00.000Z",
  createdBy: "admin-1",
  explanation: "Grammar.",
  options: [
    {
      content: "is",
      id: "option-1",
      isCorrect: true,
      label: "A",
      position: 0,
      questionId: "q-active",
    },
    {
      content: "are",
      id: "option-2",
      isCorrect: false,
      label: "B",
      position: 1,
      questionId: "q-active",
    },
  ],
  updatedAt: "2026-07-31T08:00:00.000Z",
};

const activeQuestion = {
  ...baseQuestion,
  hasAttempts: false,
  id: "q-active",
  isActive: true,
  stem: "启用中的题目",
};

const inactiveClean = {
  ...baseQuestion,
  hasAttempts: false,
  id: "q-inactive-clean",
  isActive: false,
  options: baseQuestion.options.map((option) => ({
    ...option,
    questionId: "q-inactive-clean",
  })),
  stem: "可删除的停用题",
};

const inactiveWithAttempts = {
  ...baseQuestion,
  hasAttempts: true,
  id: "q-inactive-used",
  isActive: false,
  options: baseQuestion.options.map((option) => ({
    ...option,
    questionId: "q-inactive-used",
  })),
  stem: "有记录的停用题",
};

function createApi(
  overrides: Partial<{
    listAdminQuestions: jest.Mock;
    deleteAdminQuestion: jest.Mock;
    updateAdminQuestion: jest.Mock;
  }> = {},
) {
  return {
    createAdminQuestion: jest.fn(),
    getAdminQuestion: jest.fn(),
    listAdminQuestions: jest.fn().mockResolvedValue({
      data: [activeQuestion, inactiveClean, inactiveWithAttempts],
      meta,
    }),
    updateAdminQuestion: jest.fn(),
    deleteAdminQuestion: jest.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

describe("AdminQuestionsPage 删除", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin/questions");
  });

  it("仅已停用且无答题记录显示删除", async () => {
    render(<AdminQuestionsPage api={createApi()} />);
    await screen.findByText("可删除的停用题");
    expect(screen.getAllByRole("button", { name: "删除" })).toHaveLength(1);
  });

  it("删除需确认后才调用 deleteAdminQuestion", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("可删除的停用题");
    await user.click(screen.getByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认删除题目「可删除的停用题」？",
    });
    expect(api.deleteAdminQuestion).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "删除" }));
    await waitFor(() => {
      expect(api.deleteAdminQuestion).toHaveBeenCalledWith("q-inactive-clean");
      expect(screen.getByText("已删除")).toBeVisible();
    });
  });

  it("删除失败保留确认弹窗并展示错误", async () => {
    const user = userEvent.setup();
    const api = createApi({
      deleteAdminQuestion: jest
        .fn()
        .mockRejectedValue(
          new ApiNetworkError(
            "/api/v1/admin/questions/q-inactive-clean",
            "offline",
          ),
        ),
    });
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("可删除的停用题");
    await user.click(screen.getByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认删除题目「可删除的停用题」？",
    });
    await user.click(within(dialog).getByRole("button", { name: "删除" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(
      screen.getByRole("dialog", {
        name: "确认删除题目「可删除的停用题」？",
      }),
    ).toBeVisible();
  });

  it("取消删除不调用 deleteAdminQuestion", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("可删除的停用题");
    await user.click(screen.getByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认删除题目「可删除的停用题」？",
    });
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "确认删除题目「可删除的停用题」？",
        }),
      ).toBeNull();
    });
    expect(api.deleteAdminQuestion).not.toHaveBeenCalled();
  });
});
