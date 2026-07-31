"use client";

import type { ApiClient, ApiComponents } from "@point-quest/api-client";
import { Card } from "@point-quest/ui";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { QuestionForm } from "@/components/admin/question-form";
import { AsyncError } from "@/components/feedback/async-error";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type Question = ApiComponents["schemas"]["AdminQuestionDto"];
type EditorApi = Pick<
  ApiClient,
  "getAdminQuestion" | "updateAdminQuestion" | "createAdminQuestion"
>;

export function QuestionEditor({
  api = browserApiClient,
  questionId,
}: {
  api?: EditorApi;
  questionId: string;
}) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedQuestionId = useRef<string | null>(null);
  const returnTo =
    typeof window === "undefined"
      ? "/admin/questions"
      : new URLSearchParams(window.location.search).get("returnTo");
  const backHref = returnTo?.startsWith("/admin/questions")
    ? returnTo
    : "/admin/questions";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setQuestion(await api.getAdminQuestion(questionId));
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api, questionId]);

  useEffect(() => {
    if (loadedQuestionId.current === questionId) return;
    loadedQuestionId.current = questionId;
    void load();
  }, [load, questionId]);

  return (
    <section className="admin-page">
      <div className="page-heading">
        <Link className="back-link" href={backHref}>
          <ArrowLeft aria-hidden="true" />
          返回题库
        </Link>
        <div>
          <p className="page-kicker">题目维护</p>
          <h1>编辑英语选择题</h1>
          <p>已有答题记录的题目只允许停用，服务端会保护审计历史。</p>
        </div>
      </div>
      {loading ? (
        <Card aria-live="polite" className="page-loading" role="status">
          <LoaderCircle aria-hidden="true" className="spin" />
          正在加载题目
        </Card>
      ) : error ? (
        <AsyncError message={error} onRetry={() => void load()} />
      ) : question ? (
        <QuestionForm
          api={api}
          initialQuestion={question}
          mode="edit"
          onSaved={setQuestion}
          questionId={question.id}
        />
      ) : null}
    </section>
  );
}
