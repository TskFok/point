"use client";

import type { ApiClient } from "@point-quest/api-client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type LogoutApi = Pick<ApiClient, "logout">;

export function LogoutButton({
  api = browserApiClient,
}: {
  api?: LogoutApi;
} = {}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        onClick={() => void handleLogout()}
        type="button"
      >
        <LogOut aria-hidden="true" />
        <span>{pending ? "退出中…" : "退出"}</span>
      </button>
      {error ? (
        <p aria-live="assertive" className="sidebar-logout__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
