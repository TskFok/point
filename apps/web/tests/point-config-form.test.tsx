import { render, screen } from "@testing-library/react";

import { PointConfigForm } from "@/components/admin/point-config-form";

describe("PointConfigForm", () => {
  it("保存按钮位于卡片标题行右上角", () => {
    const { container } = render(
      <PointConfigForm currentMultiplier={2} />,
    );

    const heading = container.querySelector(".point-config-card__heading");
    const saveButton = screen.getByRole("button", { name: "保存倍率" });

    expect(heading).toBeTruthy();
    expect(heading?.contains(saveButton)).toBe(true);
  });
});
