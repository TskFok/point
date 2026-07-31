"use client";

import type { ApiComponents } from "@point-quest/api-client";
import { Button } from "@point-quest/ui";
import { Coins, LoaderCircle, ShoppingBag, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef } from "react";

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
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const activeElement = document.activeElement as HTMLElement | null;
    dialogRef.current
      ?.querySelector<HTMLButtonElement>("[data-redeem-confirm]")
      ?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      activeElement?.focus();
    };
  }, [onCancel, pending]);

  return (
    <div className="dialog-layer">
      <button
        aria-label="关闭兑换确认"
        className="dialog-backdrop"
        disabled={pending}
        onClick={onCancel}
        type="button"
      />
      <div
        aria-label="确认兑换商品"
        aria-modal="true"
        className="redeem-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <button
          aria-label="关闭"
          className="dialog-close"
          disabled={pending}
          onClick={onCancel}
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
          <Button disabled={pending} onClick={onCancel} variant="secondary">
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
    </div>
  );
}
