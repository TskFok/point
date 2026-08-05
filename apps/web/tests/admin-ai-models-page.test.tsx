import { ApiNetworkError } from "@point-quest/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminAiModelsPage from "@/app/(admin)/admin/ai-models/page";

const meta = {
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

const model = {
  id: "model-1",
  name: "gpt-test",
  baseUrl: "https://api.example.com/v1",
  apiKeyMasked: "••••abcd",
  isEnabled: true,
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T01:00:00.000Z",
};

function createApi(overrides: Record<string, unknown> = {}) {
  return {
    listAdminAiModels: jest.fn().mockResolvedValue({ data: [model], meta }),
    createAdminAiModel: jest.fn(),
    updateAdminAiModel: jest.fn().mockResolvedValue({
      ...model,
      isEnabled: false,
    }),
    deleteAdminAiModel: jest.fn().mockResolvedValue({ success: true }),
    testAdminAiModel: jest.fn().mockResolvedValue({
      ok: true,
      latencyMs: 12,
    }),
    testAdminAiModelDraft: jest.fn(),
    ...overrides,
  };
}

describe("管理员 AI 模型页", () => {
  it("点击添加模型打开表单弹窗", async () => {
    const user = userEvent.setup();
    render(<AdminAiModelsPage api={createApi()} />);

    await screen.findByText("gpt-test");
    await user.click(screen.getByRole("button", { name: "添加模型" }));

    expect(
      await screen.findByRole("dialog", { name: "新配置" }),
    ).toBeVisible();
  });

  it("列表展示脱敏 API Key", async () => {
    render(<AdminAiModelsPage api={createApi()} />);

    await waitFor(() => {
      expect(screen.getByText("gpt-test")).toBeInTheDocument();
    });
    expect(screen.getByText("••••abcd")).toBeInTheDocument();
    expect(screen.getByText("https://api.example.com/v1")).toBeInTheDocument();
  });

  it("操作列使用 admin-table__actions 布局", async () => {
    const { container } = render(<AdminAiModelsPage api={createApi()} />);

    await waitFor(() => {
      expect(screen.getByText("gpt-test")).toBeInTheDocument();
    });

    const actions = container.querySelector(".admin-table__actions");
    expect(actions).toBeTruthy();
    expect(actions?.querySelectorAll("button")).toHaveLength(4);
  });

  it("行内测试调用已保存配置探测接口", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminAiModelsPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("gpt-test")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "测试" }));

    await waitFor(() => {
      expect(api.testAdminAiModel).toHaveBeenCalledWith("model-1");
      expect(screen.getByRole("status")).toHaveTextContent("连通成功");
    });
  });

  it("删除需确认后才调用 deleteAdminAiModel", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminAiModelsPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("gpt-test")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "删除" }));

    const dialog = await screen.findByRole("dialog", {
      name: "确认删除模型「gpt-test」？",
    });
    expect(dialog).toBeVisible();
    expect(api.deleteAdminAiModel).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(api.deleteAdminAiModel).toHaveBeenCalledWith("model-1");
      expect(screen.getByRole("status")).toHaveTextContent("已删除");
    });
  });

  it("删除失败保留确认弹窗并展示错误", async () => {
    const user = userEvent.setup();
    const api = createApi({
      deleteAdminAiModel: jest
        .fn()
        .mockRejectedValue(
          new ApiNetworkError("/api/v1/admin/ai-models/model-1", "offline"),
        ),
    });
    render(<AdminAiModelsPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("gpt-test")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认删除模型「gpt-test」？",
    });
    await user.click(within(dialog).getByRole("button", { name: "删除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(
      screen.getByRole("dialog", { name: "确认删除模型「gpt-test」？" }),
    ).toBeVisible();
  });

  it("取消删除不调用 deleteAdminAiModel", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminAiModelsPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("gpt-test")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "删除" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认删除模型「gpt-test」？",
    });
    await user.click(within(dialog).getByRole("button", { name: "取消" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "确认删除模型「gpt-test」？",
        }),
      ).toBeNull();
    });
    expect(api.deleteAdminAiModel).not.toHaveBeenCalled();
  });

  it("停用需确认后才调用 updateAdminAiModel", async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<AdminAiModelsPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("gpt-test")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "停用" }));

    const dialog = await screen.findByRole("dialog", {
      name: "确认停用模型「gpt-test」？",
    });
    expect(dialog).toBeVisible();
    expect(api.updateAdminAiModel).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "停用" }));

    await waitFor(() => {
      expect(api.updateAdminAiModel).toHaveBeenCalledWith("model-1", {
        isEnabled: false,
      });
      expect(screen.getByRole("status")).toHaveTextContent("已停用");
    });
  });

  it("停用失败保留确认弹窗并展示错误", async () => {
    const user = userEvent.setup();
    const api = createApi({
      updateAdminAiModel: jest
        .fn()
        .mockRejectedValue(
          new ApiNetworkError("/api/v1/admin/ai-models/model-1", "offline"),
        ),
    });
    render(<AdminAiModelsPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("gpt-test")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "停用" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认停用模型「gpt-test」？",
    });
    await user.click(within(dialog).getByRole("button", { name: "停用" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(
      screen.getByRole("dialog", { name: "确认停用模型「gpt-test」？" }),
    ).toBeVisible();
  });

  it("启用无需确认直接调用 updateAdminAiModel", async () => {
    const user = userEvent.setup();
    const disabledModel = { ...model, isEnabled: false };
    const api = createApi({
      listAdminAiModels: jest
        .fn()
        .mockResolvedValue({ data: [disabledModel], meta }),
      updateAdminAiModel: jest.fn().mockResolvedValue({
        ...disabledModel,
        isEnabled: true,
      }),
    });
    render(<AdminAiModelsPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("gpt-test")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "启用" }));

    await waitFor(() => {
      expect(api.updateAdminAiModel).toHaveBeenCalledWith("model-1", {
        isEnabled: true,
      });
      expect(screen.getByRole("status")).toHaveTextContent("已启用");
    });
    expect(
      screen.queryByRole("dialog", { name: /确认停用|确认删除/ }),
    ).toBeNull();
  });

  it("翻页时按 page 重新拉取列表并更新 URL", async () => {
    const user = userEvent.setup();
    const api = createApi({
      listAdminAiModels: jest
        .fn()
        .mockResolvedValueOnce({
          data: [model],
          meta: { ...meta, total: 21, totalPages: 2 },
        })
        .mockResolvedValueOnce({
          data: [{ ...model, id: "model-2", name: "gpt-page-2" }],
          meta: { ...meta, page: 2, total: 21, totalPages: 2 },
        }),
    });
    window.history.replaceState(null, "", "/admin/ai-models");
    render(<AdminAiModelsPage api={api} />);

    await waitFor(() => {
      expect(screen.getByText("gpt-test")).toBeInTheDocument();
    });
    expect(screen.getByText("第 1 / 2 页")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() => {
      expect(api.listAdminAiModels).toHaveBeenLastCalledWith({
        page: 2,
        pageSize: 20,
      });
      expect(screen.getByText("gpt-page-2")).toBeInTheDocument();
    });
    expect(window.location.search).toBe("?page=2");
  });
});
