import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { FormDialog } from "@/components/ui/form-dialog";

function Harness({
  pending = false,
}: {
  pending?: boolean;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return <button type="button">已关闭</button>;
  return (
    <FormDialog
      onClose={() => setOpen(false)}
      pending={pending}
      title="测试表单"
      description="用于单测的说明"
    >
      <label>
        名称
        <input aria-label="名称" />
      </label>
      <button type="button">提交</button>
    </FormDialog>
  );
}

describe("FormDialog", () => {
  it("渲染 dialog 标题与内容", async () => {
    render(<Harness />);
    const dialog = await screen.findByRole("dialog", { name: "测试表单" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("用于单测的说明");
    expect(screen.getByLabelText("名称")).toBeVisible();
    expect(dialog.closest(".dialog-layer")?.parentElement).toBe(document.body);
  });

  it("点击关闭按钮后调用 onClose", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole("dialog", { name: "测试表单" });
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(await screen.findByRole("button", { name: "已关闭" })).toBeVisible();
  });

  it("按 Escape 关闭", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole("dialog", { name: "测试表单" });
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("button", { name: "已关闭" })).toBeVisible();
  });

  it("pending 时 Escape 与关闭按钮不关闭", async () => {
    const user = userEvent.setup();
    render(<Harness pending />);
    const dialog = await screen.findByRole("dialog", { name: "测试表单" });
    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();
    expect(screen.getByRole("button", { name: "关闭" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.getByRole("dialog", { name: "测试表单" })).toBeVisible();
  });

  it("打开后焦点落在弹窗内", async () => {
    render(<Harness />);
    const dialog = await screen.findByRole("dialog", { name: "测试表单" });
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });
});
