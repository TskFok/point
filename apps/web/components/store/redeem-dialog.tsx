"use client";

import type { ApiComponents } from "@point-quest/api-client";
import { Button } from "@point-quest/ui";
import { Coins, LoaderCircle, ShoppingBag, X } from "lucide-react";
import Image from "next/image";
import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { productImageUrl } from "@/lib/product-image";

type Product = ApiComponents["schemas"]["ProductDto"];

type RedeemDialogProps = {
  balance: number;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
  product: Product;
};

export function RedeemDialog({
  balance,
  error,
  onCancel,
  onConfirm,
  pending = false,
  product,
}: RedeemDialogProps) {
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const latestOnCancel = useRef(onCancel);
  const pendingRef = useRef(pending);

  useEffect(() => {
    latestOnCancel.current = onCancel;
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
    if (!portalHost) return;
    const opener = document.activeElement as HTMLElement | null;
    const currentDialog = dialogRef.current;
    if (!currentDialog) return;
    const dialog: HTMLDivElement = currentDialog;

    const backgroundStates = Array.from(document.body.children)
      .filter((element) => element !== portalHost)
      .map((element) => {
        const htmlElement = element as HTMLElement;
        const state = {
          ariaHidden: htmlElement.getAttribute("aria-hidden"),
          element: htmlElement,
          hadInertAttribute: htmlElement.hasAttribute("inert"),
          inert: htmlElement.inert,
        };
        htmlElement.setAttribute("aria-hidden", "true");
        htmlElement.setAttribute("inert", "");
        htmlElement.inert = true;
        return state;
      });

    function enabledFocusTargets() {
      return Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      );
    }

    function focusInsideDialog() {
      const focusTargets = enabledFocusTargets();
      (focusTargets[0] ?? dialog).focus();
    }

    focusInsideDialog();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!pendingRef.current) latestOnCancel.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = enabledFocusTargets();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function onFocusIn(event: FocusEvent) {
      if (!dialog.contains(event.target as Node)) {
        focusInsideDialog();
      }
    }

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
        if (state.hadInertAttribute) {
          state.element.setAttribute("inert", "");
        } else {
          state.element.removeAttribute("inert");
        }
        state.element.inert = state.inert;
      }
      if (opener?.isConnected) opener.focus();
    };
  }, [portalHost]);

  useEffect(() => {
    if (pending) dialogRef.current?.focus();
  }, [pending]);

  if (!portalHost) return null;

  return createPortal(
    <Fragment>
      <button
        aria-label="关闭兑换确认"
        className="dialog-backdrop"
        disabled={pending}
        onClick={() => {
          if (!pendingRef.current) latestOnCancel.current();
        }}
        type="button"
      />
      <div
        aria-label="确认兑换商品"
        aria-modal="true"
        className="redeem-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <button
          aria-label="关闭"
          className="dialog-close"
          disabled={pending}
          onClick={() => {
            if (!pendingRef.current) latestOnCancel.current();
          }}
          type="button"
        >
          <X aria-hidden="true" />
        </button>
        <div className="redeem-dialog__product">
          <Image
            alt=""
            height={160}
            src={productImageUrl(product.imageKey)}
            width={200}
          />
          <div>
            <p className="page-kicker">兑换确认</p>
            <h2>{product.name}</h2>
            <p>确认后将立即生成待领取订单。</p>
          </div>
        </div>
        <dl className="redeem-summary">
          <div>
            <dt>当前积分</dt>
            <dd>{balance} 积分</dd>
          </div>
          <div>
            <dt>本次兑换</dt>
            <dd>需要 {product.pointsCost} 积分</dd>
          </div>
          <div>
            <dt>兑换后</dt>
            <dd>兑换后余额 {balance - product.pointsCost} 积分</dd>
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
              if (!pendingRef.current) latestOnCancel.current();
            }}
            variant="secondary"
          >
            暂不兑换
          </Button>
          <Button
            data-redeem-confirm
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? (
              <LoaderCircle aria-hidden="true" className="spin" />
            ) : (
              <ShoppingBag aria-hidden="true" />
            )}
            {pending ? "正在兑换" : error ? "重试兑换" : "确认兑换"}
          </Button>
        </div>
        <p className="redeem-dialog__safe">
          <Coins aria-hidden="true" />
          积分与库存会在同一笔操作中安全扣减
        </p>
      </div>
    </Fragment>,
    portalHost,
  );
}
