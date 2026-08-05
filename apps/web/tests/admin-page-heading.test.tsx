import { Button } from "@point-quest/ui";
import { render, screen } from "@testing-library/react";
import { ClipboardList } from "lucide-react";

import {
  AdminPageHeading,
  AdminPageHeadingStat,
} from "@/components/admin/admin-page-heading";

describe("AdminPageHeading", () => {
  it("渲染 kicker、标题、说明与右侧 CTA", () => {
    const { container } = render(
      <AdminPageHeading
        description="维护商品图片与库存。"
        kicker="积分奖励中心"
        title="商品管理"
      >
        <Button type="button">添加商品</Button>
      </AdminPageHeading>,
    );

    const heading = container.querySelector(".page-heading--split");
    expect(heading).not.toBeNull();
    expect(screen.getByText("积分奖励中心")).toBeVisible();
    expect(screen.getByRole("heading", { name: "商品管理" })).toBeVisible();
    expect(screen.getByText("维护商品图片与库存。")).toBeVisible();
    expect(screen.getByRole("button", { name: "添加商品" })).toBeVisible();
  });

  it("右侧可渲染 AdminPageHeadingStat", () => {
    const { container } = render(
      <AdminPageHeading
        description="筛选待领取订单。"
        kicker="兑换履约中心"
        title="订单管理"
      >
        <AdminPageHeadingStat
          icon={<ClipboardList aria-hidden="true" />}
          label="当前结果"
          value={12}
        />
      </AdminPageHeading>,
    );

    const stat = container.querySelector(".page-heading__stat");
    expect(stat).not.toBeNull();
    expect(screen.getByText("当前结果")).toBeVisible();
    expect(screen.getByText("12")).toBeVisible();
  });
});
