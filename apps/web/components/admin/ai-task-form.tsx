"use client";

import type { ApiClient, ApiComponents } from "@point-quest/api-client";
import { Button, Card } from "@point-quest/ui";
import { CheckCircle2, LoaderCircle, Save } from "lucide-react";
import { useState } from "react";

import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type Schemas = ApiComponents["schemas"];
type AiTask = Schemas["AiTaskDto"];
type AiTaskApi = Pick<
  ApiClient,
  "createAdminAiTask" | "updateAdminAiTask"
>;

export type AiTaskModelOption = {
  id: string;
  name: string;
};

type AiTaskFormProps = {
  api?: AiTaskApi;
  initialTask?: AiTask;
  mode: "create" | "edit";
  models: AiTaskModelOption[];
  onCancel?: () => void;
  onSaved?: (task: AiTask) => void;
};

export function AiTaskForm({
  api = browserApiClient,
  initialTask,
  mode,
  models,
  onCancel,
  onSaved,
}: AiTaskFormProps) {
  const [name, setName] = useState(initialTask?.name ?? "");
  const [aiModelConfigId, setAiModelConfigId] = useState(
    initialTask?.aiModelConfigId ?? models[0]?.id ?? "",
  );
  const [questionCount, setQuestionCount] = useState(
    String(initialTask?.questionCount ?? 5),
  );
  const [optionCount, setOptionCount] = useState(
    String(initialTask?.optionCount ?? 4),
  );
  const [basePoints, setBasePoints] = useState(
    String(initialTask?.basePoints ?? 10),
  );
  const [cronExpression, setCronExpression] = useState(
    initialTask?.cronExpression ?? "0 8 * * *",
  );
  const [isEnabled, setIsEnabled] = useState(initialTask?.isEnabled ?? true);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function validate(): string[] {
    const next: string[] = [];
    if (!name.trim()) next.push("请输入任务名称");
    else if (Array.from(name.trim()).length > 100) {
      next.push("任务名称不能超过 100 个字符");
    }
    if (!aiModelConfigId) next.push("请选择 AI 模型");
    const q = Number(questionCount);
    if (!Number.isInteger(q) || q < 1 || q > 50) {
      next.push("题目数量必须是 1–50 的整数");
    }
    const o = Number(optionCount);
    if (!Number.isInteger(o) || o < 2 || o > 6) {
      next.push("选项数量必须是 2–6 的整数");
    }
    const p = Number(basePoints);
    if (!Number.isInteger(p) || p < 1 || p > 1000) {
      next.push("基础积分必须是 1–1000 的整数");
    }
    if (!cronExpression.trim()) next.push("请输入 crontab 表达式");
    return next;
  }

  async function submit() {
    if (saving) return;
    const validationErrors = validate();
    setErrors(validationErrors);
    setSaved(false);
    setSubmitError(null);
    if (validationErrors.length > 0) return;

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        aiModelConfigId,
        questionCount: Number(questionCount),
        optionCount: Number(optionCount),
        basePoints: Number(basePoints),
        cronExpression: cronExpression.trim(),
        isEnabled,
      };
      const task =
        mode === "create"
          ? await api.createAdminAiTask(payload)
          : await api.updateAdminAiTask(initialTask!.id, payload);
      setSaved(true);
      onSaved?.(task);
    } catch (caught) {
      setSubmitError(getApiErrorMessage(caught));
    } finally {
      setSaving(false);
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
        <div className="admin-form__grid">
          <label className="admin-field">
            <span>任务名称</span>
            <input
              aria-label="任务名称"
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </label>
          <label className="admin-field">
            <span>AI 模型</span>
            <select
              aria-label="AI 模型"
              onChange={(event) => setAiModelConfigId(event.target.value)}
              value={aiModelConfigId}
            >
              {models.length === 0 ? (
                <option value="">暂无已启用模型</option>
              ) : null}
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>题目数量</span>
            <input
              aria-label="题目数量"
              inputMode="numeric"
              onChange={(event) => setQuestionCount(event.target.value)}
              value={questionCount}
            />
          </label>
          <label className="admin-field">
            <span>选项数量</span>
            <input
              aria-label="选项数量"
              inputMode="numeric"
              onChange={(event) => setOptionCount(event.target.value)}
              value={optionCount}
            />
          </label>
          <label className="admin-field">
            <span>基础积分</span>
            <input
              aria-label="基础积分"
              inputMode="numeric"
              onChange={(event) => setBasePoints(event.target.value)}
              value={basePoints}
            />
          </label>
          <label className="admin-field admin-field--wide">
            <span>crontab（例如 0 8 * * *）</span>
            <input
              aria-label="crontab"
              maxLength={100}
              onChange={(event) => setCronExpression(event.target.value)}
              placeholder="0 8 * * *"
              value={cronExpression}
            />
          </label>
          {mode === "edit" ? (
            <label className="admin-field">
              <span>当前游标 lastWord</span>
              <input
                aria-label="当前游标"
                readOnly
                value={initialTask?.lastWord ?? "（空，从字母序最前开始）"}
              />
            </label>
          ) : null}
          <label className="admin-switch">
            <input
              checked={isEnabled}
              onChange={(event) => setIsEnabled(event.target.checked)}
              type="checkbox"
            />
            <span>启用自动调度</span>
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
        {saved ? (
          <p className="success-banner" role="status">
            <CheckCircle2 aria-hidden="true" />
            任务已保存
          </p>
        ) : null}

        <div className="admin-form__actions">
          <Button disabled={saving} type="submit">
            {saving ? (
              <LoaderCircle aria-hidden="true" className="spin" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {saving ? "正在保存" : "保存"}
          </Button>
          {onCancel ? (
            <Button disabled={saving} onClick={onCancel} type="button">
              取消
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
