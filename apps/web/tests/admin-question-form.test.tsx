import { ApiClientError, ApiNetworkError } from "@point-quest/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { QuestionForm } from "@/components/admin/question-form";

async function confirmDisableQuestion(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(screen.getByRole("button", { name: "停用已有记录题目" }));
  const dialog = await screen.findByRole("dialog", {
    name: "确认停用该题目？",
  });
  await user.click(within(dialog).getByRole("button", { name: "停用题目" }));
}

function createApi() {
  return {
    createAdminQuestion: jest.fn(),
    updateAdminQuestion: jest.fn(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function fillRequiredQuestion(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("题干"), "Choose the correct word.");
  await user.type(
    screen.getByLabelText("题目解析"),
    "The subject is singular.",
  );
  await user.clear(screen.getByLabelText("基础积分"));
  await user.type(screen.getByLabelText("基础积分"), "10");
  await user.type(screen.getByLabelText("选项 A 内容"), "is");
  await user.type(screen.getByLabelText("选项 B 内容"), "are");
}

describe("管理员题目表单", () => {
  it("将操作区放在滚动区外", () => {
    const { container } = render(
      <QuestionForm
        api={createApi()}
        mode="create"
      />,
    );
    const form = container.querySelector(".admin-form");
    const scroll = form?.querySelector(":scope > .admin-form__scroll");
    const actions = form?.querySelector(":scope > .admin-form__actions");
    expect(scroll).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(scroll?.contains(screen.getByLabelText("题干"))).toBe(true);
    expect(scroll?.contains(actions as Node)).toBe(false);
  });

  it("启用题目选项占据单独一行", () => {
    render(
      <QuestionForm
        api={createApi()}
        mode="create"
      />,
    );
    const enable = screen.getByRole("checkbox", { name: "启用题目" });
    expect(enable.closest("label")).toHaveClass("admin-field--wide");
  });

  it("已有答题记录时字段只读且停用只发送 isActive false", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const existingQuestion = {
      basePoints: 10,
      createdAt: "2026-07-31T08:00:00.000Z",
      createdBy: "admin-1",
      explanation: "Singular subject.",
      hasAttempts: true,
      id: "question-used",
      isActive: true,
      options: [
        {
          content: "is",
          id: "option-1",
          isCorrect: true,
          label: "A",
          position: 0,
          questionId: "question-used",
        },
        {
          content: "are",
          id: "option-2",
          isCorrect: false,
          label: "B",
          position: 1,
          questionId: "question-used",
        },
      ],
      stem: "She ___ a student.",
      updatedAt: "2026-07-31T08:00:00.000Z",
    };
    api.updateAdminQuestion.mockResolvedValue({
      ...existingQuestion,
      isActive: false,
    });

    render(
      <QuestionForm
        api={api}
        initialQuestion={existingQuestion as never}
        mode="edit"
      />,
    );

    expect(screen.getByLabelText("题干")).toBeDisabled();
    expect(screen.getByLabelText("基础积分")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "保存题目" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "停用已有记录题目" }));
    expect(
      await screen.findByRole("dialog", { name: "确认停用该题目？" }),
    ).toBeVisible();
    expect(api.updateAdminQuestion).not.toHaveBeenCalled();

    await user.click(
      within(
        screen.getByRole("dialog", { name: "确认停用该题目？" }),
      ).getByRole("button", { name: "停用题目" }),
    );

    expect(api.updateAdminQuestion).toHaveBeenCalledWith("question-used", {
      isActive: false,
    });
    expect(api.updateAdminQuestion).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("题目已停用")).toBeVisible();
  });

  it("停用确认失败保留弹窗并展示错误，可重试", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.updateAdminQuestion
      .mockRejectedValueOnce(
        new ApiNetworkError("/api/v1/admin/questions/question-used", "offline"),
      )
      .mockResolvedValueOnce({
        basePoints: 10,
        createdAt: "2026-07-31T08:00:00.000Z",
        createdBy: "admin-1",
        explanation: "Singular subject.",
        hasAttempts: true,
        id: "question-used",
        isActive: false,
        options: [
          {
            content: "is",
            id: "opt-a",
            isCorrect: true,
            label: "A",
            position: 0,
          },
          {
            content: "are",
            id: "opt-b",
            isCorrect: false,
            label: "B",
            position: 1,
          },
        ],
        stem: "She ___ a student.",
        updatedAt: "2026-07-31T08:00:00.000Z",
      });
    const existingQuestion = {
      basePoints: 10,
      createdAt: "2026-07-31T08:00:00.000Z",
      createdBy: "admin-1",
      explanation: "Singular subject.",
      hasAttempts: true,
      id: "question-used",
      isActive: true,
      options: [
        {
          content: "is",
          id: "opt-a",
          isCorrect: true,
          label: "A",
          position: 0,
        },
        {
          content: "are",
          id: "opt-b",
          isCorrect: false,
          label: "B",
          position: 1,
        },
      ],
      stem: "She ___ a student.",
      updatedAt: "2026-07-31T08:00:00.000Z",
    };
    render(
      <QuestionForm
        api={api}
        initialQuestion={existingQuestion as never}
        mode="edit"
        questionId="question-used"
      />,
    );

    await user.click(screen.getByRole("button", { name: "停用已有记录题目" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认停用该题目？",
    });
    await user.click(within(dialog).getByRole("button", { name: "停用题目" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(
      screen.getByRole("dialog", { name: "确认停用该题目？" }),
    ).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "停用题目" }));
    expect(await screen.findByText("题目已停用")).toBeVisible();
    expect(api.updateAdminQuestion).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog", { name: "确认停用该题目？" })).toBeNull();
  });

  it("保存时才发现答题记录后切换只读并仅允许停用", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const existingQuestion = {
      basePoints: 10,
      createdAt: "2026-07-31T08:00:00.000Z",
      createdBy: "admin-1",
      explanation: "Singular subject.",
      hasAttempts: false,
      id: "question-race",
      isActive: true,
      options: [
        {
          content: "is",
          id: "option-1",
          isCorrect: true,
          label: "A",
          position: 0,
          questionId: "question-race",
        },
        {
          content: "are",
          id: "option-2",
          isCorrect: false,
          label: "B",
          position: 1,
          questionId: "question-race",
        },
      ],
      stem: "She ___ a student.",
      updatedAt: "2026-07-31T08:00:00.000Z",
    };
    api.updateAdminQuestion
      .mockRejectedValueOnce(
        new ApiClientError(409, {
          code: "QUESTION_HAS_ATTEMPTS",
          details: {},
          message: "已有答题记录的题目只能停用",
          requestId: "request-1",
        }),
      )
      .mockResolvedValueOnce({
        ...existingQuestion,
        hasAttempts: true,
        isActive: false,
      });
    render(
      <QuestionForm api={api} initialQuestion={existingQuestion} mode="edit" />,
    );

    await user.click(screen.getByRole("button", { name: "保存题目" }));

    expect(
      await screen.findByText(
        "题目已有答题记录，内容已切换为只读；你仍可停用题目",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("题干")).toBeDisabled();

    await confirmDisableQuestion(user);
    expect(api.updateAdminQuestion).toHaveBeenNthCalledWith(
      2,
      "question-race",
      { isActive: false },
    );
  });

  it("题目必须有 2 至 6 个选项且只能选择一个正确答案", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<QuestionForm api={api} mode="create" />);
    await fillRequiredQuestion(user);

    await user.click(screen.getByRole("button", { name: "保存题目" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "请选择且只能选择一个正确答案",
    );
    expect(api.createAdminQuestion).not.toHaveBeenCalled();
  });

  it("阻止重复标签、超长内容和非整数积分", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<QuestionForm api={api} mode="create" />);
    await fillRequiredQuestion(user);
    await user.clear(screen.getByLabelText("基础积分"));
    await user.type(screen.getByLabelText("基础积分"), "1.5");
    await user.clear(screen.getByLabelText("选项 B 标签"));
    await user.type(screen.getByLabelText("选项 B 标签"), "A");
    await user.click(screen.getByLabelText("将选项 A 设为正确答案"));

    await user.click(screen.getByRole("button", { name: "保存题目" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "基础积分必须是 1–1000 的整数",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("选项标签不能重复");
    expect(api.createAdminQuestion).not.toHaveBeenCalled();
  });

  it("按 API DTO 位置顺序提交 2–6 个唯一选项", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.createAdminQuestion.mockResolvedValue({ id: "question-1" });
    const onSaved = jest.fn();
    render(<QuestionForm api={api} mode="create" onSaved={onSaved} />);
    await fillRequiredQuestion(user);
    await user.click(screen.getByLabelText("将选项 A 设为正确答案"));

    await user.click(screen.getByRole("button", { name: "保存题目" }));

    expect(api.createAdminQuestion).toHaveBeenCalledWith({
      basePoints: 10,
      explanation: "The subject is singular.",
      isActive: true,
      langCode: "en",
      options: [
        {
          content: "is",
          isCorrect: true,
          label: "A",
          position: 0,
        },
        {
          content: "are",
          isCorrect: false,
          label: "B",
          position: 1,
        },
      ],
      stem: "Choose the correct word.",
    });
    expect(await screen.findByText("题目已保存")).toBeVisible();
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ id: "question-1" }),
    );
  });

  it("创建题目提交 langCode", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.createAdminQuestion.mockResolvedValue({
      id: "q1",
      langCode: "it",
    });
    render(<QuestionForm api={api} mode="create" />);
    await fillRequiredQuestion(user);
    await user.selectOptions(screen.getByLabelText("语言"), "it");
    await user.click(screen.getByLabelText("将选项 A 设为正确答案"));

    await user.click(screen.getByRole("button", { name: "保存题目" }));

    await waitFor(() =>
      expect(api.createAdminQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ langCode: "it" }),
      ),
    );
  });
  it("保存期间通知父组件阻止关闭弹窗", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const response = deferred<{ id: string }>();
    const onPendingChange = jest.fn();
    api.createAdminQuestion.mockReturnValue(response.promise);
    render(
      <QuestionForm
        api={api}
        mode="create"
        onPendingChange={onPendingChange}
      />,
    );
    await fillRequiredQuestion(user);
    await user.click(screen.getByLabelText("将选项 A 设为正确答案"));

    await user.click(screen.getByRole("button", { name: "保存题目" }));

    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(true));
    response.resolve({ id: "question-1" });
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(false));
  });

  it("最多允许六个选项且始终保留至少两个", async () => {
    const user = userEvent.setup();
    render(<QuestionForm api={createApi()} mode="create" />);

    for (let count = 0; count < 4; count += 1) {
      await user.click(screen.getByRole("button", { name: "添加选项" }));
    }
    expect(screen.getAllByRole("group", { name: /选项 [A-F]/ })).toHaveLength(
      6,
    );
    expect(screen.getByRole("button", { name: "添加选项" })).toBeDisabled();

    for (const button of screen.getAllByRole("button", { name: /删除选项/ })) {
      if (!button.hasAttribute("disabled")) await user.click(button);
    }
    expect(screen.getAllByRole("group", { name: /选项 [A-F]/ })).toHaveLength(
      2,
    );
  });
});
