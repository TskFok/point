import type { ApiComponents } from "@point-quest/api-client";
import { Card } from "@point-quest/ui";

type LearnerQuestion =
  ApiComponents["schemas"]["LearnerQuestionDto"];

type QuestionCardProps = {
  disabled?: boolean;
  onSelect: (optionId: string) => void;
  question: LearnerQuestion;
  selectedOptionId?: string;
};

export function QuestionCard({
  disabled = false,
  onSelect,
  question,
  selectedOptionId,
}: QuestionCardProps) {
  return (
    <Card className="question-card">
      <div className="question-card__meta">
        <span>英语单选题</span>
        <span>基础 {question.basePoints} 积分</span>
      </div>
      <fieldset className="question-options">
        <legend>{question.stem}</legend>
        {question.options.map((option) => (
          <label
            className={
              selectedOptionId === option.id
                ? "question-option question-option--selected"
                : "question-option"
            }
            key={option.id}
          >
            <input
              checked={selectedOptionId === option.id}
              disabled={disabled}
              name={`question-${question.id}`}
              onChange={() => onSelect(option.id)}
              type="radio"
              value={option.id}
            />
            <span className="question-option__label">{option.label}</span>
            <span>{option.content}</span>
          </label>
        ))}
      </fieldset>
    </Card>
  );
}
