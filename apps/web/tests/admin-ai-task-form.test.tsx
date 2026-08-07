import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AiTaskForm } from "@/components/admin/ai-task-form";
import { DEFAULT_WORD_MATCH_SUFFIXES } from "@/lib/ai-task-word-match-rules";

const defaultRules = {
  suffixes: [...DEFAULT_WORD_MATCH_SUFFIXES],
  irregulars: {} as Record<string, string[]>,
};

function makeTaskResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "task-1",
    name: "每日词汇",
    aiModelConfigId: "m1",
    aiModelName: "gpt-test",
    questionCount: 5,
    optionCount: 4,
    basePoints: 10,
    cronExpression: "0 8 * * *",
    isEnabled: true,
    maxConsecutiveFailures: 0,
    consecutiveFailureCount: 0,
    wordMatchRules: defaultRules,
    langCode: "en",
    lastEntryId: null,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("AiTaskForm", () => {
  it("保存期间通过 onPendingChange 上报 pending，完成后恢复 false", async () => {
    const user = userEvent.setup();
    let resolveCreate!: (value: Record<string, unknown>) => void;
    const createAdminAiTask = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const onPendingChange = jest.fn();
    render(
      <AiTaskForm
        api={{ createAdminAiTask, updateAdminAiTask: jest.fn() }}
        mode="create"
        models={[{ id: "m1", name: "gpt-test" }]}
        onPendingChange={onPendingChange}
      />,
    );
    await user.type(screen.getByLabelText("任务名称"), "每日词汇");

    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(onPendingChange).toHaveBeenLastCalledWith(true);
    });
    resolveCreate(makeTaskResponse());
    await waitFor(() => {
      expect(onPendingChange).toHaveBeenLastCalledWith(false);
    });
  });

  it("新建默认预填屈折后缀，提交含 wordMatchRules", async () => {
    const user = userEvent.setup();
    const createAdminAiTask = jest
      .fn()
      .mockResolvedValue(makeTaskResponse());
    render(
      <AiTaskForm
        api={{ createAdminAiTask, updateAdminAiTask: jest.fn() }}
        mode="create"
        models={[{ id: "m1", name: "gpt-test" }]}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByLabelText("允许的屈折后缀")).toHaveValue(
      DEFAULT_WORD_MATCH_SUFFIXES.join(", "),
    );

    await user.clear(screen.getByLabelText("任务名称"));
    await user.type(screen.getByLabelText("任务名称"), "每日词汇");
    await user.selectOptions(screen.getByLabelText("AI 模型"), "m1");
    await user.clear(screen.getByLabelText("题目数量"));
    await user.type(screen.getByLabelText("题目数量"), "5");
    await user.clear(screen.getByLabelText("选项数量"));
    await user.type(screen.getByLabelText("选项数量"), "4");
    await user.clear(screen.getByLabelText("基础积分"));
    await user.type(screen.getByLabelText("基础积分"), "10");
    await user.clear(screen.getByLabelText("crontab"));
    await user.type(screen.getByLabelText("crontab"), "0 8 * * *");
    await user.type(screen.getByLabelText("不规则变形"), "go=went,gone");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(createAdminAiTask).toHaveBeenCalledWith({
        name: "每日词汇",
        aiModelConfigId: "m1",
        langCode: "en",
        questionCount: 5,
        optionCount: 4,
        basePoints: 10,
        cronExpression: "0 8 * * *",
        isEnabled: true,
        maxConsecutiveFailures: 0,
        wordMatchRules: {
          suffixes: [...DEFAULT_WORD_MATCH_SUFFIXES],
          irregulars: { go: ["went", "gone"] },
        },
      });
    });
  });

  it("提交包含 langCode", async () => {
    const user = userEvent.setup();
    const createAdminAiTask = jest
      .fn()
      .mockResolvedValue(makeTaskResponse({ langCode: "ja" }));
    render(
      <AiTaskForm
        api={{ createAdminAiTask, updateAdminAiTask: jest.fn() }}
        mode="create"
        models={[{ id: "m1", name: "gpt-test" }]}
      />,
    );

    await user.type(screen.getByLabelText("任务名称"), "每日词汇");
    await user.selectOptions(screen.getByLabelText("语言"), "ja");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(createAdminAiTask).toHaveBeenCalledWith(
        expect.objectContaining({ langCode: "ja" }),
      );
    });
  });

  it("新建可提交连续失败停用阈值", async () => {
    const user = userEvent.setup();
    const createAdminAiTask = jest
      .fn()
      .mockResolvedValue(makeTaskResponse({ maxConsecutiveFailures: 3 }));
    render(
      <AiTaskForm
        api={{ createAdminAiTask, updateAdminAiTask: jest.fn() }}
        mode="create"
        models={[{ id: "m1", name: "gpt-test" }]}
      />,
    );

    await user.type(screen.getByLabelText("任务名称"), "每日词汇");
    await user.clear(screen.getByLabelText("连续失败停用阈值"));
    await user.type(screen.getByLabelText("连续失败停用阈值"), "3");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(createAdminAiTask).toHaveBeenCalledWith(
        expect.objectContaining({ maxConsecutiveFailures: 3 }),
      );
    });
  });

  it("编辑页只读展示当前连续失败次数", () => {
    render(
      <AiTaskForm
        api={{ createAdminAiTask: jest.fn(), updateAdminAiTask: jest.fn() }}
        initialTask={
          makeTaskResponse({
            consecutiveFailureCount: 2,
            maxConsecutiveFailures: 3,
          }) as never
        }
        mode="edit"
        models={[{ id: "m1", name: "gpt-test" }]}
      />,
    );

    expect(screen.getByLabelText("当前连续失败次数")).toHaveValue("2");
  });

  it("新建模式不展示游标字段", () => {
    render(
      <AiTaskForm
        api={{ createAdminAiTask: jest.fn(), updateAdminAiTask: jest.fn() }}
        mode="create"
        models={[{ id: "m1", name: "gpt-test" }]}
      />,
    );
    expect(screen.queryByLabelText("当前游标")).not.toBeInTheDocument();
  });

  it("编辑模式可修改游标并随 update 提交", async () => {
    const user = userEvent.setup();
    const updateAdminAiTask = jest
      .fn()
      .mockResolvedValue(makeTaskResponse({ lastEntryId: "42" }));
    render(
      <AiTaskForm
        api={{ createAdminAiTask: jest.fn(), updateAdminAiTask }}
        initialTask={makeTaskResponse({ lastEntryId: "20" }) as never}
        mode="edit"
        models={[{ id: "m1", name: "gpt-test" }]}
      />,
    );

    const cursor = screen.getByLabelText("当前游标");
    expect(cursor).toHaveValue("20");
    expect(cursor).not.toHaveAttribute("readonly");

    await user.clear(cursor);
    await user.type(cursor, "42");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateAdminAiTask).toHaveBeenCalledWith(
        "task-1",
        expect.objectContaining({ lastEntryId: "42" }),
      );
    });
  });

  it("编辑模式清空游标时提交 null", async () => {
    const user = userEvent.setup();
    const updateAdminAiTask = jest
      .fn()
      .mockResolvedValue(makeTaskResponse({ lastEntryId: null }));
    render(
      <AiTaskForm
        api={{ createAdminAiTask: jest.fn(), updateAdminAiTask }}
        initialTask={makeTaskResponse({ lastEntryId: "20" }) as never}
        mode="edit"
        models={[{ id: "m1", name: "gpt-test" }]}
      />,
    );

    await user.clear(screen.getByLabelText("当前游标"));
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateAdminAiTask).toHaveBeenCalledWith(
        "task-1",
        expect.objectContaining({ lastEntryId: null }),
      );
    });
  });

  it("编辑模式非法游标不调用 API", async () => {
    const user = userEvent.setup();
    const updateAdminAiTask = jest.fn();
    render(
      <AiTaskForm
        api={{ createAdminAiTask: jest.fn(), updateAdminAiTask }}
        initialTask={makeTaskResponse({ lastEntryId: "20" }) as never}
        mode="edit"
        models={[{ id: "m1", name: "gpt-test" }]}
      />,
    );

    const cursor = screen.getByLabelText("当前游标");
    await user.clear(cursor);
    await user.type(cursor, "abc");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(updateAdminAiTask).not.toHaveBeenCalled();
    expect(
      screen.getByText(/游标 lastEntryId 须为正整数字符串/),
    ).toBeInTheDocument();
  });

  it("编辑模式游标为 0 时不调用 API", async () => {
    const user = userEvent.setup();
    const updateAdminAiTask = jest.fn();
    render(
      <AiTaskForm
        api={{ createAdminAiTask: jest.fn(), updateAdminAiTask }}
        initialTask={makeTaskResponse({ lastEntryId: "20" }) as never}
        mode="edit"
        models={[{ id: "m1", name: "gpt-test" }]}
      />,
    );

    const cursor = screen.getByLabelText("当前游标");
    await user.clear(cursor);
    await user.type(cursor, "0");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(updateAdminAiTask).not.toHaveBeenCalled();
    expect(
      screen.getByText(/游标 lastEntryId 须为正整数字符串/),
    ).toBeInTheDocument();
  });
});
