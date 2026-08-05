"use client";

import type { ApiClient, ApiComponents } from "@point-quest/api-client";
import { Button, Card } from "@point-quest/ui";
import { CheckCircle2, ImageUp, LoaderCircle, Save } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";
import {
  isAbsoluteProductImageUrl,
  productImageUrl,
} from "@/lib/product-image";

type Schemas = ApiComponents["schemas"];
type Product = Schemas["ProductDto"];
type ProductApi = Pick<
  ApiClient,
  "createAdminProduct" | "updateAdminProduct" | "uploadAdminProductImage"
>;

export type ProductFormValue = {
  name: string;
  description: string;
  imageKey: string;
  stock: number;
  pointsCost: number;
  isActive: boolean;
};

type ProductFormProps = {
  api?: ProductApi;
  initialProduct?: Product;
  mode: "create" | "edit";
  onPendingChange?: (pending: boolean) => void;
  onSaved?: (product: Product) => void;
  productId?: string;
};

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maximumImageBytes = 5 * 1024 * 1024;
const maximumInteger = 2_147_483_647;

function validateProduct(
  name: string,
  description: string,
  stockText: string,
  pointsCostText: string,
  image: File | null,
  imageKey: string | null,
): string[] {
  const errors: string[] = [];
  if (!name.trim()) errors.push("请输入商品名称");
  else if (Array.from(name.trim()).length > 200) {
    errors.push("商品名称不能超过 200 个字符");
  }
  if (!description.trim()) errors.push("请输入商品描述");
  else if (Array.from(description.trim()).length > 5_000) {
    errors.push("商品描述不能超过 5000 个字符");
  }
  const stock = Number(stockText);
  if (!Number.isInteger(stock) || stock < 0 || stock > maximumInteger) {
    errors.push("库存必须是非负整数");
  }
  const pointsCost = Number(pointsCostText);
  if (
    !Number.isInteger(pointsCost) ||
    pointsCost <= 0 ||
    pointsCost > maximumInteger
  ) {
    errors.push("花费积分必须是正整数");
  }
  if (!image && !imageKey) errors.push("请选择商品图片");
  if (image && !allowedImageTypes.has(image.type)) {
    errors.push("图片只支持 JPG、PNG 或 WebP");
  }
  if (image && image.size > maximumImageBytes) {
    errors.push("图片不能超过 5 MB");
  }
  return errors;
}

