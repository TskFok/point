"use client";

import {
  ApiClientError,
  type ApiClient,
  type ApiComponents,
} from "@point-quest/api-client";
import { Button, Card } from "@point-quest/ui";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  RefreshCw,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { publishPointBalance } from "@/lib/point-balance-event";

import { AnswerFeedback } from "./answer-feedback";
import { QuestionCard } from "./question-card";

type Schemas = ApiComponents["schemas"];
type LearnerQuestion = Schemas["LearnerQuestionDto"];
type AnswerResult = Schemas["AnswerResultDto"];

type PracticeApi = Pick<
  ApiClient,
  "answerQuestion" | "getRandomQuestion" | "retryWrongQuestion"
>;

export type PracticeQueueItem = {
  question: LearnerQuestion;
  result?: AnswerResult;
  selectedOptionId?: string;
  submitError?: string;
  submission?: {
    idempotencyKey: string;
    selectedOptionId: string;
  };
};

type TailLoadError = {
  excludeIds: string[];
  message: string;
  requestedTailIndex: number;
};

type PracticeSessionProps = {
  api?: PracticeApi;
  initialQuestion?: LearnerQuestion;
  mode?: "FIRST" | "WRONG_RETRY";
  onMastered?: (questionId: string) => void;
  onResult?: (questionId: string, result: AnswerResult) => void;
};

