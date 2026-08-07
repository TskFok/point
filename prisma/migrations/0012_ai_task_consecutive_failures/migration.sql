-- AiTask: 连续 cron 失败阈值与当前计数
ALTER TABLE "AiTask"
ADD COLUMN "maxConsecutiveFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "consecutiveFailureCount" INTEGER NOT NULL DEFAULT 0;
