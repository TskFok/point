import { ApiNetworkError } from "@point-quest/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";

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
    batchAdminQuestions: jest.Mock;
    clearAdminQuestions: jest.Mock;
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
    clearAdminQuestions: jest.fn().mockResolvedValue({ deleted: 3 }),
    batchAdminQuestions: jest.fn().mockResolvedValue({
      succeeded: 1,
      skipped: 0,
      skippedByReason: {
        notFound: 0,
        alreadyTargetState: 0,
        hasAttempts: 0,
        stillActive: 0,
      },
    }),
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

describe("AdminQuestionsPage 批量操作", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin/questions");
  });

  it("勾选列加入后题干与操作列仍有防挤压布局类", async () => {
    const { container } = render(<AdminQuestionsPage api={createApi()} />);
    await screen.findByText("启用中的题目");
    const row = container.querySelector("tbody tr");
    expect(row).toBeTruthy();
    const cells = row!.querySelectorAll(":scope > td");
    expect(cells[0]).toHaveClass("admin-table__check");
    expect(cells[1]).toHaveClass("admin-table__primary");
    expect(cells[cells.length - 1]).toHaveClass("admin-table__actions-cell");
    expect(
      cells[cells.length - 1].querySelector(".admin-table__actions"),
    ).toBeTruthy();
  });

  it("admin-table CSS 在勾选列存在时仍约束主内容并保护操作列", () => {
    const css = readFileSync(
      path.join(__dirname, "../app/globals.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.admin-table__check\s*\{[^}]*min-width:\s*2\.5rem/s,
    );
    expect(css).toMatch(
      /\.admin-table__primary\s*\{[^}]*max-width:\s*31rem/s,
    );
    expect(css).toMatch(
      /\.admin-table__actions-cell\s*\{[^}]*white-space:\s*nowrap/s,
    );
    expect(css).not.toMatch(
      /\.admin-table td:first-child\s*\{\s*max-width:\s*31rem;\s*\}/,
    );
  });

  it("无勾选不显示批量工具条，勾选后显示", async () => {
    const user = userEvent.setup();
    render(<AdminQuestionsPage api={createApi()} />);
    await screen.findByText("可删除的停用题");
    expect(screen.queryByRole("region", { name: "批量操作" })).toBeNull();
    await user.click(
      screen.getByRole("checkbox", { name: "选择题目「可删除的停用题」" }),
    );
    expect(screen.getByRole("region", { name: "批量操作" })).toBeVisible();
    expect(screen.getByText("已选 1 道")).toBeVisible();
  });

  it("全选当前页选中全部题目", async () => {
    const user = userEvent.setup();
    render(<AdminQuestionsPage api={createApi()} />);
    await screen.findByText("可删除的停用题");
    await user.click(screen.getByRole("checkbox", { name: "全选当前页" }));
    expect(screen.getByText("已选 3 道")).toBeVisible();
  });

  it("翻页清空勾选", async () => {
    const user = userEvent.setup();
    const page1 = {
      data: [activeQuestion],
      meta: { page: 1, pageSize: 20, total: 2, totalPages: 2 },
    };
    const page2 = {
      data: [inactiveClean],
      meta: { page: 2, pageSize: 20, total: 2, totalPages: 2 },
    };
    const listAdminQuestions = jest
      .fn()
      .mockResolvedValueOnce(page1)
      .mockResolvedValue(page2);
    const api = createApi({ listAdminQuestions });
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("启用中的题目");
    await user.click(screen.getByRole("checkbox", { name: "全选当前页" }));
    expect(screen.getByText("已选 1 道")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await screen.findByText("可删除的停用题");
    expect(screen.queryByRole("region", { name: "批量操作" })).toBeNull();
  });

  it("批量启用不确认直接调用 API 并展示汇总", async () => {
    const user = userEvent.setup();
    const api = createApi({
      batchAdminQuestions: jest.fn().mockResolvedValue({
        succeeded: 1,
        skipped: 1,
        skippedByReason: {
          notFound: 0,
          alreadyTargetState: 1,
          hasAttempts: 0,
          stillActive: 0,
        },
      }),
    });
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("可删除的停用题");
    await user.click(
      screen.getByRole("checkbox", { name: "选择题目「可删除的停用题」" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "选择题目「启用中的题目」" }),
    );
    await user.click(screen.getByRole("button", { name: "批量启用" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => {
      expect(api.batchAdminQuestions).toHaveBeenCalledWith({
        action: "enable",
        ids: expect.arrayContaining(["q-inactive-clean", "q-active"]),
      });
      expect(screen.getByText("已启用 1 道，跳过 1 道")).toBeVisible();
    });
    expect(screen.queryByRole("region", { name: "批量操作" })).toBeNull();
  });

  it("批量删除需确认；未确认不调 API；确认后汇总", async () => {
    const user = userEvent.setup();
    const api = createApi({
      batchAdminQuestions: jest.fn().mockResolvedValue({
        succeeded: 1,
        skipped: 0,
        skippedByReason: {
          notFound: 0,
          alreadyTargetState: 0,
          hasAttempts: 0,
          stillActive: 0,
        },
      }),
    });
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("可删除的停用题");
    await user.click(
      screen.getByRole("checkbox", { name: "选择题目「可删除的停用题」" }),
    );
    await user.click(screen.getByRole("button", { name: "批量删除" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认删除选中的 1 道题目？",
    });
    expect(api.batchAdminQuestions).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "删除" }));
    await waitFor(() => {
      expect(api.batchAdminQuestions).toHaveBeenCalledWith({
        action: "delete",
        ids: ["q-inactive-clean"],
      });
      expect(screen.getByText("已删除 1 道")).toBeVisible();
    });
  });

  it("批量停用失败保留确认弹窗错误", async () => {
    const user = userEvent.setup();
    const api = createApi({
      batchAdminQuestions: jest
        .fn()
        .mockRejectedValue(
          new ApiNetworkError("/api/v1/admin/questions/batch", "offline"),
        ),
    });
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("启用中的题目");
    await user.click(
      screen.getByRole("checkbox", { name: "选择题目「启用中的题目」" }),
    );
    await user.click(screen.getByRole("button", { name: "批量停用" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认停用选中的 1 道题目？",
    });
    await user.click(within(dialog).getByRole("button", { name: "停用题目" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(
      screen.getByRole("dialog", { name: "确认停用选中的 1 道题目？" }),
    ).toBeVisible();
  });
});

describe("AdminQuestionsPage 语言筛选", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin/questions");
  });

  it("筛选选择日语后 listAdminQuestions 带 langCode ja", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("启用中的题目");

    await user.selectOptions(screen.getByLabelText("语言"), "ja");
    await user.click(screen.getByRole("button", { name: "应用筛选" }));

    await waitFor(() => {
      expect(api.listAdminQuestions).toHaveBeenCalledWith(
        expect.objectContaining({ langCode: "ja" }),
      );
    });
  });

  it("列表展示语言中文标签", async () => {
    const api = createApi({
      listAdminQuestions: jest.fn().mockResolvedValue({
        data: [{ ...activeQuestion, langCode: "ja" }],
        meta,
      }),
    });
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("启用中的题目");
    expect(
      screen.getByRole("columnheader", { name: "语言" }),
    ).toBeInTheDocument();
    const row = screen.getByText("启用中的题目").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("日语")).toBeVisible();
  });
});

