"use client";

import {
  ApiClientError,
  type ApiClient,
  type ApiComponents,
} from "@point-quest/api-client";
import { Button, Card } from "@point-quest/ui";
import { CheckCircle2, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type Schemas = ApiComponents["schemas"];
type AdminQuestion = Schemas["AdminQuestionDto"];
type QuestionApi = Pick<
  ApiClient,
  "createAdminQuestion" | "updateAdminQuestion"
>;

export type QuestionFormValue = {
  stem: string;
  explanation: string;
  basePoints: number;
  options: Array<{
    label: string;
    content: string;
    position: number;
    isCorrect: boolean;
  }>;
  isActive: boolean;
};

type EditableOption = {
  key: number;
  label: string;
  content: string;
  isCorrect: boolean;
};

type QuestionFormProps = {
  api?: QuestionApi;
  initialQuestion?: AdminQuestion;
  mode: "create" | "edit";
  onPendingChange?: (pending: boolean) => void;
  onSaved?: (question: AdminQuestion) => void;
  questionId?: string;
};

function defaultOptions(): EditableOption[] {
  return [
    { key: 0, label: "A", content: "", isCorrect: false },
    { key: 1, label: "B", content: "", isCorrect: false },
  ];
}

function validateQuestion(
  stem: string,
  explanation: string,
  basePointsText: string,
  options: EditableOption[],
): string[] {
  const errors: string[] = [];
  if (!stem.trim()) errors.push("请输入题干");
  else if (Array.from(stem.trim()).length > 2_000) {
    errors.push("题干不能超过 2000 个字符");
  }
  if (!explanation.trim()) errors.push("请输入题目解析");
  else if (Array.from(explanation.trim()).length > 5_000) {
    errors.push("题目解析不能超过 5000 个字符");
  }
  const basePoints = Number(basePointsText);
  if (!Number.isInteger(basePoints) || basePoints < 1 || basePoints > 1_000) {
    errors.push("基础积分必须是 1–1000 的整数");
  }
  if (options.length < 2 || options.length > 6) {
    errors.push("题目必须包含 2–6 个选项");
  }
  const normalizedLabels = options.map(({ label }) => label.trim());
  if (
    normalizedLabels.some((label) => !label || Array.from(label).length > 16)
  ) {
    errors.push("每个选项标签必须为 1–16 个字符");
  }
  if (new Set(normalizedLabels).size !== normalizedLabels.length) {
    errors.push("选项标签不能重复");
  }
  if (
    options.some(
      ({ content }) =>
        !content.trim() || Array.from(content.trim()).length > 1_000,
    )
  ) {
    errors.push("每个选项内容必须为 1–1000 个字符");
  }
  if (options.filter(({ isCorrect }) => isCorrect).length !== 1) {
    errors.push("请选择且只能选择一个正确答案");
  }
  return errors;
}

export function QuestionForm({
  api = browserApiClient,
  initialQuestion,
  mode,
  onPendingChange,
  onSaved,
  questionId,
}: QuestionFormProps) {
  const [stem, setStem] = useState(initialQuestion?.stem ?? "");
  const [explanation, setExplanation] = useState(
    initialQuestion?.explanation ?? "",
  );
  const [basePoints, setBasePoints] = useState(
    String(initialQuestion?.basePoints ?? 10),
  );
  const [isActive, setIsActive] = useState(initialQuestion?.isActive ?? true);
  const [options, setOptions] = useState<EditableOption[]>(
    initialQuestion
      ? initialQuestion.options.map((option, index) => ({
          key: index,
          label: option.label,
          content: option.content,
          isCorrect: option.isCorrect,
        }))
      : defaultOptions(),
  );
  const [nextOptionKey, setNextOptionKey] = useState(
    initialQuestion?.options.length ?? 2,
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasAttempts, setHasAttempts] = useState(
    initialQuestion?.hasAttempts ?? false,
  );
  const readOnly = mode === "edit" && hasAttempts;

  useEffect(() => {
    onPendingChange?.(saving);
    return () => onPendingChange?.(false);
  }, [onPendingChange, saving]);

  function updateOption(
    key: number,
    changes: Partial<Omit<EditableOption, "key">>,
  ) {
    setOptions((current) =>
      current.map((option) =>
        option.key === key ? { ...option, ...changes } : option,
      ),
    );
  }

  async function submit() {
    if (saving || readOnly) return;
    const validationErrors = validateQuestion(
      stem,
      explanation,
      basePoints,
      options,
    );
    setErrors(validationErrors);
    setSuccessMessage(null);
    if (validationErrors.length > 0) return;

    const value: QuestionFormValue = {
      stem: stem.trim(),
      explanation: explanation.trim(),
      basePoints: Number(basePoints),
      isActive,
      options: options.map((option, position) => ({
        label: option.label.trim(),
        content: option.content.trim(),
        position,
        isCorrect: option.isCorrect,
      })),
    };
    setSaving(true);
    setSubmitError(null);
    try {
      const question =
        mode === "create"
          ? await api.createAdminQuestion(value)
          : await api.updateAdminQuestion(
              questionId ?? initialQuestion?.id ?? "",
              value,
            );
      setSuccessMessage("题目已保存");
      onSaved?.(question);
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.body.code === "QUESTION_HAS_ATTEMPTS"
      ) {
        setHasAttempts(true);
        setSubmitError("题目已有答题记录，内容已切换为只读；你仍可停用题目");
      } else {
        setSubmitError(getApiErrorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  }

  async function disableQuestion() {
    if (saving || !isActive) return;
    setSaving(true);
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      const question = await api.updateAdminQuestion(
        questionId ?? initialQuestion?.id ?? "",
        { isActive: false },
      );
      setIsActive(false);
      setSuccessMessage("题目已停用");
      setConfirmDisable(false);
      onSaved?.(question);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="admin-form-card">
      {confirmDisable ? (
        <ConfirmDialog
          cancelLabel="取消"
          confirmLabel="停用题目"
          confirmVariant="danger"
          description="停用后该题目将不再进入练习池。"
          error={submitError}
          onCancel={() => {
            if (!saving) {
              setConfirmDisable(false);
              setSubmitError(null);
            }
          }}
          onConfirm={() => void disableQuestion()}
          pending={saving}
          title="确认停用该题目？"
        />
      ) : null}
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
          <label className="admin-field admin-field--wide">
            <span>题干</span>
            <textarea
              aria-label="题干"
              disabled={readOnly}
              maxLength={2_000}
              onChange={(event) => setStem(event.target.value)}
              rows={4}
              value={stem}
            />
            <small>{Array.from(stem).length} / 2000</small>
          </label>
          <label className="admin-field admin-field--wide">
            <span>题目解析</span>
            <textarea
              aria-label="题目解析"
              disabled={readOnly}
              maxLength={5_000}
              onChange={(event) => setExplanation(event.target.value)}
              rows={4}
              value={explanation}
            />
            <small>{Array.from(explanation).length} / 5000</small>
          </label>
          <label className="admin-field">
            <span>基础积分</span>
            <input
              aria-label="基础积分"
              disabled={readOnly}
              inputMode="numeric"
              max={1_000}
              min={1}
              onChange={(event) => setBasePoints(event.target.value)}
              step={1}
              type="number"
              value={basePoints}
            />
            <small>1–1000 的整数</small>
          </label>
          <label className="admin-switch">
            <input
              checked={isActive}
              disabled={readOnly}
              onChange={(event) => setIsActive(event.target.checked)}
              type="checkbox"
            />
            <span>启用题目</span>
          </label>
        </div>

        <div className="admin-form__section-heading">
          <div>
            <h2>答案选项</h2>
            <p>设置 2–6 个选项，并选择唯一正确答案。</p>
          </div>
          <Button
            disabled={readOnly || options.length >= 6 || saving}
            onClick={() => {
              const label = String.fromCharCode(65 + options.length);
              setOptions((current) => [
                ...current,
                {
                  key: nextOptionKey,
                  label,
                  content: "",
                  isCorrect: false,
                },
              ]);
              setNextOptionKey((current) => current + 1);
            }}
            variant="secondary"
          >
            <Plus aria-hidden="true" />
            添加选项
          </Button>
        </div>

        <div className="question-options-editor">
          {options.map((option, index) => {
            const displayName = String.fromCharCode(65 + index);
            return (
              <fieldset
                aria-label={`选项 ${displayName}`}
                className="question-option-editor"
                key={option.key}
              >
                <legend className="sr-only">选项 {displayName}</legend>
                <label className="admin-field question-option-editor__label">
                  <span>选项 {displayName} 标签</span>
                  <input
                    aria-label={`选项 ${displayName} 标签`}
                    disabled={readOnly}
                    maxLength={16}
                    onChange={(event) =>
                      updateOption(option.key, { label: event.target.value })
                    }
                    value={option.label}
                  />
                </label>
                <label className="admin-field question-option-editor__content">
                  <span>选项 {displayName} 内容</span>
                  <input
                    aria-label={`选项 ${displayName} 内容`}
                    disabled={readOnly}
                    maxLength={1_000}
                    onChange={(event) =>
                      updateOption(option.key, { content: event.target.value })
                    }
                    value={option.content}
                  />
                </label>
                <label className="question-option-editor__correct">
                  <input
                    aria-label={`将选项 ${displayName} 设为正确答案`}
                    checked={option.isCorrect}
                    disabled={readOnly}
                    name="correct-option"
                    onChange={() =>
                      setOptions((current) =>
                        current.map((item) => ({
                          ...item,
                          isCorrect: item.key === option.key,
                        })),
                      )
                    }
                    type="radio"
                  />
                  <CheckCircle2 aria-hidden="true" />
                  正确答案
                </label>
                <Button
                  aria-label={`删除选项 ${displayName}`}
                  disabled={readOnly || options.length <= 2 || saving}
                  onClick={() =>
                    setOptions((current) =>
                      current.filter((item) => item.key !== option.key),
                    )
                  }
                  variant="secondary"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </fieldset>
            );
          })}
        </div>

        {errors.length > 0 ? (
          <div className="admin-form__errors" role="alert">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}
        {submitError && !confirmDisable ? (
          <p className="admin-form__errors" role="alert">
            {submitError}
          </p>
        ) : null}
        {successMessage ? (
          <p className="success-banner" role="status">
            <CheckCircle2 aria-hidden="true" />
            {successMessage}
          </p>
        ) : null}
        </div>

        <div className="admin-form__actions">
          {readOnly ? (
            isActive ? (
              <Button
                disabled={saving}
                onClick={() => {
                  setSubmitError(null);
                  setConfirmDisable(true);
                }}
                type="button"
              >
                {saving ? (
                  <LoaderCircle aria-hidden="true" className="spin" />
                ) : (
                  <Save aria-hidden="true" />
                )}
                {saving ? "正在停用" : "停用已有记录题目"}
              </Button>
            ) : (
              <p className="admin-readonly-note">已有答题记录，题目已停用。</p>
            )
          ) : (
            <Button disabled={saving} type="submit">
              {saving ? (
                <LoaderCircle aria-hidden="true" className="spin" />
              ) : (
                <Save aria-hidden="true" />
              )}
              {saving ? "正在保存" : submitError ? "重试保存题目" : "保存题目"}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
