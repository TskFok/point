import { ApiNetworkError } from "@point-quest/api-client";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import LearnPage from "@/app/(student)/learn/page";
import ProfilePage from "@/app/(student)/learn/profile/page";
import { StudentShell } from "@/components/layout/student-shell";

import { pageMeta } from "./student-fixtures";

jest.mock("next/navigation", () => ({
  usePathname: () => "/learn",
}));

describe("学员概览与个人中心", () => {
  it("答题或兑换后同步更新持久布局中的积分", () => {
    render(
      <StudentShell user={{ pointsBalance: 100, username: "learner" }}>
        <p>页面内容</p>
      </StudentShell>,
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("point-quest:balance-updated", {
          detail: { balance: 140 },
        }),
      );
    });

    expect(screen.getByLabelText("当前积分 140")).toBeVisible();
  });

  it("学习首页展示余额和三类学习进度", async () => {
    const api = {
      getPracticeSummary: jest.fn().mockResolvedValue({
        activeTotal: 20,
        balance: 160,
        firstAnsweredCount: 12,
        masteredWrongCount: 2,
        pendingWrongCount: 3,
        unansweredCount: 8,
      }),
    };

    render(<LearnPage api={api} />);

    expect(await screen.findByText("160")).toBeVisible();
    expect(screen.getByText("已首次作答 12 题")).toBeVisible();
    expect(screen.getByText("未回答 8 题")).toBeVisible();
    expect(screen.getByText("待练错题 3 题")).toBeVisible();
  });

  it("学习首页加载失败可重试", async () => {
    const user = userEvent.setup();
    const api = {
      getPracticeSummary: jest
        .fn()
        .mockRejectedValueOnce(
          new ApiNetworkError("/api/v1/practice/summary", "offline"),
        )
        .mockResolvedValueOnce({
          activeTotal: 0,
          balance: 0,
          firstAnsweredCount: 0,
          masteredWrongCount: 0,
          pendingWrongCount: 0,
          unansweredCount: 0,
        }),
    };

    render(<LearnPage api={api} />);
    expect(
      await screen.findByText("网络连接失败，请检查网络后重试"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByText("已首次作答 0 题")).toBeVisible();
  });

  it("个人中心显示账户、余额与分页积分流水", async () => {
    const user = userEvent.setup();
    const api = {
      getCurrentUser: jest.fn().mockResolvedValue({
        user: {
          id: "student-1",
          pointsBalance: 160,
          role: "STUDENT",
          username: "learner",
        },
      }),
      getPointBalance: jest.fn().mockResolvedValue({ balance: 160 }),
      listPointLedger: jest
        .fn()
        .mockResolvedValueOnce({
          data: [
            {
              answerAttemptId: "attempt-1",
              balanceAfter: 160,
              createdAt: "2026-07-30T08:00:00.000Z",
              delta: 20,
              id: "ledger-1",
              orderId: null,
              type: "ANSWER_REWARD",
              userId: "student-1",
            },
          ],
          meta: { ...pageMeta, totalPages: 2 },
        })
        .mockResolvedValueOnce({
          data: [],
          meta: { ...pageMeta, page: 2, totalPages: 2 },
        }),
    };

    render(<ProfilePage api={api} />);

    expect(await screen.findByText("learner")).toBeVisible();
    expect(screen.getByText("当前余额 160 积分")).toBeVisible();
    expect(screen.getByText("答题奖励")).toBeVisible();
    expect(screen.getByText("+20")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(api.listPointLedger).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 10,
    });
  });
});
