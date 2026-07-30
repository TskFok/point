type LearnerQuestionInput = {
  id: string;
  stem: string;
  basePoints: number;
  options: Array<{
    id: string;
    label: string;
    content: string;
    position: number;
  }>;
};

export type AnswerResultDto = {
  correct: boolean;
  selectedOptionId: string;
  correctOptionId: string;
  explanation: string;
  errorCount: number;
  pointsAwarded: number;
  balance: number;
};

export function mapLearnerQuestion(question: LearnerQuestionInput) {
  return {
    id: question.id,
    stem: question.stem,
    basePoints: question.basePoints,
    options: question.options.map((option) => ({
      id: option.id,
      label: option.label,
      content: option.content,
      position: option.position,
    })),
  };
}

export function mapAnswerResult(input: {
  isCorrect: boolean;
  selectedOptionId: string;
  correctOptionId: string;
  explanation: string;
  errorCount: number;
  pointsAwarded: number;
  balanceAfterSnapshot: number;
}): AnswerResultDto {
  return {
    correct: input.isCorrect,
    selectedOptionId: input.selectedOptionId,
    correctOptionId: input.correctOptionId,
    explanation: input.explanation,
    errorCount: input.errorCount,
    pointsAwarded: input.pointsAwarded,
    balance: input.balanceAfterSnapshot,
  };
}
