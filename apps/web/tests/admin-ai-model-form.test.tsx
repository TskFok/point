import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AiModelForm } from "@/components/admin/ai-model-form";

function createApi() {
  return {
    createAdminAiModel: jest.fn(),
    updateAdminAiModel: jest.fn(),
    testAdminAiModelDraft: jest.fn(),
  };
}

describe("管理员 AI 模型表单", () => {
  it("操作区使用 admin-form__actions 并包含保存、测试、取消", () => {
    const { container } = render(
      <AiModelForm api={createApi()} mode="create" onCancel={() => undefined} />,
    );

    const actions = container.querySelector(".admin-form__actions");
    expect(actions).toBeTruthy();
    expect(
      Array.from(actions?.querySelectorAll("button") ?? []).map((button) =>
        button.textContent?.replace(/\s+/g, ""),
      ),
    ).toEqual(["保存配置", "测试连通", "取消"]);
  });

  it("新建时校验名称、地址和 API Key", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AiModelForm api={api} mode="create" />);

    await user.click(screen.getByRole("button", { name: "保存配置" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请输入模型名称");
    expect(screen.getByRole("alert")).toHaveTextContent("请输入调用地址");
    expect(screen.getByRole("alert")).toHaveTextContent("请输入 API Key");
    expect(api.createAdminAiModel).not.toHaveBeenCalled();
  });

  it("编辑时 API Key 留空不传密钥字段", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.updateAdminAiModel.mockResolvedValue({
      id: "model-1",
      name: "gpt-test",
      baseUrl: "https://api.example.com/v1",
      apiKeyMasked: "••••9999",
      isEnabled: true,
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
    });

    const onSaved = jest.fn();
    render(
      <AiModelForm
        api={api}
        initialModel={{
          id: "model-1",
          name: "gpt-test",
          baseUrl: "https://api.example.com/v1",
          apiKeyMasked: "••••9999",
          isEnabled: true,
          createdAt: "2026-08-03T00:00:00.000Z",
          updatedAt: "2026-08-03T00:00:00.000Z",
        }}
        mode="edit"
        onSaved={onSaved}
      />,
    );

    await user.clear(screen.getByLabelText("模型名称"));
    await user.type(screen.getByLabelText("模型名称"), "gpt-renamed");
    await user.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(api.updateAdminAiModel).toHaveBeenCalledWith("model-1", {
        name: "gpt-renamed",
        baseUrl: "https://api.example.com/v1",
        isEnabled: true,
      });
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it("测试连通成功时展示耗时", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.testAdminAiModelDraft.mockResolvedValue({
      ok: true,
      latencyMs: 42,
      modelCount: 3,
    });

    render(<AiModelForm api={api} mode="create" />);
    await user.type(screen.getByLabelText("模型名称"), "gpt-test");
    await user.type(
      screen.getByLabelText("调用地址"),
      "https://api.example.com/v1",
    );
    await user.type(screen.getByLabelText("API Key"), "sk-test");
    await user.click(screen.getByRole("button", { name: "测试连通" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "连通成功（42 ms，3 个模型）",
      );
    });
    expect(api.testAdminAiModelDraft).toHaveBeenCalledWith({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
    });
  });
});