function createIdempotencyKey() {
  if (typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}

function isEmptyQuestionPool(error: unknown) {
  return (
    error instanceof ApiClientError &&
    error.body.code === "NO_UNANSWERED_QUESTIONS"
  );
}

export function PracticeSession({
  api = browserApiClient,
  initialQuestion,
  mode = "FIRST",
  onMastered,
  onResult,
}: PracticeSessionProps) {
  const [queue, setQueue] = useState<PracticeQueueItem[]>(() =>
    initialQuestion ? [{ question: initialQuestion }] : [],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(!initialQuestion);
  const [loadingNext, setLoadingNext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(
    null,
  );
  const [tailLoadError, setTailLoadError] =
    useState<TailLoadError | null>(null);
  const initialLoadStarted = useRef(false);
  const mounted = useRef(true);
  const latestLoadRequest = useRef(0);

  const currentItem = queue[currentIndex];

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadQuestion = useCallback(
    async (
      excludeIds: string[],
      initial: boolean,
      requestedTailIndex?: number,
    ) => {
      const requestId = latestLoadRequest.current + 1;
      latestLoadRequest.current = requestId;
      if (initial) {
        setLoading(true);
        setInitialLoadError(null);
      } else {
        setLoadingNext(true);
        setTailLoadError(null);
      }

      try {
        const question = await api.getRandomQuestion(excludeIds);
        if (!mounted.current || latestLoadRequest.current !== requestId) return;
        setQueue((items) => [...items, { question }]);
        setCompleted(false);
        if (!initial && requestedTailIndex !== undefined) {
          setCurrentIndex((index) =>
            index === requestedTailIndex
              ? requestedTailIndex + 1
              : index,
          );
        }
      } catch (error) {
        if (!mounted.current || latestLoadRequest.current !== requestId) return;
        if (isEmptyQuestionPool(error)) {
          setCompleted(true);
        } else if (initial) {
          setInitialLoadError(getApiErrorMessage(error));
        } else if (requestedTailIndex !== undefined) {
          setTailLoadError({
            excludeIds: [...excludeIds],
            message: getApiErrorMessage(error),
            requestedTailIndex,
          });
        } else {
          setInitialLoadError(getApiErrorMessage(error));
        }
      } finally {
        if (mounted.current && latestLoadRequest.current === requestId) {
          setLoading(false);
          setLoadingNext(false);
        }
      }
    },
    [api],
  );

  useEffect(() => {
    if (
      mode === "FIRST" &&
      !initialQuestion &&
      !initialLoadStarted.current
    ) {
      initialLoadStarted.current = true;
      void loadQuestion([], true);
    }
  }, [initialQuestion, loadQuestion, mode]);

  function selectOption(optionId: string) {
    if (
      !currentItem ||
      currentItem.result ||
      currentItem.submission ||
      submitting
    ) {
      return;
    }
    setQueue((items) =>
      items.map((item, index) =>
        index === currentIndex
          ? { ...item, selectedOptionId: optionId, submitError: undefined }
          : item,
      ),
    );
  }

  async function submitCurrent() {
    if (
      !currentItem?.selectedOptionId ||
      currentItem.result ||
      submitting
    ) {
      return;
    }

    const submission = currentItem.submission ?? {
      idempotencyKey: createIdempotencyKey(),
      selectedOptionId: currentItem.selectedOptionId,
    };
    const submittedIndex = currentIndex;
    setQueue((items) =>
      items.map((item, index) =>
        index === submittedIndex
          ? {
              ...item,
              selectedOptionId: submission.selectedOptionId,
              submission,
              submitError: undefined,
            }
          : item,
      ),
    );
    setSubmitting(true);

    try {
      const input = {
        idempotencyKey: submission.idempotencyKey,
        selectedOptionId: submission.selectedOptionId,
      };
      const result =
        mode === "WRONG_RETRY"
          ? await api.retryWrongQuestion(currentItem.question.id, input)
          : await api.answerQuestion(currentItem.question.id, input);
      setQueue((items) =>
        items.map((item, index) =>
          index === submittedIndex &&
          item.question.id === currentItem.question.id
            ? { ...item, result, submitError: undefined }
            : item,
        ),
      );
      publishPointBalance(result.balance);
      onResult?.(currentItem.question.id, result);
      if (mode === "WRONG_RETRY" && result.correct) {
        onMastered?.(currentItem.question.id);
      }
    } catch (error) {
      const message = getApiErrorMessage(error);
      setQueue((items) =>
        items.map((item, index) =>
          index === submittedIndex &&
          item.question.id === currentItem.question.id
            ? { ...item, submitError: message }
            : item,
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function goNext() {
    if (loadingNext) return;
    if (currentIndex < queue.length - 1) {
      setCurrentIndex((index) => index + 1);
      return;
    }
    if (completed) return;

    const excludeIds = queue
      .filter((item) => !item.result)
      .map((item) => item.question.id);
    await loadQuestion(excludeIds, false, currentIndex);
  }

  function goPrevious() {
    setCurrentIndex((index) => index - 1);
  }

  function retryTailQuestion() {
    if (!tailLoadError) return;
    void loadQuestion(
      tailLoadError.excludeIds,
      false,
      tailLoadError.requestedTailIndex,
    );
  }

  if (loading) {
    return (
      <Card aria-live="polite" className="practice-loading" role="status">
        <LoaderCircle aria-hidden="true" className="spin" />
        <div>
          <strong>正在为你抽取一道未答题目</strong>
          <p>稍等一下，新的挑战马上出现。</p>
        </div>
      </Card>
    );
  }

  if (!currentItem && completed) {
    return (
      <EmptyState
        action={
          <Link className="pq-button pq-button--primary" href="/learn/wrong-questions">
            去错题库继续巩固
          </Link>
        }
        description="所有启用题目都已完成首次作答，可以去复习错题或稍后再来。"
        icon={<Trophy />}
        title="本轮首次答题已完成"
      />
    );
  }

  if (!currentItem && initialLoadError) {
    return (
      <Card className="practice-load-error" role="alert">
        <p>{initialLoadError}</p>
        <Button onClick={() => void loadQuestion([], true)} variant="secondary">
          <RefreshCw aria-hidden="true" />
          重新加载
        </Button>
      </Card>
    );
  }

  if (!currentItem) return null;
  const visibleTailLoadError =
    tailLoadError?.requestedTailIndex === currentIndex
      ? tailLoadError
      : null;

  return (
    <section className="practice-session">
      {mode === "FIRST" ? (
        <div className="practice-progress">
          <span>
            本次队列第 {currentIndex + 1} 题
          </span>
          <span>{currentItem.result ? "已提交，只读查看" : "等待作答"}</span>
        </div>
      ) : null}

      <QuestionCard
        disabled={
          Boolean(currentItem.result || currentItem.submission) ||
          submitting
        }
        onSelect={selectOption}
        question={currentItem.question}
        selectedOptionId={currentItem.selectedOptionId}
      />

      {currentItem.submitError ? (
        <div className="inline-error" role="alert">
          <p>{currentItem.submitError}</p>
          <Button
            disabled={submitting}
            onClick={() => void submitCurrent()}
            variant="secondary"
          >
            <RefreshCw aria-hidden="true" />
            重试提交
          </Button>
        </div>
      ) : null}

      {currentItem.result ? (
        <AnswerFeedback
          mode={mode}
          question={currentItem.question}
          result={currentItem.result}
        />
      ) : currentItem.submitError ? null : (
        <Button
          className="practice-submit"
          disabled={!currentItem.selectedOptionId || submitting}
          onClick={() => void submitCurrent()}
        >
          {submitting ? (
            <LoaderCircle aria-hidden="true" className="spin" />
          ) : (
            <Check aria-hidden="true" />
          )}
          {submitting
            ? "正在提交"
            : currentItem.submission
              ? "重试提交"
            : mode === "WRONG_RETRY"
              ? "提交重练答案"
              : "提交答案"}
        </Button>
      )}

      {mode === "FIRST" ? (
        <nav aria-label="题目切换" className="practice-navigation">
          <Button
            disabled={currentIndex === 0}
            onClick={goPrevious}
            variant="secondary"
          >
            <ArrowLeft aria-hidden="true" />
            上一题
          </Button>
          <Button
            disabled={
              loadingNext ||
              (completed && currentIndex === queue.length - 1)
            }
            onClick={() => void goNext()}
            variant="secondary"
          >
            {loadingNext ? (
              <LoaderCircle aria-hidden="true" className="spin" />
            ) : (
              <ArrowRight aria-hidden="true" />
            )}
            {loadingNext ? "正在取题" : "下一题"}
          </Button>
        </nav>
      ) : null}

      {completed && currentItem ? (
        <p className="queue-complete" role="status">
          <Trophy aria-hidden="true" />
          已经到达本轮未答题队尾
        </p>
      ) : null}

      {visibleTailLoadError ? (
        <div className="inline-error" role="alert">
          <p>{visibleTailLoadError.message}</p>
          <Button onClick={retryTailQuestion} variant="secondary">
            <RefreshCw aria-hidden="true" />
            重试取题
          </Button>
        </div>
      ) : null}
    </section>
  );
}
