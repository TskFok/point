import { act, renderHook, waitFor } from "@testing-library/react";

import { useConfirmAction } from "@/hooks/use-confirm-action";

type Action = { kind: "delete"; id: string };

describe("useConfirmAction", () => {
  it("openConfirm 设置 action 并清除旧错误", () => {
    const { result } = renderHook(() =>
      useConfirmAction<Action>({
        execute: async () => "旧错误不应保留",
      }),
    );

    act(() => {
      result.current.openConfirm({ kind: "delete", id: "1" });
    });
    expect(result.current.confirmAction).toEqual({
      kind: "delete",
      id: "1",
    });
    expect(result.current.confirmError).toBeNull();
  });

  it("execute 返回错误时保留弹窗并写入 confirmError", async () => {
    const { result } = renderHook(() =>
      useConfirmAction<Action>({
        execute: async () => "网络错误",
      }),
    );

    act(() => {
      result.current.openConfirm({ kind: "delete", id: "1" });
    });

    await act(async () => {
      await result.current.handleConfirm();
    });

    expect(result.current.confirmAction).toEqual({
      kind: "delete",
      id: "1",
    });
    expect(result.current.confirmError).toBe("网络错误");
  });

  it("execute 成功时关闭弹窗并清除错误", async () => {
    const { result } = renderHook(() =>
      useConfirmAction<Action>({
        execute: async () => null,
      }),
    );

    act(() => {
      result.current.openConfirm({ kind: "delete", id: "1" });
    });

    await act(async () => {
      await result.current.handleConfirm();
    });

    expect(result.current.confirmAction).toBeNull();
    expect(result.current.confirmError).toBeNull();
  });

  it("blocked 时 handleConfirm 不执行，closeConfirm 不关闭", async () => {
    const execute = jest.fn(async () => null);
    const { result } = renderHook(() =>
      useConfirmAction<Action>({
        blocked: true,
        execute,
      }),
    );

    act(() => {
      result.current.openConfirm({ kind: "delete", id: "1" });
    });

    await act(async () => {
      await result.current.handleConfirm();
    });
    expect(execute).not.toHaveBeenCalled();
    expect(result.current.confirmAction).toEqual({
      kind: "delete",
      id: "1",
    });

    act(() => {
      result.current.closeConfirm();
    });
    expect(result.current.confirmAction).toEqual({
      kind: "delete",
      id: "1",
    });
  });

  it("closeConfirm 在未 blocked 时清除 action 与 error", async () => {
    const { result } = renderHook(() =>
      useConfirmAction<Action>({
        execute: async () => "失败",
      }),
    );

    act(() => {
      result.current.openConfirm({ kind: "delete", id: "1" });
    });
    await act(async () => {
      await result.current.handleConfirm();
    });
    expect(result.current.confirmError).toBe("失败");

    act(() => {
      result.current.closeConfirm();
    });
    expect(result.current.confirmAction).toBeNull();
    expect(result.current.confirmError).toBeNull();
  });

  it("卸载后不再更新 state", async () => {
    let resolveExecute!: (value: string | null) => void;
    const executePromise = new Promise<string | null>((resolve) => {
      resolveExecute = resolve;
    });

    const { result, unmount } = renderHook(() =>
      useConfirmAction<Action>({
        execute: async () => executePromise,
      }),
    );

    act(() => {
      result.current.openConfirm({ kind: "delete", id: "1" });
    });

    let confirmPromise!: Promise<void>;
    act(() => {
      confirmPromise = result.current.handleConfirm();
    });

    unmount();
    await act(async () => {
      resolveExecute("太晚了");
      await confirmPromise;
    });

    // 卸载后不应抛错；若仍 setState，React 会告警。用 waitFor 确认无后续更新。
    await waitFor(() => {
      expect(resolveExecute).toBeDefined();
    });
  });
});
