import type { ApiComponents } from "@point-quest/api-client";
import { Card } from "@point-quest/ui";
import {
  BadgeCheck,
  CircleX,
  Coins,
  Lightbulb,
  RotateCcw,
} from "lucide-react";

type Schemas = ApiComponents["schemas"];

type AnswerFeedbackProps = {
  mode: "FIRST" | "WRONG_RETRY";
  question: Schemas["LearnerQuestionDto"];
  result: Schemas["AnswerResultDto"];
};

export function AnswerFeedback({
  mode,
  question,
  result,
}: AnswerFeedbackProps) {
  const correctOption = question.options.find(
    (option) => option.id === result.correctOptionId,
  );

  return (
    <Card
      aria-live="polite"
      className={`answer-feedback answer-feedback--${
        result.correct ? "correct" : "wrong"
      }`}
      role="status"
    >
      <div className="answer-feedback__heading">
        {result.correct ? (
          <BadgeCheck aria-hidden="true" />
        ) : (
          <CircleX aria-hidden="true" />
        )}
        <div>
          <h2>
            {result.correct
              ? mode === "WRONG_RETRY"
                ? "这道错题已掌握"
                : "回答正确"
              : "回答错误"}
          </h2>
          {result.correct && mode === "FIRST" ? (
            <p className="reward-text">
              <Coins aria-hidden="true" />+{result.pointsAwarded} 积分
            </p>
          ) : null}
        </div>
      </div>

      {!result.correct && correctOption ? (
        <p className="answer-feedback__answer">
          正确答案：{correctOption.label}. {correctOption.content}
        </p>
      ) : null}

      <div className="answer-feedback__explanation">
        <Lightbulb aria-hidden="true" />
        <div>
          <strong>答案解析</strong>
          <p>{result.explanation}</p>
        </div>
      </div>

      {!result.correct ? (
        <p className="answer-feedback__count">
          <RotateCcw aria-hidden="true" />
          累计答错 {result.errorCount} 次
        </p>
      ) : null}

      {mode === "WRONG_RETRY" ? (
        <p className="answer-feedback__note">错题重练不奖励积分</p>
      ) : (
        <p className="answer-feedback__balance">
          当前积分余额 {result.balance}
        </p>
      )}
    </Card>
  );
}
