"use client";

import type { ApiClient, ApiComponents } from "@point-quest/api-client";
import { Card } from "@point-quest/ui";
import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { QuestionForm } from "@/components/admin/question-form";
import { AsyncError } from "@/components/feedback/async-error";
import { FormDialog } from "@/components/ui/form-dialog";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type AdminQuestion = ApiComponents["schemas"]["AdminQuestionDto"];
type QuestionDialogApi = Pick<
  ApiClient,
  "createAdminQuestion" | "getAdminQuestion" | "updateAdminQuestion"
>;

export type QuestionFormDialogProps = {
  api?: QuestionDialogApi;
  mode: "create" | "edit";
  questionId?: string;
  onClose: () => void;
  onSaved: (question: AdminQuestion) => void;
};

export function QuestionFormDialog({
  api = browserApiClient,
  mode,
  questionId,
  onClose,
  onSaved,
}: QuestionFormDialogProps) {
  const [question, setQuestion] = useState<AdminQuestion | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formPending, setFormPending] = useState(false);

  const load = useCallback(async () => {
    if (mode !== "edit") return;
    if (!questionId) {
      await Promise.resolve();
      setLoadError("缺少题目编号");
      setLoading(false);
      return;
    }
    try {
      setQuestion(await api.getAdminQuestion(questionId));
    } catch (error) {
      setLoadError(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [api, mode, questionId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const title = mode === "create" ? "添加英语选择题" : "编辑英语选择题";

  if (loading) {
    return (
      <Card aria-live="polite" className="page-loading" role="status">
        <LoaderCircle aria-hidden="true" className="spin" />
        正在加载题目
      </Card>
    );
  }

  return (
    <FormDialog
      description="维护题干、答案、解析和基础积分。"
      onClose={onClose}
      pending={formPending}
      title={title}
    >
      {loadError ? (
        <AsyncError
          message={loadError}
          onRetry={() => {
            setLoading(true);
            setLoadError(null);
            void load();
          }}
        />
      ) : mode === "create" || question ? (
        <QuestionForm
          api={api}
          initialQuestion={question ?? undefined}
          key={mode === "create" ? "create" : question?.id}
          mode={mode}
          onPendingChange={setFormPending}
          onSaved={onSaved}
          questionId={questionId}
        />
      ) : null}
    </FormDialog>
  );
}
