import { ApiClientError, ApiNetworkError } from "@point-quest/api-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";

import { PracticeSession } from "@/components/practice/practice-session";

import {
  correctAnswer,
  questionOne,
  questionThree,
  questionTwo,
  wrongAnswer,
} from "./student-fixtures";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function createApi() {
  return {
    answerQuestion: jest.fn(),
    getRandomQuestion: jest.fn(),
    retryWrongQuestion: jest.fn(),
  };
}

describe("随机练习队列", () => {
  it("开发 StrictMode 重放 effect 时只抽取一次初始题目", async () => {
    const api = createApi();
    api.getRandomQuestion.mockResolvedValue(questionOne);

    render(
      <StrictMode>
        <PracticeSession api={api} />
      </StrictMode>,
    );

    expect(await screen.findByText(questionOne.stem)).toBeVisible();
    expect(api.getRandomQuestion).toHaveBeenCalledTimes(1);
  });

  it("提交后锁定答案，并在上下题切换后保留只读结果", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getRandomQuestion
      .mockResolvedValueOnce(questionOne)
      .mockResolvedValueOnce(questionTwo);
    api.answerQuestion.mockResolvedValue(correctAnswer);

    render(<PracticeSession api={api} />);

    await user.click(
      await screen.findByRole("radio", { name: /A.*had left/ }),
    );
    await user.click(screen.getByRole("button", { name: "提交答案" }));

    expect(await screen.findByText("回答正确")).toBeVisible();
    expect(
      screen.getByRole("radio", { name: /A.*had left/ }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "下一题" }));
    expect(await screen.findByText(questionTwo.stem)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "上一题" }));
    expect(screen.getByText("回答正确")).toBeVisible();
  });

  it("答错时同时显示正确答案、解析和累计错误次数", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getRandomQuestion.mockResolvedValue(questionOne);
    api.answerQuestion.mockResolvedValue(wrongAnswer);

    render(<PracticeSession api={api} />);

    await user.click(
      await screen.findByRole("radio", { name: /B.*left/ }),
    );
    await user.click(screen.getByRole("button", { name: "提交答案" }));

    expect(await screen.findByText("回答错误")).toBeVisible();
    expect(screen.getByText("正确答案：A. had left")).toBeVisible();
    expect(screen.getByText(wrongAnswer.explanation)).toBeVisible();
    expect(screen.getByText("累计答错 2 次")).toBeVisible();
  });

  it("队尾请求新题时排除队列中尚未提交的题目", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getRandomQuestion
      .mockResolvedValueOnce(questionOne)
      .mockResolvedValueOnce(questionTwo);

    render(<PracticeSession api={api} />);

    expect(await screen.findByText(questionOne.stem)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "下一题" }));

    expect(await screen.findByText(questionTwo.stem)).toBeVisible();
    expect(api.getRandomQuestion).toHaveBeenNthCalledWith(2, [
      questionOne.id,
    ]);
  });

  it("首次答题提交开始后冻结选项和请求载荷，网络失败重试也不能更换答案", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getRandomQuestion.mockResolvedValue(questionOne);
    api.answerQuestion
      .mockRejectedValueOnce(
        new ApiNetworkError("/api/v1/practice/questions/question-1/answer", {
          message: "offline",
        }),
      )
      .mockResolvedValueOnce(correctAnswer);

    render(<PracticeSession api={api} />);

    const selected = await screen.findByRole("radio", {
      name: /A.*had left/,
    });
    await user.click(selected);
    await user.click(screen.getByRole("button", { name: "提交答案" }));

    expect(
      await screen.findByText("网络连接失败，请检查网络后重试"),
    ).toBeVisible();
    expect(selected).toBeChecked();
    const otherOption = screen.getByRole("radio", { name: /B.*left/ });
    expect(selected).toBeDisabled();
    expect(otherOption).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "提交答案" }),
    ).not.toBeInTheDocument();
    await user.click(otherOption);

    await user.click(screen.getByRole("button", { name: "重试提交" }));
    expect(await screen.findByText("回答正确")).toBeVisible();
    expect(api.answerQuestion).toHaveBeenCalledTimes(2);
    expect(api.answerQuestion.mock.calls[1][1]).toEqual(
      api.answerQuestion.mock.calls[0][1],
    );
    expect(api.answerQuestion.mock.calls[1][1].selectedOptionId).toBe(
      "option-1-a",
    );
  });

  it("错题重练提交失败后同样冻结选项和原始请求载荷", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.retryWrongQuestion
      .mockRejectedValueOnce(
        new ApiNetworkError(
          "/api/v1/practice/wrong-questions/question-1/retry",
          { message: "offline" },
        ),
      )
      .mockResolvedValueOnce({
        ...correctAnswer,
        errorCount: 3,
        pointsAwarded: 0,
      });

    render(
      <PracticeSession
        api={api}
        initialQuestion={questionOne}
        mode="WRONG_RETRY"
      />,
    );

    const selected = screen.getByRole("radio", { name: /A.*had left/ });
    const otherOption = screen.getByRole("radio", { name: /B.*left/ });
    await user.click(selected);
    await user.click(screen.getByRole("button", { name: "提交重练答案" }));

    expect(
      await screen.findByText("网络连接失败，请检查网络后重试"),
    ).toBeVisible();
    expect(selected).toBeDisabled();
    expect(otherOption).toBeDisabled();
    await user.click(otherOption);
    await user.click(screen.getByRole("button", { name: "重试提交" }));

    expect(await screen.findByText("这道错题已掌握")).toBeVisible();
    expect(api.retryWrongQuestion.mock.calls[1][1]).toEqual(
      api.retryWrongQuestion.mock.calls[0][1],
    );
    expect(api.retryWrongQuestion.mock.calls[1][1].selectedOptionId).toBe(
      "option-1-a",
    );
  });

  it("队尾新题延迟返回时，用户已返回上一题则不会被响应抢走导航", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const thirdQuestion = deferred<typeof questionThree>();
    api.getRandomQuestion
      .mockResolvedValueOnce(questionOne)
      .mockResolvedValueOnce(questionTwo)
      .mockReturnValueOnce(thirdQuestion.promise);

    render(<PracticeSession api={api} />);

    expect(await screen.findByText(questionOne.stem)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "下一题" }));
    expect(await screen.findByText(questionTwo.stem)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "下一题" }));
    await user.click(screen.getByRole("button", { name: "上一题" }));
    expect(screen.getByText(questionOne.stem)).toBeVisible();

    thirdQuestion.resolve(questionThree);

    expect(await screen.findByRole("button", { name: "下一题" })).toBeEnabled();
    expect(screen.getByText(questionOne.stem)).toBeVisible();
    expect(screen.queryByText(questionThree.stem)).not.toBeInTheDocument();
  });

  it("切换到其他题目时清除上一题的提交错误", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getRandomQuestion.mockResolvedValue(questionTwo);
    api.answerQuestion.mockRejectedValue(
      new ApiNetworkError("/api/v1/practice/questions/question-1/answer", {
        message: "offline",
      }),
    );

    render(<PracticeSession api={api} initialQuestion={questionOne} />);

    await user.click(screen.getByRole("radio", { name: /A.*had left/ }));
    await user.click(screen.getByRole("button", { name: "提交答案" }));
    expect(
      await screen.findByText("网络连接失败，请检查网络后重试"),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "下一题" }));
    expect(await screen.findByText(questionTwo.stem)).toBeVisible();
    expect(
      screen.queryByText("网络连接失败，请检查网络后重试"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "上一题" }));
    expect(screen.getByText(questionOne.stem)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "重试提交" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "提交答案" }),
    ).not.toBeInTheDocument();
  });

  it("到达未答题队尾后禁用下一题，避免重复请求完成状态", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getRandomQuestion.mockRejectedValue(
      new ApiClientError(404, {
        code: "NO_UNANSWERED_QUESTIONS",
        details: {},
        message: "没有可继续作答的未答题目",
        requestId: "request-complete",
      }),
    );

    render(<PracticeSession api={api} initialQuestion={questionOne} />);

    await user.click(screen.getByRole("button", { name: "下一题" }));
    expect(
      await screen.findByText("已经到达本轮未答题队尾"),
    ).toBeVisible();
    const nextButton = screen.getByRole("button", { name: "下一题" });
    expect(nextButton).toBeDisabled();
    await user.click(nextButton);
    expect(api.getRandomQuestion).toHaveBeenCalledTimes(1);
  });

  it("确认队尾完成后仍可在已经加载的题目之间前后切换", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getRandomQuestion
      .mockResolvedValueOnce(questionOne)
      .mockResolvedValueOnce(questionTwo)
      .mockRejectedValueOnce(
        new ApiClientError(404, {
          code: "NO_UNANSWERED_QUESTIONS",
          details: {},
          message: "没有可继续作答的未答题目",
          requestId: "request-existing-queue",
        }),
      );

    render(<PracticeSession api={api} />);

    expect(await screen.findByText(questionOne.stem)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "下一题" }));
    expect(await screen.findByText(questionTwo.stem)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "下一题" }));
    expect(
      await screen.findByText("已经到达本轮未答题队尾"),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "上一题" }));
    expect(screen.getByText(questionOne.stem)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "下一题" }));
    expect(screen.getByText(questionTwo.stem)).toBeVisible();
    expect(api.getRandomQuestion).toHaveBeenCalledTimes(3);
  });

  it("没有未答题时显示完成状态而不是通用错误", async () => {
    const api = createApi();
    api.getRandomQuestion.mockRejectedValue(
      new ApiClientError(404, {
        code: "NO_UNANSWERED_QUESTIONS",
        details: {},
        message: "没有可继续作答的未答题目",
        requestId: "request-1",
      }),
    );

    render(<PracticeSession api={api} />);

    expect(
      await screen.findByRole("heading", { name: "本轮首次答题已完成" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "去错题库继续巩固" }),
    ).toHaveAttribute("href", "/learn/wrong-questions");
  });

  it("错题重练答对后明确说明不奖励积分", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.retryWrongQuestion.mockResolvedValue({
      ...correctAnswer,
      errorCount: 2,
      pointsAwarded: 0,
    });

    render(
      <PracticeSession
        api={api}
        initialQuestion={questionOne}
        mode="WRONG_RETRY"
      />,
    );

    await user.click(screen.getByRole("radio", { name: /A.*had left/ }));
    await user.click(screen.getByRole("button", { name: "提交重练答案" }));

    expect(await screen.findByText("这道错题已掌握")).toBeVisible();
    expect(screen.getByText("错题重练不奖励积分")).toBeVisible();
    expect(api.retryWrongQuestion).toHaveBeenCalledTimes(1);
    expect(api.getRandomQuestion).not.toHaveBeenCalled();
  });
});
