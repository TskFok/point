"use client";

import type { ApiClient, ApiComponents } from "@point-quest/api-client";
import { Button, Card } from "@point-quest/ui";
import { CheckCircle2, LoaderCircle, Save, Wifi } from "lucide-react";
import { useEffect, useState } from "react";

import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type Schemas = ApiComponents["schemas"];
type AiModel = Schemas["AiModelConfigDto"];
type ProbeResult = Schemas["AiModelProbeResultDto"];
type AiModelApi = Pick<
  ApiClient,
  | "createAdminAiModel"
  | "updateAdminAiModel"
  | "testAdminAiModelDraft"
>;

type AiModelFormProps = {
  api?: AiModelApi;
  initialModel?: AiModel;
  mode: "create" | "edit";
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
  onSaved?: (model: AiModel) => void;
};

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function AiModelForm({
  api = browserApiClient,
  initialModel,
  mode,
  onCancel,
  onPendingChange,
  onSaved,
}: AiModelFormProps) {
  const [name, setName] = useState(initialModel?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(initialModel?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [isEnabled, setIsEnabled] = useState(initialModel?.isEnabled ?? true);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [probeMessage, setProbeMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const pending = saving || testing;

  useEffect(() => {
    onPendingChange?.(pending);
    return () => onPendingChange?.(false);
  }, [onPendingChange, pending]);

  function validate(): string[] {
    const next: string[] = [];
    if (!name.trim()) next.push("请输入模型名称");
    else if (Array.from(name.trim()).length > 100) {
      next.push("模型名称不能超过 100 个字符");
    }
    if (!baseUrl.trim()) next.push("请输入调用地址");
    else if (!isHttpUrl(baseUrl.trim())) {
      next.push("调用地址必须是 http 或 https URL");
    }
    if (mode === "create" && !apiKey.trim()) {
      next.push("请输入 API Key");
    }
    return next;
  }

  async function submit() {
    if (saving || testing) return;
    const validationErrors = validate();
    setErrors(validationErrors);
    setSaved(false);
    setProbeMessage(null);
    if (validationErrors.length > 0) return;

    setSaving(true);
    setSubmitError(null);
    try {
      const model =
        mode === "create"
          ? await api.createAdminAiModel({
              name: name.trim(),
              baseUrl: baseUrl.trim(),
              apiKey: apiKey.trim(),
              isEnabled,
            })
          : await api.updateAdminAiModel(initialModel?.id ?? "", {
              name: name.trim(),
              baseUrl: baseUrl.trim(),
              isEnabled,
              ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
            });
      setSaved(true);
      setApiKey("");
      onSaved?.(model);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    if (saving || testing) return;
    const validationErrors = validate().filter(
      (message) => message !== "请输入 API Key",
    );
    if (mode === "create" && !apiKey.trim()) {
      validationErrors.push("请输入 API Key");
    }
    if (
      mode === "edit" &&
      !apiKey.trim() &&
      !initialModel?.id
    ) {
      validationErrors.push("请输入 API Key");
    }
    setErrors(validationErrors);
    setProbeMessage(null);
    setSubmitError(null);
    setSaved(false);
    if (validationErrors.length > 0) return;
    if (!isHttpUrl(baseUrl.trim())) return;

    setTesting(true);
    try {
      const result: ProbeResult = await api.testAdminAiModelDraft({
        baseUrl: baseUrl.trim(),
        ...(apiKey.trim()
          ? { apiKey: apiKey.trim() }
          : { id: initialModel?.id }),
      });
      setProbeMessage(
        result.ok
          ? `连通成功（${result.latencyMs} ms${
              result.modelCount === undefined
                ? ""
                : `，${result.modelCount} 个模型`
            }）`
          : `连通失败：${result.message ?? "未知错误"}（${result.latencyMs} ms）`,
      );
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="admin-form-card">
      <form
        className="admin-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="admin-form__scroll">
        <div className="admin-form__grid">
          <label className="admin-field">
            <span>模型名称</span>
            <input
              aria-label="模型名称"
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </label>
          <label className="admin-field admin-field--wide">
            <span>调用地址</span>
            <input
              aria-label="调用地址"
              maxLength={500}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.example.com/v1"
              value={baseUrl}
            />
          </label>
          <label className="admin-field admin-field--wide">
            <span>API Key</span>
            <input
              aria-label="API Key"
              autoComplete="off"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                mode === "edit" ? "留空则不修改" : "输入服务商 API Key"
              }
              type="password"
              value={apiKey}
            />
          </label>
          <label className="admin-switch">
            <input
              checked={isEnabled}
              onChange={(event) => setIsEnabled(event.target.checked)}
              type="checkbox"
            />
            <span>启用配置</span>
          </label>
        </div>

        {errors.length > 0 ? (
          <div className="admin-form__errors" role="alert">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}
        {submitError ? (
          <p className="admin-form__errors" role="alert">
            {submitError}
          </p>
        ) : null}
        {probeMessage ? (
          <p
            className={
              probeMessage.startsWith("连通成功")
                ? "success-banner"
                : "admin-form__errors"
            }
            role="status"
          >
            {probeMessage}
          </p>
        ) : null}
        {saved ? (
          <p className="success-banner" role="status">
            <CheckCircle2 aria-hidden="true" />
            模型配置已保存
          </p>
        ) : null}
        </div>

        <div className="admin-form__actions">
          <Button disabled={saving || testing} type="submit">
            {saving ? (
              <LoaderCircle aria-hidden="true" className="spin" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {saving ? "正在保存" : "保存配置"}
          </Button>
          <Button
            disabled={saving || testing}
            onClick={() => void testConnection()}
            type="button"
            variant="secondary"
          >
            {testing ? (
              <LoaderCircle aria-hidden="true" className="spin" />
            ) : (
              <Wifi aria-hidden="true" />
            )}
            {testing ? "正在测试" : "测试连通"}
          </Button>
          {onCancel ? (
            <Button
              disabled={saving || testing}
              onClick={onCancel}
              type="button"
              variant="secondary"
            >
              取消
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
