"use client";

import type { ApiComponents } from "@point-quest/api-client";
import { Button } from "@point-quest/ui";
import { Ban, CircleCheck, LoaderCircle, X } from "lucide-react";
import { Fragment, type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type AdminOrder = ApiComponents["schemas"]["AdminOrderDto"];
export type OrderStatusAction = "cancel" | "complete";

type OrderStatusDialogProps = {
  action: OrderStatusAction;
  error?: string | null;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
  order: AdminOrder;
  pending?: boolean;
};

const presentation = {
  cancel: {
    Icon: Ban,
    confirm: "确认取消并退款",
    description: "取消后会原路退还积分，并把商品库存加回。",
    title: "确认取消订单",
  },
  complete: {
    Icon: CircleCheck,
    confirm: "确认完成订单",
    description: "确认商品已交付后，订单将标记为已完成。",
    title: "确认完成订单",
  },
} as const;

export function OrderStatusDialog({
  action,
  error,
  fallbackFocusRef,
  onCancel,
  onConfirm,
  order,
  pending = false,
}: OrderStatusDialogProps) {
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const latestCancel = useRef(onCancel);
  const pendingRef = useRef(pending);
  const content = presentation[action];
  const Icon = content.Icon;

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
          'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
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

  return createPortal(
    <Fragment>
      <button
        aria-hidden="true"
        className="dialog-backdrop"
        disabled={pending}
        onClick={() => {
          if (!pendingRef.current) latestCancel.current();
        }}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-label={content.title}
        aria-modal="true"
        className="order-status-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <button
          aria-label="关闭订单确认"
          className="dialog-close"
          disabled={pending}
          onClick={() => {
            if (!pendingRef.current) latestCancel.current();
          }}
          type="button"
        >
          <X aria-hidden="true" />
        </button>
        <div
          className={`order-status-dialog__icon order-status-dialog__icon--${action}`}
        >
          <Icon aria-hidden="true" />
        </div>
        <div>
          <p className="page-kicker">订单状态确认</p>
          <h2>{content.title}</h2>
          <p>{content.description}</p>
        </div>
        <dl className="order-dialog-summary">
          <div>
            <dt>订单号</dt>
            <dd>{order.orderNo}</dd>
          </div>
          <div>
            <dt>学员</dt>
            <dd>{order.user.username}</dd>
          </div>
          <div>
            <dt>商品</dt>
            <dd>{order.productNameSnapshot}</dd>
          </div>
        </dl>
        {error ? (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dialog-actions">
          <Button
            disabled={pending}
            onClick={() => {
              if (!pendingRef.current) latestCancel.current();
            }}
            variant="secondary"
          >
            返回订单
          </Button>
          <Button
            disabled={pending}
            onClick={onConfirm}
            variant={action === "cancel" ? "danger" : "primary"}
          >
            {pending ? (
              <LoaderCircle aria-hidden="true" className="spin" />
            ) : (
              <Icon aria-hidden="true" />
            )}
            {pending
              ? "正在处理"
              : error
                ? `重试${content.confirm.slice(2)}`
                : content.confirm}
          </Button>
        </div>
      </div>
    </Fragment>,
    portalHost,
  );
}
