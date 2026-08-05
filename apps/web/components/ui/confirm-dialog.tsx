"use client";

import { Button } from "@point-quest/ui";
import { X } from "lucide-react";
import {
  Fragment,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type ConfirmDialogProps = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  closeLabel?: string;
};

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  confirmVariant = "primary",
  pending = false,
  error = null,
  onConfirm,
  onCancel,
  fallbackFocusRef,
  closeLabel = "关闭",
}: ConfirmDialogProps) {
  const titleId = useId();
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const latestCancel = useRef(onCancel);
  const pendingRef = useRef(pending);

  useEffect(() => {
    latestCancel.current = onCancel;
    pendingRef.current = pending;
  }, [onCancel, pending]);

  useEffect(() => {
    let cancelled = false;
    const host = document.createElement("div");
    host.className = "dialog-layer";
    document.body.append(host);
    queueMicrotask(() => {
      if (!cancelled) setPortalHost(host);
    });
    return () => {
      cancelled = true;
      host.remove();
    };
  }, []);

  useEffect(() => {
    if (!portalHost || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const opener = document.activeElement as HTMLElement | null;
    const fallbackFocus = fallbackFocusRef?.current;
    const backgroundStates = Array.from(document.body.children)
      .filter((element) => element !== portalHost)
      .map((element) => {
        const htmlElement = element as HTMLElement;
        const state = {
          element: htmlElement,
          ariaHidden: htmlElement.getAttribute("aria-hidden"),
          hadInert: htmlElement.hasAttribute("inert"),
          inert: htmlElement.inert,
        };
        htmlElement.setAttribute("aria-hidden", "true");
        htmlElement.setAttribute("inert", "");
        htmlElement.inert = true;
        return state;
      });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function focusable() {
      return Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      );
    }

    function focusInside() {
      (focusable()[0] ?? dialog).focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!pendingRef.current) latestCancel.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function onFocusIn(event: FocusEvent) {
      if (!dialog.contains(event.target as Node)) focusInside();
    }

    focusInside();
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      document.body.style.overflow = previousOverflow;
      for (const state of backgroundStates) {
        if (state.ariaHidden === null) {
          state.element.removeAttribute("aria-hidden");
        } else {
          state.element.setAttribute("aria-hidden", state.ariaHidden);
        }
        if (state.hadInert) state.element.setAttribute("inert", "");
        else state.element.removeAttribute("inert");
        state.element.inert = state.inert;
      }
      if (opener?.isConnected && !("disabled" in opener && opener.disabled)) {
        opener.focus();
      } else {
        fallbackFocus?.focus();
      }
    };
  }, [fallbackFocusRef, portalHost]);

  useEffect(() => {
    if (pending) dialogRef.current?.focus();
  }, [pending]);

  if (!portalHost) return null;

  function requestCancel() {
    if (!pendingRef.current) latestCancel.current();
  }

  return createPortal(
    <Fragment>
      <button
        aria-hidden="true"
        className="dialog-backdrop"
        disabled={pending}
        onClick={requestCancel}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirm-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <button
          aria-label={closeLabel}
          className="dialog-close"
          disabled={pending}
          onClick={requestCancel}
          type="button"
        >
          <X aria-hidden="true" />
        </button>
        <header className="confirm-dialog__header">
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </header>
        {error ? (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dialog-actions">
          <Button disabled={pending} onClick={requestCancel} variant="secondary">
            {cancelLabel}
          </Button>
          <Button
            disabled={pending}
            onClick={onConfirm}
            variant={confirmVariant}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Fragment>,
    portalHost,
  );
}
