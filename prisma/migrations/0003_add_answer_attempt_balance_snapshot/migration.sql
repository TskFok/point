-- AddColumn
ALTER TABLE "AnswerAttempt"
ADD COLUMN "balanceAfterSnapshot" INTEGER DEFAULT 0;

-- BackfillSnapshot
UPDATE "AnswerAttempt" AS attempt
SET "balanceAfterSnapshot" = COALESCE(
  (
    SELECT ledger."balanceAfter"
    FROM "PointLedger" AS ledger
    WHERE ledger."answerAttemptId" = attempt.id
    ORDER BY ledger."createdAt" DESC, ledger.id DESC
    LIMIT 1
  ),
  (
    SELECT ledger."balanceAfter"
    FROM "PointLedger" AS ledger
    WHERE ledger."userId" = attempt."userId"
      AND ledger."createdAt" <= attempt."createdAt"
    ORDER BY ledger."createdAt" DESC, ledger.id DESC
    LIMIT 1
  ),
  0
);

-- EnforceSnapshotInvariant
ALTER TABLE "AnswerAttempt"
ALTER COLUMN "balanceAfterSnapshot" SET NOT NULL;

ALTER TABLE "AnswerAttempt"
ADD CONSTRAINT "AnswerAttempt_balanceAfterSnapshot_nonnegative"
CHECK ("balanceAfterSnapshot" >= 0);

-- New writes must always provide an explicit snapshot.
ALTER TABLE "AnswerAttempt"
ALTER COLUMN "balanceAfterSnapshot" DROP DEFAULT;
