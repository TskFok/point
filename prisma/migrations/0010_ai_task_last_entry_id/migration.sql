-- AiTask: lastWord -> lastEntryId（存量清空，从最小 id 重新开始）
ALTER TABLE "AiTask" ADD COLUMN "lastEntryId" BIGINT;
ALTER TABLE "AiTask" DROP COLUMN "lastWord";

-- AiTaskRun: lastWordBefore/After -> lastEntryIdBefore/After
ALTER TABLE "AiTaskRun" ADD COLUMN "lastEntryIdBefore" BIGINT;
ALTER TABLE "AiTaskRun" ADD COLUMN "lastEntryIdAfter" BIGINT;
ALTER TABLE "AiTaskRun" DROP COLUMN "lastWordBefore";
ALTER TABLE "AiTaskRun" DROP COLUMN "lastWordAfter";

-- 按 lang_code + id 游标取词索引
CREATE INDEX IF NOT EXISTS entry_lang_id_idx ON entry (lang_code, id);