export function ProductForm({
  api = browserApiClient,
  initialProduct,
  mode,
  onPendingChange,
  onSaved,
  productId,
}: ProductFormProps) {
  const [name, setName] = useState(initialProduct?.name ?? "");
  const [description, setDescription] = useState(
    initialProduct?.description ?? "",
  );
  const [stock, setStock] = useState(String(initialProduct?.stock ?? 0));
  const [pointsCost, setPointsCost] = useState(
    String(initialProduct?.pointsCost ?? 1),
  );
  const [isActive, setIsActive] = useState(initialProduct?.isActive ?? true);
  const [imageKey, setImageKey] = useState<string | null>(
    initialProduct?.imageKey ?? null,
  );
  const [image, setImage] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");
  const [saved, setSaved] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localPreview = useMemo(
    () => (image ? URL.createObjectURL?.(image) : null),
    [image],
  );
  const previewSrc = localPreview ?? (imageKey ? productImageUrl(imageKey) : null);
  const pending = phase !== "idle";

  useEffect(() => {
    onPendingChange?.(pending);
    return () => onPendingChange?.(false);
  }, [onPendingChange, pending]);

  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL?.(localPreview);
    },
    [localPreview],
  );

  function willDeactivateOnSave() {
    return mode === "edit" && Boolean(initialProduct?.isActive) && !isActive;
  }

  function requestSubmit() {
    if (pending) return;
    const validationErrors = validateProduct(
      name,
      description,
      stock,
      pointsCost,
      image,
      imageKey,
    );
    setErrors(validationErrors);
    setSaved(false);
    if (validationErrors.length > 0) return;
    if (willDeactivateOnSave()) {
      setSubmitError(null);
      setConfirmDeactivate(true);
      return;
    }
    void performSubmit();
  }

  async function performSubmit() {
    if (pending) return;
    setSubmitError(null);
    let nextImageKey = imageKey;
    try {
      if (image) {
        setPhase("uploading");
        const uploaded = await api.uploadAdminProductImage(image, image.name);
        nextImageKey = uploaded.key;
        setImageKey(uploaded.key);
        setImage(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
      if (!nextImageKey) return;
      setPhase("saving");
      const value: ProductFormValue = {
        name: name.trim(),
        description: description.trim(),
        imageKey: nextImageKey,
        stock: Number(stock),
        pointsCost: Number(pointsCost),
        isActive,
      };
      const product =
        mode === "create"
          ? await api.createAdminProduct(value)
          : await api.updateAdminProduct(
              productId ?? initialProduct?.id ?? "",
              value,
            );
      setSaved(true);
      setImage(null);
      setConfirmDeactivate(false);
      onSaved?.(product);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    } finally {
      setPhase("idle");
    }
  }

  return (
    <Card className="admin-form-card">
      {confirmDeactivate ? (
        <ConfirmDialog
          cancelLabel="取消"
          confirmLabel="下架商品"
          confirmVariant="danger"
          description="下架后学员将无法在积分商城兑换该商品。"
          error={submitError}
          onCancel={() => {
            if (!pending) {
              setConfirmDeactivate(false);
              setSubmitError(null);
            }
          }}
          onConfirm={() => void performSubmit()}
          pending={pending}
          title={`确认下架商品「${name.trim() || initialProduct?.name || "未命名"}」？`}
        />
      ) : null}
      <form
        className="admin-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          requestSubmit();
        }}
      >
        <div className="admin-form__grid">
          <label className="admin-field">
            <span>商品名称</span>
            <input
              aria-label="商品名称"
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </label>
          <label className="admin-field">
            <span>库存数量</span>
            <input
              aria-label="库存数量"
              inputMode="numeric"
              max={maximumInteger}
              min={0}
              onChange={(event) => setStock(event.target.value)}
              step={1}
              type="number"
              value={stock}
            />
          </label>
          <label className="admin-field">
            <span>花费积分</span>
            <input
              aria-label="花费积分"
              inputMode="numeric"
              max={maximumInteger}
              min={1}
              onChange={(event) => setPointsCost(event.target.value)}
              step={1}
              type="number"
              value={pointsCost}
            />
          </label>
          <label className="admin-switch">
            <input
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              type="checkbox"
            />
            <span>上架商品</span>
          </label>
          <label className="admin-field admin-field--wide">
            <span>商品描述</span>
            <textarea
              aria-label="商品描述"
              maxLength={5_000}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              value={description}
            />
          </label>
          <label className="admin-field admin-field--wide">
            <span>商品图片</span>
            <input
              accept="image/jpeg,image/png,image/webp"
              aria-label="商品图片"
              onChange={(event) => setImage(event.target.files?.[0] ?? null)}
              ref={fileInputRef}
              type="file"
            />
            <small>JPG、PNG 或 WebP，最大 5 MB</small>
          </label>
        </div>

        {previewSrc ? (
          <div className="admin-image-preview">
            <Image
              alt="商品图片预览"
              height={180}
              src={previewSrc}
              unoptimized={
                Boolean(localPreview) || isAbsoluteProductImageUrl(previewSrc)
              }
              width={240}
            />
            <span>{image?.name ?? "当前商品图片"}</span>
          </div>
        ) : null}

        {errors.length > 0 ? (
          <div className="admin-form__errors" role="alert">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}
        {submitError && !confirmDeactivate ? (
          <p className="admin-form__errors" role="alert">
            {submitError}
          </p>
        ) : null}
        {saved ? (
          <p className="success-banner" role="status">
            <CheckCircle2 aria-hidden="true" />
            商品已保存
          </p>
        ) : null}

        <div className="admin-form__actions">
          <Button disabled={pending} type="submit">
            {phase === "uploading" ? (
              <ImageUp aria-hidden="true" />
            ) : phase === "saving" ? (
              <LoaderCircle aria-hidden="true" className="spin" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {phase === "uploading"
              ? "正在上传图片"
              : phase === "saving"
                ? "正在保存商品"
                : submitError
                  ? "重试保存商品"
                  : "保存商品"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
