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
  BookOpenCheck,
  Check,
  Coins,
  Lightbulb,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { AnswerFeedback } from "@/components/practice/answer-feedback";
import { QuestionCard } from "@/components/practice/question-card";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { createIdempotencyKey } from "@/lib/idempotency-key";
import { publishPointBalance } from "@/lib/point-balance-event";

type Schemas = ApiComponents["schemas"];
type PreviewQuestion = Schemas["PreviewQuestionDto"];
type AnswerResult = Schemas["AnswerResultDto"];

type PreviewApi = Pick<ApiClient, "answerQuestion" | "getPreviewQuestions">;

type Phase = "setup" | "preview" | "quiz" | "summary";

type QuizItem = {
  question: PreviewQuestion;
  selectedOptionId?: string;
  result?: AnswerResult;
  submitError?: string;
  alreadyAnswered?: boolean;
  submission?: {
    idempotencyKey: string;
    selectedOptionId: string;
  };
};

const COUNT_PRESETS = [5, 10, 20] as const;
const MIN_COUNT = 1;
const MAX_COUNT = 50;

function isEmptyQuestionPool(error: unknown) {
  return (
    error instanceof ApiClientError &&
    error.body.code === "NO_UNANSWERED_QUESTIONS"
  );
}

function isQuestionAlreadyAnswered(error: unknown) {
  return (
    error instanceof ApiClientError &&
    error.body.code === "QUESTION_ALREADY_ANSWERED"
  );
}

