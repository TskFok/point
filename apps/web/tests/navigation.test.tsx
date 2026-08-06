import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminShell } from "@/components/layout/admin-shell";
import { StudentShell } from "@/components/layout/student-shell";

const mockUsePathname = jest.fn(() => "/learn");
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

describe("响应式应用导航", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/learn");
    mockReplace.mockClear();
  });

  it("学员桌面端提供六个主入口且不暴露管理员菜单", () => {
    render(
      <StudentShell user={{ username: "learner_01", pointsBalance: 120 }}>
        <p>学习内容</p>
      </StudentShell>,
    );

    const desktopNav = screen.getByRole("navigation", {
      name: "学员主导航",
    });
    expect(within(desktopNav).getAllByRole("link")).toHaveLength(6);
    expect(within(desktopNav).getByRole("link", { name: "练习" })).toHaveAttribute(
      "href",
      "/learn/practice",
    );
    expect(within(desktopNav).getByRole("link", { name: "预习" })).toHaveAttribute(
      "href",
      "/learn/preview",
    );
    expect(within(desktopNav).getByRole("link", { name: "错题" })).toHaveAttribute(
      "href",
      "/learn/wrong-questions",
    );
    expect(
      screen.getByRole("link", { name: /learner_01/ }),
    ).toHaveAttribute("href", "/learn/profile");
    expect(screen.getByLabelText("当前积分 120")).toBeInTheDocument();
    expect(document.querySelector(".app-header")).toBeNull();
    expect(within(desktopNav).queryByText("后台管理")).not.toBeInTheDocument();
    expect(screen.queryByText("题库管理")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出" })).toBeInTheDocument();
  });

  it("学员真实路径同时激活桌面和移动端入口", () => {
    mockUsePathname.mockReturnValue("/learn/practice");
    render(
      <StudentShell user={{ username: "learner_01", pointsBalance: 120 }}>
        <p>学习内容</p>
      </StudentShell>,
    );

    const desktopNav = screen.getByRole("navigation", {
      name: "学员主导航",
    });
    const mobileNav = screen.getByRole("navigation", {
      name: "学员移动导航",
    });
    expect(within(mobileNav).getAllByRole("link").length).toBeLessThanOrEqual(7);
    expect(within(desktopNav).getByRole("link", { name: "练习" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(mobileNav).getByRole("link", { name: "练习" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(mobileNav).getByRole("link", { name: "订单" })).toHaveAttribute(
      "href",
      "/learn/orders",
    );
    expect(within(mobileNav).getByRole("link", { name: "我的" })).toHaveAttribute(
      "href",
      "/learn/profile",
    );
  });

  it("预习路径同时激活桌面和移动端入口", () => {
    mockUsePathname.mockReturnValue("/learn/preview");
    render(
      <StudentShell user={{ username: "learner_01", pointsBalance: 120 }}>
        <p>预习内容</p>
      </StudentShell>,
    );

    const desktopNav = screen.getByRole("navigation", {
      name: "学员主导航",
    });
    const mobileNav = screen.getByRole("navigation", {
      name: "学员移动导航",
    });
    expect(within(desktopNav).getByRole("link", { name: "预习" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(mobileNav).getByRole("link", { name: "预习" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(mobileNav).getAllByRole("link")).toHaveLength(7);
  });

  it("管理员真实路径激活侧栏菜单", () => {
    mockUsePathname.mockReturnValue("/admin/orders");
    render(
      <AdminShell user={{ username: "admin", pointsBalance: 0 }}>
        <p>管理内容</p>
      </AdminShell>,
    );

    expect(
      screen.getByRole("navigation", { name: "管理员主导航" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "订单管理" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "打开管理员菜单" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".app-header")).toBeNull();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.queryByText("错题本")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出" })).toBeInTheDocument();
  });

  it("管理员抽屉圈定焦点、Escape 关闭并把焦点归还触发按钮", async () => {
    mockUsePathname.mockReturnValue("/admin/orders");
    const user = userEvent.setup();
    render(
      <AdminShell user={{ username: "admin", pointsBalance: 0 }}>
        <p>管理内容</p>
      </AdminShell>,
    );

    expect(screen.getByRole("button", { name: "退出" })).toBeInTheDocument();

    const opener = screen.getByRole("button", { name: "打开管理员菜单" });
    const workspace = screen.getByRole("main").parentElement;
    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "管理菜单" });
    const closeButton = within(dialog).getByRole("button", {
      name: "关闭管理员菜单",
    });
    const lastLink = within(dialog).getByRole("link", { name: "AI 任务" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(opener).toHaveAttribute("aria-controls", dialog.id);
    expect(workspace).toHaveAttribute("aria-hidden", "true");
    expect(closeButton).toHaveFocus();
    expect(within(dialog).getByRole("link", { name: "订单管理" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(dialog).queryByRole("button", { name: "退出" }),
    ).not.toBeInTheDocument();

    await user.tab({ shift: true });
    expect(lastLink).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(workspace).not.toHaveAttribute("aria-hidden");
  });
});
