import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { QuestionForm } from "@/components/admin/question-form";

function createApi() {
  return {
    createAdminQuestion: jest.fn(),
    updateAdminQuestion: jest.fn(),
  };
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
