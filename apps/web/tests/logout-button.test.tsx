import { ApiNetworkError } from "@point-quest/api-client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LogoutButton } from "@/components/layout/logout-button";

const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

describe("LogoutButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("成功退出后 replace 到 /login", async () => {
    const logout = jest.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<LogoutButton api={{ logout }} />);
    await user.click(screen.getByRole("button", { name: "退出" }));

    await waitFor(() => {
      expect(logout).toHaveBeenCalledWith();
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("请求进行中禁用按钮并显示退出中…", async () => {
    let resolveLogout!: (value: { success: boolean }) => void;
    const logout = jest.fn(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          resolveLogout = resolve;
        }),
    );
    const user = userEvent.setup();

    render(<LogoutButton api={{ logout }} />);
    await user.click(screen.getByRole("button", { name: "退出" }));

    expect(screen.getByRole("button", { name: "退出中…" })).toBeDisabled();

    resolveLogout({ success: true });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("失败时不跳转并展示错误", async () => {
    const logout = jest
      .fn()
      .mockRejectedValue(
        new ApiNetworkError("/api/v1/auth/logout", new Error("offline")),
      );
    const user = userEvent.setup();

    render(<LogoutButton api={{ logout }} />);
    await user.click(screen.getByRole("button", { name: "退出" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "退出" })).toBeEnabled();
  });
});
