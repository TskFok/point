import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function Harness({
  pending = false,
  error = null,
}: {
  pending?: boolean;
  error?: string | null;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return <button type="button">已关闭</button>;
  return (
    <ConfirmDialog
      cancelLabel="取消"
      confirmLabel="退出登录"
      confirmVariant="danger"
      error={error}
      onCancel={() => setOpen(false)}
      onConfirm={() => setOpen(false)}
      pending={pending}
      title="确定要退出登录吗？"
    />
  );
}

describe("ConfirmDialog", () => {
  it("渲染标题与操作按钮", async () => {
    render(<Harness />);
    const dialog = await screen.findByRole("dialog", {
      name: "确定要退出登录吗？",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "取消" })).toBeVisible();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeVisible();
    expect(dialog.closest(".dialog-layer")?.parentElement).toBe(document.body);
  });

  it("点击确认触发 onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmDialog
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="确认操作"
      />,
    );
    await screen.findByRole("dialog", { name: "确认操作" });
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("点击取消触发 onCancel", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole("dialog", { name: "确定要退出登录吗？" });
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(await screen.findByRole("button", { name: "已关闭" })).toBeVisible();
  });

  it("按 Escape 关闭", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole("dialog", { name: "确定要退出登录吗？" });
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("button", { name: "已关闭" })).toBeVisible();
  });

  it("点击遮罩关闭", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole("dialog", { name: "确定要退出登录吗？" });
    const backdrop = document.querySelector(".dialog-backdrop");
    expect(backdrop).toBeTruthy();
    await user.click(backdrop as Element);
    expect(await screen.findByRole("button", { name: "已关闭" })).toBeVisible();
  });

  it("pending 时禁用操作且 Esc/遮罩/关闭不触发 onCancel", async () => {
    const user = userEvent.setup();
    render(<Harness pending />);
    const dialog = await screen.findByRole("dialog", {
      name: "确定要退出登录吗？",
    });
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "关闭" })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();

    const backdrop = document.querySelector(".dialog-backdrop");
    expect(backdrop).toBeDisabled();
    await user.click(backdrop as Element);
    expect(dialog).toBeVisible();

    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(
      screen.getByRole("dialog", { name: "确定要退出登录吗？" }),
    ).toBeVisible();
  });

  it("展示 error 文案", async () => {
    render(<Harness error="网络连接失败，请检查网络后重试" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络连接失败，请检查网络后重试",
    );
  });

  it("打开后焦点落在弹窗内", async () => {
    render(<Harness />);
    const dialog = await screen.findByRole("dialog", {
      name: "确定要退出登录吗？",
    });
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });
});
