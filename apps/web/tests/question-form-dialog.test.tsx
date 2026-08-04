import { act, render, screen, waitFor } from "@testing-library/react";

import { QuestionFormDialog } from "@/components/admin/question-form-dialog";

const question = {
  id: "question-1",
  stem: "She ___ finished.",
  explanation: "singular",
  basePoints: 10,
  isActive: true,
  hasAttempts: false,
  createdAt: "2026-07-31T08:00:00.000Z",
  createdBy: "admin-1",
  updatedAt: "2026-07-31T08:00:00.000Z",
  options: [
    {
      id: "option-1",
      questionId: "question-1",
      label: "A",
      content: "has",
      position: 0,
      isCorrect: true,
    },
    {
      id: "option-2",
      questionId: "question-1",
      label: "B",
      content: "have",
      position: 1,
      isCorrect: false,
    },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("QuestionFormDialog", () => {
  it("创建模式直接展示表单弹窗", async () => {
    render(
      <QuestionFormDialog
        api={{
          createAdminQuestion: jest.fn(),
          getAdminQuestion: jest.fn(),
          updateAdminQuestion: jest.fn(),
        }}
        mode="create"
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    expect(
      await screen.findByRole("dialog", { name: "添加英语选择题" }),
    ).toBeVisible();
    expect(screen.getByLabelText("题干")).toBeVisible();
  });

  it("编辑模式先拉取详情再展示表单", async () => {
    const request = deferred<typeof question>();
    const getAdminQuestion = jest.fn().mockReturnValue(request.promise);
    render(
      <QuestionFormDialog
        api={{
          createAdminQuestion: jest.fn(),
          getAdminQuestion,
          updateAdminQuestion: jest.fn(),
        }}
        mode="edit"
        onClose={jest.fn()}
        onSaved={jest.fn()}
        questionId="question-1"
      />,
    );

    await waitFor(() => {
      expect(getAdminQuestion).toHaveBeenCalledWith("question-1");
    });
    expect(await screen.findByText(/正在加载题目/)).toBeVisible();
    await act(async () => {
      request.resolve(question);
    });
    expect(
      await screen.findByRole("dialog", { name: "编辑英语选择题" }),
    ).toBeVisible();
    expect(screen.getByLabelText("题干")).toHaveValue(question.stem);
  });

  it("切换编辑目标后忽略较晚返回的旧题目详情", async () => {
    const question1Request = deferred<typeof question>();
    const question2Request = deferred<typeof question>();
    const question2 = {
      ...question,
      id: "question-2",
      stem: "They ___ ready.",
      options: question.options.map((option) => ({
        ...option,
        id: option.id.replace("1", "2"),
        questionId: "question-2",
      })),
    };
    const getAdminQuestion = jest.fn((questionId: string) =>
      questionId === "question-1"
        ? question1Request.promise
        : question2Request.promise,
    );
    const api = {
      createAdminQuestion: jest.fn(),
      getAdminQuestion,
      updateAdminQuestion: jest.fn(),
    };
    const { rerender } = render(
      <QuestionFormDialog
        api={api}
        mode="edit"
        onClose={jest.fn()}
        onSaved={jest.fn()}
        questionId="question-1"
      />,
    );

    await waitFor(() => {
      expect(getAdminQuestion).toHaveBeenCalledWith("question-1");
    });
    rerender(
      <QuestionFormDialog
        api={api}
        mode="edit"
        onClose={jest.fn()}
        onSaved={jest.fn()}
        questionId="question-2"
      />,
    );
    await waitFor(() => {
      expect(getAdminQuestion).toHaveBeenCalledWith("question-2");
    });

    await act(async () => {
      question2Request.resolve(question2);
    });
    expect(await screen.findByLabelText("题干")).toHaveValue(question2.stem);

    await act(async () => {
      question1Request.resolve(question);
    });
    expect(screen.getByLabelText("题干")).toHaveValue(question2.stem);
  });
});
