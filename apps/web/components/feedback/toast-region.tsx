"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastTone = "info" | "success" | "danger";
type Toast = { id: number; message: string; tone: ToastTone };
type ToastContextValue = {
  dismissToast: (id: number) => void;
  pushToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [...current, { id, message, tone }]);
  }, []);

  const value = useMemo(
    () => ({ dismissToast, pushToast }),
    [dismissToast, pushToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-label="通知"
        aria-live="polite"
        className="toast-region"
        role="region"
      >
        {toasts.map((toast) => (
          <div
            className={`toast toast--${toast.tone}`}
            key={toast.id}
            role={toast.tone === "danger" ? "alert" : "status"}
          >
            <span>{toast.message}</span>
            <button
              aria-label="关闭通知"
              onClick={() => dismissToast(toast.id)}
              type="button"
            >
              关闭
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast 必须在 ToastProvider 内使用");
  }
  return context;
}
