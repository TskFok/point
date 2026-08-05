"use client";

import type { ApiClient } from "@point-quest/api-client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type LogoutApi = Pick<ApiClient, "logout">;

export function LogoutButton({
  api = browserApiClient,
}: {
  api?: LogoutApi;
} = {}) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function closeConfirm() {
    if (pending) return;
    setConfirmOpen(false);
    setError(null);
  }

  async function handleLogout() {
    setPending(true);
    setError(null);
    try {
      await api.logout();
      router.replace("/login");
    } catch (logoutError) {
      setError(getApiErrorMessage(logoutError));
      setPending(false);
    }
  }

  return (
    <div className="sidebar-logout">
      <button
        className="sidebar-logout__button"
        disabled={pending}
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
        ref={triggerRef}
        type="button"
      >
        <LogOut aria-hidden="true" />
        <span>退出</span>
      </button>
      {confirmOpen ? (
        <ConfirmDialog
          cancelLabel="取消"
          confirmLabel={pending ? "退出中…" : "退出登录"}
          confirmVariant="danger"
          error={error}
          fallbackFocusRef={triggerRef}
          onCancel={closeConfirm}
          onConfirm={() => void handleLogout()}
          pending={pending}
          title="确定要退出登录吗？"
        />
      ) : null}
    </div>
  );
}
