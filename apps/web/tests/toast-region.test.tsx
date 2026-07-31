import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  ToastProvider,
  useToast,
} from "@/components/feedback/toast-region";

function ToastHarness() {
  const { pushToast } = useToast();
  return (
    <>
      <button onClick={() => pushToast("第一条", "danger")} type="button">
        第一条
      </button>
      <button onClick={() => pushToast("第二条", "success")} type="button">
        第二条
      </button>
    </>
  );
}

describe("Toast 通知区域", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("每条通知独立在四秒后礼貌消失", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "第一条" }));
    expect(screen.getByRole("status", { name: "第一条" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    act(() => jest.advanceTimersByTime(2_000));
    await user.click(screen.getByRole("button", { name: "第二条" }));
    act(() => jest.advanceTimersByTime(2_000));

    expect(screen.queryByRole("status", { name: "第一条" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "第二条" })).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(2_000));
    expect(screen.queryByRole("status", { name: "第二条" })).not.toBeInTheDocument();
  });

  it("卸载时清理仍在等待的通知计时器", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const view = render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "第一条" }));
    await user.click(screen.getByRole("button", { name: "第二条" }));
    expect(jest.getTimerCount()).toBe(2);

    view.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
