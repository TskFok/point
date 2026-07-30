-- AddColumn
ALTER TABLE "AnswerAttempt"
ADD COLUMN "errorCountSnapshot" INTEGER;

-- BackfillSnapshot
WITH ordered_attempts AS (
  SELECT
    attempt.id,
    CASE
      WHEN attempt.mode = 'FIRST_ATTEMPT' THEN
        CASE WHEN attempt."isCorrect" THEN 0 ELSE 1 END
      ELSE (
        1 + COUNT(*) FILTER (
          WHERE attempt.mode = 'WRONG_RETRY'
            AND attempt."isCorrect" = false
        ) OVER (
          PARTITION BY attempt."userId", attempt."questionId"
          ORDER BY attempt."createdAt", attempt.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )
      )::integer
    END AS "errorCountSnapshot"
  FROM "AnswerAttempt" AS attempt
)
UPDATE "AnswerAttempt" AS attempt
SET "errorCountSnapshot" = ordered_attempts."errorCountSnapshot"
FROM ordered_attempts
WHERE ordered_attempts.id = attempt.id;

-- EnforceSnapshotInvariant
ALTER TABLE "AnswerAttempt"
ALTER COLUMN "errorCountSnapshot" SET NOT NULL;

ALTER TABLE "AnswerAttempt"
ADD CONSTRAINT "AnswerAttempt_errorCountSnapshot_nonnegative"
CHECK ("errorCountSnapshot" >= 0);
