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

  it("仅点击退出不调用 logout，并出现确认弹窗", async () => {
    const logout = jest.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<LogoutButton api={{ logout }} />);
    await user.click(screen.getByRole("button", { name: "退出" }));

    expect(
      await screen.findByRole("dialog", { name: "确定要退出登录吗？" }),
    ).toBeVisible();
    expect(logout).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("确认后 logout 成功并 replace 到 /login", async () => {
    const logout = jest.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<LogoutButton api={{ logout }} />);
    await user.click(screen.getByRole("button", { name: "退出" }));
    await user.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(logout).toHaveBeenCalledWith();
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("取消确认不调用 logout", async () => {
    const logout = jest.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<LogoutButton api={{ logout }} />);
    await user.click(screen.getByRole("button", { name: "退出" }));
    await user.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "确定要退出登录吗？" }),
      ).toBeNull();
    });
    expect(logout).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("请求进行中禁用确认按钮并显示退出中…", async () => {
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
    await user.click(screen.getByRole("button", { name: "退出登录" }));

    expect(screen.getByRole("button", { name: "退出中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();

    resolveLogout({ success: true });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("失败时弹窗内展示错误且不跳转", async () => {
    const logout = jest
      .fn()
      .mockRejectedValue(
        new ApiNetworkError("/api/v1/auth/logout", new Error("offline")),
      );
    const user = userEvent.setup();

    render(<LogoutButton api={{ logout }} />);
    await user.click(screen.getByRole("button", { name: "退出" }));
    await user.click(screen.getByRole("button", { name: "退出登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "确定要退出登录吗？" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeEnabled();
  });
});
