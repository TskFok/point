import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminRouteError from "@/app/(admin)/error";
import StudentRouteError from "@/app/(student)/error";

describe.each([
  ["学员", StudentRouteError],
  ["管理员", AdminRouteError],
])("%s受保护路由错误边界", (_role, ErrorBoundary) => {
  it("提供重新加载和返回登录且不泄露服务端错误", async () => {
    const retry = jest.fn();
    const user = userEvent.setup();
    render(
      <ErrorBoundary
        error={new Error("postgresql://secret@db/internal")}
        unstable_retry={retry}
      />,
    );

    expect(screen.getByRole("heading")).toHaveTextContent("暂时无法加载");
    expect(screen.queryByText(/postgresql|secret|internal/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回登录" })).toHaveAttribute(
      "href",
      "/login",
    );

    await user.click(screen.getByRole("button", { name: "重新加载" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