export function PreviewSession({
  api = browserApiClient,
}: {
  api?: PreviewApi;
} = {}) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emptyPool, setEmptyPool] = useState(false);
  const [items, setItems] = useState<QuizItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const currentItem = items[currentIndex];
  const isValidCount =
    Number.isInteger(count) && count >= MIN_COUNT && count <= MAX_COUNT;

  async function startPreview() {
    if (!isValidCount || loading) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await api.getPreviewQuestions(count);
      setItems(response.data.map((question) => ({ question })));
      setCurrentIndex(0);
      setPhase("preview");
    } catch (error) {
      if (isEmptyQuestionPool(error)) {
        setEmptyPool(true);
      } else {
        setLoadError(getApiErrorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  }

  function resetSession() {
    setPhase("setup");
    setItems([]);
    setCurrentIndex(0);
    setLoadError(null);
    setEmptyPool(false);
  }

  function startQuiz() {
    setCurrentIndex(0);
    setPhase("quiz");
  }

  function selectOption(optionId: string) {
    if (
      !currentItem ||
      currentItem.result ||
      currentItem.submission ||
      currentItem.alreadyAnswered ||
      submitting
    ) {
      return;
    }
    setItems((previous) =>
      previous.map((item, index) =>
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
      currentItem.alreadyAnswered ||
      submitting
    ) {
      return;
    }

    const submission = currentItem.submission ?? {
      idempotencyKey: createIdempotencyKey(),
      selectedOptionId: currentItem.selectedOptionId,
    };
    const submittedIndex = currentIndex;
    setItems((previous) =>
      previous.map((item, index) =>
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
      const result = await api.answerQuestion(currentItem.question.id, {
        idempotencyKey: submission.idempotencyKey,
        selectedOptionId: submission.selectedOptionId,
      });
      setItems((previous) =>
        previous.map((item, index) =>
          index === submittedIndex &&
          item.question.id === currentItem.question.id
            ? { ...item, result, submitError: undefined }
            : item,
        ),
      );
      publishPointBalance(result.balance);
    } catch (error) {
      const alreadyAnswered = isQuestionAlreadyAnswered(error);
      const message = getApiErrorMessage(error);
      setItems((previous) =>
        previous.map((item, index) =>
          index === submittedIndex &&
          item.question.id === currentItem.question.id
            ? alreadyAnswered
              ? { ...item, alreadyAnswered: true, submitError: undefined }
              : { ...item, submitError: message }
            : item,
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "setup") {
    if (emptyPool) {
      return (
        <EmptyState
          action={
            <Link
              className="pq-button pq-button--primary"
              href="/learn/wrong-questions"
            >
              去错题库继续巩固
            </Link>
          }
          description="所有启用题目都已完成首次作答，可以去复习错题或稍后再来。"
          icon={<Trophy />}
          title="没有可预习的新题"
        />
      );
    }
    return (
      <Card className="preview-setup">
        <div className="preview-setup__heading">
          <Sparkles aria-hidden="true" />
          <div>
            <h2>选择预习题目数量</h2>
            <p>
              随机抽取未作答的新题，先看题解学习，再回到题目中作答赚积分。
            </p>
          </div>
        </div>
        <fieldset className="preview-setup__options">
          <legend>题目数量（{MIN_COUNT}–{MAX_COUNT} 道）</legend>
          <div className="preview-setup__presets" role="group">
            {COUNT_PRESETS.map((preset) => (
              <Button
                aria-pressed={count === preset}
                key={preset}
                onClick={() => setCount(preset)}
                variant={count === preset ? "primary" : "secondary"}
              >
                {preset} 道
              </Button>
            ))}
          </div>
          <label className="preview-setup__custom">
            自定义数量
            <input
              max={MAX_COUNT}
              min={MIN_COUNT}
              onChange={(event) => {
                const next = Number(event.target.value);
                setCount(event.target.value === "" ? Number.NaN : next);
              }}
              type="number"
              value={Number.isNaN(count) ? "" : count}
            />
          </label>
        </fieldset>
        {loadError ? (
          <div className="inline-error" role="alert">
            <p>{loadError}</p>
          </div>
        ) : null}
        <Button
          className="practice-submit"
          disabled={!isValidCount || loading}
          onClick={() => void startPreview()}
        >
          {loading ? (
            <LoaderCircle aria-hidden="true" className="spin" />
          ) : (
            <BookOpenCheck aria-hidden="true" />
          )}
          {loading ? "正在抽取预习题目" : "开始预习"}
        </Button>
      </Card>
    );
  }

  if (phase === "preview" && currentItem) {
    const correctOption = currentItem.question.options.find(
      (option) => option.id === currentItem.question.correctOptionId,
    );
    return (
      <section className="practice-session">
        <div className="practice-progress">
          <span>
            预习第 {currentIndex + 1} / {items.length} 题
          </span>
          <span>题解已展示，放心学习</span>
        </div>

        <QuestionCard
          disabled
          onSelect={() => undefined}
          question={currentItem.question}
          selectedOptionId={currentItem.question.correctOptionId}
        />

        <Card aria-live="polite" className="preview-explanation" role="status">
          {correctOption ? (
            <p className="preview-explanation__answer">
              <Check aria-hidden="true" />
              正确答案：{correctOption.label}. {correctOption.content}
            </p>
          ) : null}
          <div className="answer-feedback__explanation">
            <Lightbulb aria-hidden="true" />
            <div>
              <strong>答案解析</strong>
              <p>{currentItem.question.explanation}</p>
            </div>
          </div>
        </Card>

        <nav aria-label="预习题目切换" className="practice-navigation">
          <Button
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((index) => index - 1)}
            variant="secondary"
          >
            <ArrowLeft aria-hidden="true" />
            上一题
          </Button>
          <Button
            disabled={currentIndex >= items.length - 1}
            onClick={() => setCurrentIndex((index) => index + 1)}
            variant="secondary"
          >
            <ArrowRight aria-hidden="true" />
            下一题
          </Button>
        </nav>

        <Button className="practice-submit" onClick={startQuiz}>
          <BookOpenCheck aria-hidden="true" />
          完成预习，开始答题
        </Button>
      </section>
    );
  }

  if (phase === "quiz" && currentItem) {
    const answeredCount = items.filter(
      (item) => item.result || item.alreadyAnswered,
    ).length;
    const currentDone = Boolean(
      currentItem.result || currentItem.alreadyAnswered,
    );
    const isLast = currentIndex === items.length - 1;
    return (
      <section className="practice-session">
        <div className="practice-progress">
          <span>
            答题第 {currentIndex + 1} / {items.length} 题
          </span>
          <span>
            {currentDone
              ? "已提交，只读查看"
              : `已完成 ${answeredCount} / ${items.length}`}
          </span>
        </div>

        <QuestionCard
          disabled={
            Boolean(currentItem.result || currentItem.submission) ||
            currentItem.alreadyAnswered === true ||
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

        {currentItem.alreadyAnswered ? (
          <p className="queue-complete" role="status">
            <BookOpenCheck aria-hidden="true" />
            该题已在其他地方完成首次作答，本轮跳过
          </p>
        ) : null}

        {currentItem.result ? (
          <AnswerFeedback
            mode="FIRST"
            question={currentItem.question}
            result={currentItem.result}
          />
        ) : currentItem.submitError || currentItem.alreadyAnswered ? null : (
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
                : "提交答案"}
          </Button>
        )}

        <nav aria-label="答题题目切换" className="practice-navigation">
          <Button
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((index) => index - 1)}
            variant="secondary"
          >
            <ArrowLeft aria-hidden="true" />
            上一题
          </Button>
          {isLast ? (
            <Button
              disabled={answeredCount < items.length}
              onClick={() => setPhase("summary")}
            >
              <Trophy aria-hidden="true" />
              查看本次成绩
            </Button>
          ) : (
            <Button
              disabled={!currentDone}
              onClick={() => setCurrentIndex((index) => index + 1)}
              variant="secondary"
            >
              <ArrowRight aria-hidden="true" />
              下一题
            </Button>
          )}
        </nav>
      </section>
    );
  }

  if (phase === "summary") {
    const correctCount = items.filter((item) => item.result?.correct).length;
    const skippedCount = items.filter((item) => item.alreadyAnswered).length;
    const pointsEarned = items.reduce(
      (total, item) => total + (item.result?.pointsAwarded ?? 0),
      0,
    );
    return (
      <section className="practice-session">
        <Card className="preview-summary" tone="primary">
          <Trophy aria-hidden="true" />
          <h2>本次预习答题完成</h2>
          <p>
            共 {items.length} 题，答对 {correctCount} 题
            {skippedCount > 0 ? `，跳过 ${skippedCount} 题` : ""}
          </p>
          <p className="preview-summary__points">
            <Coins aria-hidden="true" />
            本次获得 {pointsEarned} 积分
          </p>
        </Card>
        <nav aria-label="预习完成操作" className="practice-navigation">
          <Button onClick={resetSession} variant="secondary">
            <RefreshCw aria-hidden="true" />
            再来一轮预习
          </Button>
          <Link className="pq-button pq-button--primary" href="/learn">
            返回学习首页
          </Link>
        </nav>
      </section>
    );
  }

  return null;
}
