-- 确保「同一任务同时最多一条 RUNNING」为部分唯一索引。
-- 若曾误建成全量唯一（任意 status 都互斥），FAILED/SUCCESS 后定时任务会被永久拦截。
DROP INDEX IF EXISTS "AiTaskRun_one_running_per_task";

CREATE UNIQUE INDEX "AiTaskRun_one_running_per_task"
  ON "AiTaskRun"("aiTaskId")
  WHERE "status" = 'RUNNING';
