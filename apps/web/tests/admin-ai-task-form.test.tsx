import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AiTaskForm } from "@/components/admin/ai-task-form";
import { DEFAULT_WORD_MATCH_SUFFIXES } from "@/lib/ai-task-word-match-rules";

const defaultRules = {
  suffixes: [...DEFAULT_WORD_MATCH_SUFFIXES],
  irregulars: {} as Record<string, string[]>,
};

describe("AiTaskForm", () => {
  it("保存期间通过 onPendingChange 上报 pending，完成后恢复 false", async () => {
    const user = userEvent.setup();
    let resolveCreate!: (value: {
      id: string;
      name: string;
      aiModelConfigId: string;
      aiModelName: string;
      questionCount: number;
      optionCount: number;
      basePoints: number;
      cronExpression: string;
      isEnabled: boolean;
      wordMatchRules: typeof defaultRules;
      lastEntryId: null;
      createdAt: string;
      updatedAt: string;
    }) => void;
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
    resolveCreate({
      id: "task-1",
      name: "每日词汇",
      aiModelConfigId: "m1",
      aiModelName: "gpt-test",
      questionCount: 5,
      optionCount: 4,
      basePoints: 10,
      cronExpression: "0 8 * * *",
      isEnabled: true,
      wordMatchRules: defaultRules,
      lastEntryId: null,
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
    });
    await waitFor(() => {
      expect(onPendingChange).toHaveBeenLastCalledWith(false);
    });
  });

  it("新建默认预填屈折后缀，提交含 wordMatchRules", async () => {
    const user = userEvent.setup();
    const createAdminAiTask = jest.fn().mockResolvedValue({
      id: "task-1",
      name: "每日词汇",
      aiModelConfigId: "m1",
      aiModelName: "gpt-test",
      questionCount: 5,
      optionCount: 4,
      basePoints: 10,
      cronExpression: "0 8 * * *",
      isEnabled: true,
      wordMatchRules: defaultRules,
      lastEntryId: null,
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
    });
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
        questionCount: 5,
        optionCount: 4,
        basePoints: 10,
        cronExpression: "0 8 * * *",
        isEnabled: true,
        wordMatchRules: {
          suffixes: [...DEFAULT_WORD_MATCH_SUFFIXES],
          irregulars: { go: ["went", "gone"] },
        },
      });
    });
  });
});
