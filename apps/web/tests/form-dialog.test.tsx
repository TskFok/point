import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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

  it("点击遮罩关闭", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole("dialog", { name: "测试表单" });
    const backdrop = document.querySelector(".dialog-backdrop");
    expect(backdrop).toBeTruthy();
    await user.click(backdrop as Element);
    expect(await screen.findByRole("button", { name: "已关闭" })).toBeVisible();
  });

  it("pending 时遮罩禁用且点击不关闭", async () => {
    const user = userEvent.setup();
    render(<Harness pending />);
    const dialog = await screen.findByRole("dialog", { name: "测试表单" });
    const backdrop = document.querySelector(".dialog-backdrop");
    expect(backdrop).toBeTruthy();
    expect(backdrop).toBeDisabled();
    await user.click(backdrop as Element);
    expect(dialog).toBeVisible();
    expect(screen.getByRole("dialog", { name: "测试表单" })).toBeVisible();
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

  it("内层 ConfirmDialog 打开时外层 FormDialog 不抢焦点", async () => {
    const user = userEvent.setup();
    function NestedHarness() {
      const [confirmOpen, setConfirmOpen] = useState(false);
      return (
        <FormDialog onClose={() => undefined} title="外层表单">
          <button onClick={() => setConfirmOpen(true)} type="button">
            打开确认
          </button>
          {confirmOpen ? (
            <ConfirmDialog
              onCancel={() => setConfirmOpen(false)}
              onConfirm={() => setConfirmOpen(false)}
              title="内层确认"
            />
          ) : null}
        </FormDialog>
      );
    }

    render(<NestedHarness />);
    await user.click(await screen.findByRole("button", { name: "打开确认" }));
    const confirm = await screen.findByRole("dialog", { name: "内层确认" });
    await waitFor(() => {
      expect(confirm.contains(document.activeElement)).toBe(true);
    });
    expect(
      screen.getByRole("dialog", { hidden: true, name: "外层表单" }),
    ).toBeInTheDocument();
  });
});
