import {
  ApiClientError,
  ApiNetworkError,
  ApiProtocolError,
} from "@point-quest/api-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import LoginPage from "@/app/(auth)/login/page";
import RegisterPage from "@/app/(auth)/register/page";
import { browserApiClient } from "@/lib/api/browser-client";

const mockPush = jest.fn();
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

jest.mock("@/lib/api/browser-client", () => ({
  browserApiClient: {
    loginWeb: jest.fn(),
    register: jest.fn(),
  },
}));

const mockedApi = jest.mocked(browserApiClient);

function apiError(code: string, message = "请求失败", status = 401) {
  return new ApiClientError(status, {
    code,
    message,
    requestId: "request-test",
    details: {},
  });
}

describe("认证表单", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("登录失败保留用户名并显示可恢复错误", async () => {
    mockedApi.loginWeb.mockRejectedValueOnce(
      apiError("AUTH_INVALID_CREDENTIALS"),
    );
    const user = userEvent.setup();

    render(<LoginPage />);
    await user.type(screen.getByLabelText("用户名"), "learner_01");
    await user.type(screen.getByLabelText("密码"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "用户名或密码错误",
    );
    expect(screen.getByLabelText("用户名")).toHaveValue("learner_01");
    expect(screen.getByLabelText("密码")).toHaveValue("");
  });

  it.each([
    ["网络或超时", new ApiNetworkError("/api/v1/auth/login", new Error("timeout"))],
    ["服务端 5xx", apiError("INTERNAL_ERROR", "内部错误", 503)],
    ["协议", new ApiProtocolError(502, "<html>", "响应格式错误")],
  ])("%s 失败保留登录凭据并允许原地重试", async (_scenario, failure) => {
    mockedApi.loginWeb.mockRejectedValueOnce(failure);
    const user = userEvent.setup();

    render(<LoginPage />);
    await user.type(screen.getByLabelText("用户名"), "learner_01");
    await user.type(screen.getByLabelText("密码"), "password123");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("用户名")).toHaveValue("learner_01");
    expect(screen.getByLabelText("密码")).toHaveValue("password123");
    expect(screen.getByRole("button", { name: "登录" })).toBeEnabled();
  });

  it.each([
    ["ADMIN", "/admin"],
    ["STUDENT", "/learn"],
  ] as const)("登录成功后按 %s 角色进入对应首页", async (role, destination) => {
    mockedApi.loginWeb.mockResolvedValueOnce({
      user: {
        id: "user-1",
        username: "learner_01",
        role,
        pointsBalance: 120,
      },
    });
    const user = userEvent.setup();

    render(<LoginPage />);
    await user.type(screen.getByLabelText("用户名"), "learner_01");
    await user.type(screen.getByLabelText("密码"), "password123");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(mockPush).toHaveBeenCalledWith(destination);
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("注册冲突时保留用户名并显示中文错误", async () => {
    mockedApi.register.mockRejectedValueOnce(apiError("AUTH_USERNAME_TAKEN"));
    const user = userEvent.setup();

    render(<RegisterPage />);
    await user.type(screen.getByLabelText("用户名"), "learner_01");
    await user.type(screen.getByLabelText("密码"), "password123");
    await user.type(screen.getByLabelText("确认密码"), "password123");
    await user.click(screen.getByRole("button", { name: "创建账号" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("用户名已被使用");
    expect(screen.getByLabelText("用户名")).toHaveValue("learner_01");
    expect(screen.getByLabelText("密码")).toHaveValue("");
    expect(screen.getByLabelText("确认密码")).toHaveValue("");
  });

  it("注册网络失败保留全部输入并允许原地重试", async () => {
    mockedApi.register.mockRejectedValueOnce(
      new ApiNetworkError("/api/v1/auth/register", new Error("offline")),
    );
    const user = userEvent.setup();

    render(<RegisterPage />);
    await user.type(screen.getByLabelText("用户名"), "learner_01");
    await user.type(screen.getByLabelText("密码"), "password123");
    await user.type(screen.getByLabelText("确认密码"), "password123");
    await user.click(screen.getByRole("button", { name: "创建账号" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("网络连接失败");
    expect(screen.getByLabelText("用户名")).toHaveValue("learner_01");
    expect(screen.getByLabelText("密码")).toHaveValue("password123");
    expect(screen.getByLabelText("确认密码")).toHaveValue("password123");
    expect(screen.getByRole("button", { name: "创建账号" })).toBeEnabled();
  });
});
