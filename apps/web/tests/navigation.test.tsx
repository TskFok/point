import { render, screen, within } from "@testing-library/react";

import { AdminShell } from "@/components/layout/admin-shell";
import { StudentShell } from "@/components/layout/student-shell";

describe("响应式应用导航", () => {
  it("学员桌面端提供五个主入口且不暴露管理员菜单", () => {
    render(
      <StudentShell
        user={{ username: "learner_01", pointsBalance: 120 }}
        currentPath="/learn"
      >
        <p>学习内容</p>
      </StudentShell>,
    );

    const desktopNav = screen.getByRole("navigation", {
      name: "学员主导航",
    });
    expect(within(desktopNav).getAllByRole("link")).toHaveLength(5);
    expect(within(desktopNav).getByRole("link", { name: "练习" })).toHaveAttribute(
      "href",
      "/learn/practice",
    );
    expect(within(desktopNav).getByRole("link", { name: "错题" })).toHaveAttribute(
      "href",
      "/learn/wrong-questions",
    );
    expect(
      screen.getByRole("link", { name: /learner_01/ }),
    ).toHaveAttribute("href", "/learn/profile");
    expect(within(desktopNav).queryByText("后台管理")).not.toBeInTheDocument();
    expect(screen.queryByText("题库管理")).not.toBeInTheDocument();
  });

  it("学员移动端底部导航不超过五项", () => {
    render(
      <StudentShell
        user={{ username: "learner_01", pointsBalance: 120 }}
        currentPath="/learn"
      >
        <p>学习内容</p>
      </StudentShell>,
    );

    const mobileNav = screen.getByRole("navigation", {
      name: "学员移动导航",
    });
    expect(within(mobileNav).getAllByRole("link").length).toBeLessThanOrEqual(5);
  });

  it("管理员使用独立菜单并提供移动端菜单按钮", () => {
    render(
      <AdminShell user={{ username: "admin", pointsBalance: 0 }}>
        <p>管理内容</p>
      </AdminShell>,
    );

    expect(
      screen.getByRole("navigation", { name: "管理员主导航" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开管理员菜单" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("错题本")).not.toBeInTheDocument();
  });
});