describe("AdminQuestionsPage 清理题库", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin/questions");
  });

  it("展示清理题库按钮", async () => {
    const { container } = render(<AdminQuestionsPage api={createApi()} />);
    await screen.findByText("启用中的题目");
    const clearButton = screen.getByRole("button", { name: "清理题库" });
    expect(clearButton).toBeVisible();
    expect(clearButton).toHaveClass("pq-button--sm");
    const filterGrid = container.querySelector(".admin-filter-grid--questions");
    expect(filterGrid).not.toBeNull();
    const buttons = within(filterGrid as HTMLElement).getAllByRole("button");
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      "清理题库",
      "应用筛选",
      "添加题目",
    ]);
  });

  it("须输入清空题库后才调用 clearAdminQuestions", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("启用中的题目");
    await user.click(screen.getByRole("button", { name: "清理题库" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认清理题库？",
    });
    const confirm = within(dialog).getByRole("button", { name: "清理题库" });
    expect(confirm).toBeDisabled();
    expect(api.clearAdminQuestions).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText("确认文案"), "清空题库");
    await user.click(confirm);
    await waitFor(() => {
      expect(api.clearAdminQuestions).toHaveBeenCalledTimes(1);
      expect(screen.getByText("已清理 3 道题目")).toBeVisible();
    });
  });

  it("清理失败保留弹窗并展示错误", async () => {
    const user = userEvent.setup();
    const api = createApi({
      clearAdminQuestions: jest
        .fn()
        .mockRejectedValue(
          new ApiNetworkError("/api/v1/admin/questions/clear", "offline"),
        ),
    });
    render(<AdminQuestionsPage api={api} />);
    await screen.findByText("启用中的题目");
    await user.click(screen.getByRole("button", { name: "清理题库" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认清理题库？",
    });
    await user.type(within(dialog).getByLabelText("确认文案"), "清空题库");
    await user.click(
      within(dialog).getByRole("button", { name: "清理题库" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(
      screen.getByRole("dialog", { name: "确认清理题库？" }),
    ).toBeVisible();
  });
});
