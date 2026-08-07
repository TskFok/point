import { readFileSync } from "node:fs";
import path from "node:path";

import { ApiClientError, ApiNetworkError } from "@point-quest/api-client";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PreviewSession } from "@/components/preview/preview-session";

import {
  correctAnswer,
  previewQuestionOne,
  previewQuestionTwo,
} from "./student-fixtures";

const questionTwoCorrectAnswer = {
  ...correctAnswer,
  correctOptionId: "option-2-a",
  selectedOptionId: "option-2-a",
  explanation: previewQuestionTwo.explanation,
  pointsAwarded: 16,
  balance: 136,
};

function createApi() {
  return {
    answerQuestion: jest.fn(),
    getPreviewQuestions: jest.fn(),
  };
}

describe("预习会话", () => {
  it("选择数量阶段卡片带 preview-setup，且 CSS 提供内边距避免贴边", () => {
    const { container } = render(<PreviewSession api={createApi()} />);
    expect(container.querySelector(".preview-setup")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "选择预习题目数量" }),
    ).toBeVisible();

    const css = readFileSync(
      path.join(__dirname, "../app/globals.css"),
      "utf8",
    );
    expect(css).toMatch(/\.preview-setup\s*\{[^}]*padding:\s*[^;]+;/s);
  });

  it("选择预设数量后开始预习，直接进入答题且提交前不展示答案", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getPreviewQuestions.mockResolvedValue({
      data: [previewQuestionOne, previewQuestionTwo],
    });

    render(<PreviewSession api={api} />);

    await user.click(screen.getByRole("button", { name: "5 道" }));
    await user.click(screen.getByRole("button", { name: "开始预习" }));

    expect(await screen.findByText(previewQuestionOne.stem)).toBeVisible();
    expect(api.getPreviewQuestions).toHaveBeenCalledWith(5);
    expect(screen.getByText("答题第 1 / 2 题")).toBeVisible();
    expect(screen.queryByText("正确答案：A. had left")).not.toBeInTheDocument();
    expect(
      screen.queryByText(previewQuestionOne.explanation),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "完成预习，开始答题" }),
    ).not.toBeInTheDocument();

    const option = screen.getByRole("radio", { name: /A.*had left/ });
    expect(option).toBeEnabled();
    expect(option).not.toBeChecked();

    const nav = screen.getByRole("navigation", { name: "答题题目切换" });
    expect(within(nav).getByRole("button", { name: "上一题" })).toBeDisabled();
    expect(within(nav).getByRole("button", { name: "提交答案" })).toBeDisabled();
    expect(within(nav).getByRole("button", { name: "下一题" })).toBeDisabled();
  });

  it("自定义数量超出范围时禁用开始预习", async () => {
    const user = userEvent.setup();
    const api = createApi();

    render(<PreviewSession api={api} />);

    const input = screen.getByLabelText("自定义数量");
    await user.clear(input);
    await user.type(input, "51");
    expect(screen.getByRole("button", { name: "开始预习" })).toBeDisabled();

    await user.clear(input);
    expect(screen.getByRole("button", { name: "开始预习" })).toBeDisabled();

    await user.type(input, "3");
    expect(screen.getByRole("button", { name: "开始预习" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "开始预习" }));
    expect(api.getPreviewQuestions).toHaveBeenCalledWith(3);
  });

  it("按预习范围逐题作答并在总结中展示成绩和积分", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getPreviewQuestions.mockResolvedValue({
      data: [previewQuestionOne, previewQuestionTwo],
    });
    api.answerQuestion
      .mockResolvedValueOnce(correctAnswer)
      .mockResolvedValueOnce(questionTwoCorrectAnswer);

    render(<PreviewSession api={api} />);

    await user.click(screen.getByRole("button", { name: "开始预习" }));
    expect(await screen.findByText("答题第 1 / 2 题")).toBeVisible();

    await user.click(screen.getByRole("radio", { name: /A.*had left/ }));
    const nav = screen.getByRole("navigation", { name: "答题题目切换" });
    await user.click(within(nav).getByRole("button", { name: "提交答案" }));
    expect(await screen.findByText("回答正确")).toBeVisible();
    expect(
      within(nav).queryByRole("button", { name: "提交答案" }),
    ).not.toBeInTheDocument();
    expect(api.answerQuestion).toHaveBeenCalledWith(
      previewQuestionOne.id,
      expect.objectContaining({ selectedOptionId: "option-1-a" }),
    );

    await user.click(within(nav).getByRole("button", { name: "下一题" }));
    expect(screen.getByText(previewQuestionTwo.stem)).toBeVisible();
    await user.click(screen.getByRole("radio", { name: /A.*has lived/ }));
    await user.click(within(nav).getByRole("button", { name: "提交答案" }));
    expect(await screen.findByText("回答正确")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "查看本次成绩" }));
    expect(screen.getByText("本次预习答题完成")).toBeVisible();
    expect(screen.getByText("共 2 题，答对 2 题")).toBeVisible();
    expect(screen.getByText("本次获得 36 积分")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "返回学习首页" }),
    ).toHaveAttribute("href", "/learn");
  });

  it("答题未完成前禁用下一题与查看成绩", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getPreviewQuestions.mockResolvedValue({
      data: [previewQuestionOne, previewQuestionTwo],
    });

    render(<PreviewSession api={api} />);

    await user.click(screen.getByRole("button", { name: "开始预习" }));
    expect(await screen.findByText("答题第 1 / 2 题")).toBeVisible();
    expect(screen.getByRole("button", { name: "下一题" })).toBeDisabled();
  });

  it("提交失败后冻结原始载荷，重试沿用同一幂等键", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getPreviewQuestions.mockResolvedValue({
      data: [previewQuestionOne],
    });
    api.answerQuestion
      .mockRejectedValueOnce(
        new ApiNetworkError("/api/v1/practice/questions/question-1/answer", {
          message: "offline",
        }),
      )
      .mockResolvedValueOnce(correctAnswer);

    render(<PreviewSession api={api} />);

    await user.click(screen.getByRole("button", { name: "开始预习" }));
    expect(await screen.findByText("答题第 1 / 1 题")).toBeVisible();

    const selected = screen.getByRole("radio", { name: /A.*had left/ });
    await user.click(selected);
    const nav = screen.getByRole("navigation", { name: "答题题目切换" });
    await user.click(within(nav).getByRole("button", { name: "提交答案" }));

    expect(
      await screen.findByText("网络连接失败，请检查网络后重试"),
    ).toBeVisible();
    expect(selected).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "重试提交" }));
    expect(await screen.findByText("回答正确")).toBeVisible();
    expect(api.answerQuestion).toHaveBeenCalledTimes(2);
    expect(api.answerQuestion.mock.calls[1][1]).toEqual(
      api.answerQuestion.mock.calls[0][1],
    );
  });

  it("题目已在其他地方首答时标记跳过并可继续", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getPreviewQuestions.mockResolvedValue({
      data: [previewQuestionOne, previewQuestionTwo],
    });
    api.answerQuestion
      .mockRejectedValueOnce(
        new ApiClientError(409, {
          code: "QUESTION_ALREADY_ANSWERED",
          details: {},
          message: "该题已经完成首次作答",
          requestId: "request-answered",
        }),
      )
      .mockResolvedValueOnce(questionTwoCorrectAnswer);

    render(<PreviewSession api={api} />);

    await user.click(screen.getByRole("button", { name: "开始预习" }));
    expect(await screen.findByText("答题第 1 / 2 题")).toBeVisible();

    await user.click(screen.getByRole("radio", { name: /A.*had left/ }));
    const nav = screen.getByRole("navigation", { name: "答题题目切换" });
    await user.click(within(nav).getByRole("button", { name: "提交答案" }));
    expect(
      await screen.findByText("该题已在其他地方完成首次作答，本轮跳过"),
    ).toBeVisible();

    await user.click(within(nav).getByRole("button", { name: "下一题" }));
    await user.click(screen.getByRole("radio", { name: /A.*has lived/ }));
    await user.click(within(nav).getByRole("button", { name: "提交答案" }));
    expect(await screen.findByText("回答正确")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "查看本次成绩" }));
    expect(screen.getByText("共 2 题，答对 1 题，跳过 1 题")).toBeVisible();
  });

  it("没有可预习的新题时展示空状态", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getPreviewQuestions.mockRejectedValue(
      new ApiClientError(404, {
        code: "NO_UNANSWERED_QUESTIONS",
        details: {},
        message: "没有可继续作答的未答题目",
        requestId: "request-empty",
      }),
    );

    render(<PreviewSession api={api} />);

    await user.click(screen.getByRole("button", { name: "开始预习" }));
    expect(
      await screen.findByRole("heading", { name: "没有可预习的新题" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "去错题库继续巩固" }),
    ).toHaveAttribute("href", "/learn/wrong-questions");
  });

  it("抽题失败时展示错误并可重试", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getPreviewQuestions
      .mockRejectedValueOnce(
        new ApiNetworkError("/api/v1/practice/preview", {
          message: "offline",
        }),
      )
      .mockResolvedValueOnce({ data: [previewQuestionOne] });

    render(<PreviewSession api={api} />);

    await user.click(screen.getByRole("button", { name: "开始预习" }));
    expect(
      await screen.findByText("网络连接失败，请检查网络后重试"),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "开始预习" }));
    expect(
      await screen.findByText(previewQuestionOne.stem),
    ).toBeVisible();
  });

  it("总结后可以重新开始新一轮预习", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getPreviewQuestions.mockResolvedValue({
      data: [previewQuestionOne],
    });
    api.answerQuestion.mockResolvedValue(correctAnswer);

    render(<PreviewSession api={api} />);

    await user.click(screen.getByRole("button", { name: "开始预习" }));
    expect(await screen.findByText("答题第 1 / 1 题")).toBeVisible();
    await user.click(screen.getByRole("radio", { name: /A.*had left/ }));
    const nav = screen.getByRole("navigation", { name: "答题题目切换" });
    await user.click(within(nav).getByRole("button", { name: "提交答案" }));
    await user.click(
      await screen.findByRole("button", { name: "查看本次成绩" }),
    );
    await user.click(
      screen.getByRole("button", { name: "再来一轮预习" }),
    );

    expect(
      screen.getByRole("heading", { name: "选择预习题目数量" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "开始预习" })).toBeEnabled();
  });
});
