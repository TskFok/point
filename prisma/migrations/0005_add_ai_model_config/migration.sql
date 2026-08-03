-- CreateTable
CREATE TABLE "AiModelConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKeyCiphertext" TEXT NOT NULL,
    "apiKeyLast4" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiModelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiModelConfig_name_key" ON "AiModelConfig"("name");

-- CreateIndex
CREATE INDEX "AiModelConfig_updatedAt_id_idx" ON "AiModelConfig"("updatedAt", "id");

-- CreateIndex
CREATE INDEX "AiModelConfig_isEnabled_idx" ON "AiModelConfig"("isEnabled");

-- AddForeignKey
ALTER TABLE "AiModelConfig" ADD CONSTRAINT "AiModelConfig_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
