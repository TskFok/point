-- AiTask / Question: langCode (en|ja|it|fr|de), default en
ALTER TABLE "AiTask"
ADD COLUMN "langCode" TEXT NOT NULL DEFAULT 'en';

ALTER TABLE "Question"
ADD COLUMN "langCode" TEXT NOT NULL DEFAULT 'en';

CREATE INDEX "Question_langCode_isActive_idx" ON "Question" ("langCode", "isActive");
