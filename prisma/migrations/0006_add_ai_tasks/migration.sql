-- CreateEnum
CREATE TYPE "AiTaskRunTrigger" AS ENUM ('CRON', 'MANUAL');

-- CreateEnum
CREATE TYPE "AiTaskRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "AiTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aiModelConfigId" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "optionCount" INTEGER NOT NULL,
    "basePoints" INTEGER NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastWord" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTaskRun" (
    "id" TEXT NOT NULL,
    "aiTaskId" TEXT NOT NULL,
    "trigger" "AiTaskRunTrigger" NOT NULL,
    "status" "AiTaskRunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "questionsCreated" INTEGER NOT NULL DEFAULT 0,
    "lastWordBefore" TEXT,
    "lastWordAfter" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "AiTaskRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiTask_name_key" ON "AiTask"("name");

-- CreateIndex
CREATE INDEX "AiTask_updatedAt_id_idx" ON "AiTask"("updatedAt", "id");

-- CreateIndex
CREATE INDEX "AiTask_isEnabled_idx" ON "AiTask"("isEnabled");

-- CreateIndex
CREATE INDEX "AiTask_aiModelConfigId_idx" ON "AiTask"("aiModelConfigId");

-- CreateIndex
CREATE INDEX "AiTaskRun_aiTaskId_startedAt_idx" ON "AiTaskRun"("aiTaskId", "startedAt");

-- CreateIndex
CREATE INDEX "AiTaskRun_status_idx" ON "AiTaskRun"("status");

-- 同一任务同时最多一条 RUNNING
CREATE UNIQUE INDEX "AiTaskRun_one_running_per_task"
  ON "AiTaskRun"("aiTaskId")
  WHERE "status" = 'RUNNING';

-- AddForeignKey
ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_aiModelConfigId_fkey" FOREIGN KEY ("aiModelConfigId") REFERENCES "AiModelConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTaskRun" ADD CONSTRAINT "AiTaskRun_aiTaskId_fkey" FOREIGN KEY ("aiTaskId") REFERENCES "AiTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
