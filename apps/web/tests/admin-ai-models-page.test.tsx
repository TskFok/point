import { render, screen, waitFor } from "@testing-library/react";
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
  it("列表展示脱敏 API Key", async () => {
    render(<AdminAiModelsPage api={createApi()} />);

    await waitFor(() => {
      expect(screen.getByText("gpt-test")).toBeInTheDocument();
    });
    expect(screen.getByText("••••abcd")).toBeInTheDocument();
    expect(screen.getByText("https://api.example.com/v1")).toBeInTheDocument();
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
});
