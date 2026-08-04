import { render, screen, waitFor } from "@testing-library/react";

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
    const getAdminQuestion = jest.fn().mockResolvedValue(question);
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

    expect(screen.getByText(/正在加载题目/)).toBeVisible();
    await waitFor(() => {
      expect(getAdminQuestion).toHaveBeenCalledWith("question-1");
    });
    expect(
      await screen.findByRole("dialog", { name: "编辑英语选择题" }),
    ).toBeVisible();
    expect(screen.getByLabelText("题干")).toHaveValue(question.stem);
  });
});
