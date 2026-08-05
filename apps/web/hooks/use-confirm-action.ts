"use client";

import { useEffect, useRef, useState } from "react";

export type UseConfirmActionOptions<TAction> = {
  /** 为 true 时不执行确认、也不允许关闭弹窗（如 busyId 占用中） */
  blocked?: boolean;
  /** 执行确认动作；返回错误文案则保留弹窗，返回 null 则关闭 */
  execute: (action: TAction) => Promise<string | null>;
};

export type UseConfirmActionResult<TAction> = {
  confirmAction: TAction | null;
  confirmError: string | null;
  openConfirm: (action: TAction) => void;
  closeConfirm: () => void;
  handleConfirm: () => Promise<void>;
};

export function useConfirmAction<TAction>({
  blocked = false,
  execute,
}: UseConfirmActionOptions<TAction>): UseConfirmActionResult<TAction> {
  const [confirmAction, setConfirmAction] = useState<TAction | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function openConfirm(action: TAction) {
    setConfirmError(null);
    setConfirmAction(action);
  }

  function closeConfirm() {
    if (blocked) return;
    setConfirmAction(null);
    setConfirmError(null);
  }

  async function handleConfirm() {
    if (!confirmAction || blocked) return;
    setConfirmError(null);
    const error = await execute(confirmAction);
    if (!mounted.current) return;
    if (error) {
      setConfirmError(error);
      return;
    }
    setConfirmAction(null);
  }

  return {
    confirmAction,
    confirmError,
    openConfirm,
    closeConfirm,
    handleConfirm,
  };
}
