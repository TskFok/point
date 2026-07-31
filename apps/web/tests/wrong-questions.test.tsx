import { ApiNetworkError } from "@point-quest/api-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import WrongQuestionsPage from "@/app/(student)/learn/wrong-questions/page";

import {
  correctAnswer,
  pageMeta,
  questionOne,
  wrongAnswer,
} from "./student-fixtures";

function createApi() {
  return {
    answerQuestion: jest.fn(),
    getRandomQuestion: jest.fn(),
    listWrongQuestions: jest.fn(),
    retryWrongQuestion: jest.fn(),
  };
}

describe("错题库页面", () => {
  it("显示错误次数，并可直接重练且答对不获得积分", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listWrongQuestions
      .mockResolvedValueOnce({
        data: [
          {
            errorCount: 3,
            firstAnsweredAt: "2026-07-30T08:00:00.000Z",
            masteredAt: null,
            question: questionOne,
          },
        ],
        meta: pageMeta,
      })
      .mockResolvedValueOnce({
        data: [],
        meta: { ...pageMeta, total: 0, totalPages: 0 },
      });
    api.retryWrongQuestion.mockResolvedValue({
      ...correctAnswer,
      errorCount: 3,
      pointsAwarded: 0,
    });

    render(<WrongQuestionsPage api={api} />);

    expect(await screen.findByText("累计答错 3 次")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "继续练习" }));
    await user.click(screen.getByRole("radio", { name: /A.*had left/ }));
    await user.click(screen.getByRole("button", { name: "提交重练答案" }));

    expect(await screen.findByText("这道错题已掌握")).toBeVisible();
    expect(screen.getByText("错题重练不奖励积分")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "返回错题列表" }));
    expect(
      await screen.findByRole("heading", { name: "暂时没有待练错题" }),
    ).toBeVisible();
    expect(api.listWrongQuestions).toHaveBeenCalledTimes(2);
  });

  it("重练再次答错时立即同步最新累计错误次数", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listWrongQuestions.mockResolvedValue({
      data: [
        {
          errorCount: 3,
          firstAnsweredAt: "2026-07-30T08:00:00.000Z",
          masteredAt: null,
          question: questionOne,
        },
      ],
      meta: pageMeta,
    });
    api.retryWrongQuestion.mockResolvedValue({
      ...wrongAnswer,
      errorCount: 4,
    });

    render(<WrongQuestionsPage api={api} />);

    await user.click(
      await screen.findByRole("button", { name: "继续练习" }),
    );
    await user.click(screen.getByRole("radio", { name: /B.*left/ }));
    await user.click(screen.getByRole("button", { name: "提交重练答案" }));

    expect(
      await screen.findByRole("heading", { name: "累计答错 4 次" }),
    ).toBeVisible();
    expect(screen.getByText("回答错误")).toBeVisible();
  });

  it("空错题库给出下一步行动", async () => {
    const api = createApi();
    api.listWrongQuestions.mockResolvedValue({
      data: [],
      meta: { ...pageMeta, total: 0, totalPages: 0 },
    });

    render(<WrongQuestionsPage api={api} />);

    expect(
      await screen.findByRole("heading", { name: "暂时没有待练错题" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "继续随机练习" })).toHaveAttribute(
      "href",
      "/learn/practice",
    );
  });

  it("加载失败显示可恢复错误，并能重试当前页", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listWrongQuestions
      .mockRejectedValueOnce(
        new ApiNetworkError("/api/v1/practice/wrong-questions", "offline"),
      )
      .mockResolvedValueOnce({
        data: [],
        meta: { ...pageMeta, total: 0, totalPages: 0 },
      });

    render(<WrongQuestionsPage api={api} />);

    expect(
      await screen.findByText("网络连接失败，请检查网络后重试"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "重新加载" }));
    expect(
      await screen.findByRole("heading", { name: "暂时没有待练错题" }),
    ).toBeVisible();
    expect(api.listWrongQuestions).toHaveBeenNthCalledWith(2, {
      page: 1,
      pageSize: 12,
    });
  });

  it("删除导致当前页越界时回退并重新加载最后一个有效页", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listWrongQuestions
      .mockResolvedValueOnce({
        data: [
          {
            errorCount: 3,
            firstAnsweredAt: "2026-07-30T08:00:00.000Z",
            masteredAt: null,
            question: questionOne,
          },
        ],
        meta: { ...pageMeta, page: 1, total: 13, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        data: [],
        meta: { ...pageMeta, page: 2, total: 12, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        data: [
          {
            errorCount: 3,
            firstAnsweredAt: "2026-07-30T08:00:00.000Z",
            masteredAt: null,
            question: questionOne,
          },
        ],
        meta: { ...pageMeta, page: 1, total: 12, totalPages: 1 },
      });

    render(<WrongQuestionsPage api={api} />);

    await user.click(await screen.findByRole("button", { name: "下一页" }));

    expect(await screen.findByText(questionOne.stem)).toBeVisible();
    expect(api.listWrongQuestions).toHaveBeenNthCalledWith(2, {
      page: 2,
      pageSize: 12,
    });
    expect(api.listWrongQuestions).toHaveBeenNthCalledWith(3, {
      page: 1,
      pageSize: 12,
    });
  });
});
