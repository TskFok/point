import { render, screen } from "@testing-library/react";
import { ClipboardList } from "lucide-react";

import { AdminPageHeadingStat } from "@/components/admin/admin-page-heading";

describe("AdminPageHeadingStat", () => {
  it("渲染图标、标签与数值", () => {
    const { container } = render(
      <AdminPageHeadingStat
        icon={<ClipboardList aria-hidden="true" />}
        label="当前结果"
        value={12}
      />,
    );

    const stat = container.querySelector(".page-heading__stat");
    expect(stat).not.toBeNull();
    expect(screen.getByText("当前结果")).toBeVisible();
    expect(screen.getByText("12")).toBeVisible();
  });
});
