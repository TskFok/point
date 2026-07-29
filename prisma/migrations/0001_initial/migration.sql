-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STUDENT');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('WEB', 'ANDROID');

-- CreateEnum
CREATE TYPE "AnswerMode" AS ENUM ('FIRST_ATTEMPT', 'WRONG_RETRY');

-- CreateEnum
CREATE TYPE "PointLedgerType" AS ENUM ('ANSWER_REWARD', 'ORDER_REDEEM', 'ORDER_REFUND');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PICKUP', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "clientType" "ClientType" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "stem" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "basePoints" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "firstCorrect" BOOLEAN NOT NULL,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "masteredAt" TIMESTAMP(3),
    "firstAnsweredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT NOT NULL,
    "mode" "AnswerMode" NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "basePointsSnapshot" INTEGER NOT NULL,
    "multiplierSnapshot" INTEGER NOT NULL,
    "pointsAwarded" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointConfig" (
    "id" TEXT NOT NULL,
    "multiplier" INTEGER NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PointLedgerType" NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "answerAttemptId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "stock" INTEGER NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "productImageKeySnapshot" TEXT NOT NULL,
    "pointsCostSnapshot" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PICKUP',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "updatedBy" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- AddCheckConstraint
ALTER TABLE "User" ADD CONSTRAINT "User_pointsBalance_nonnegative" CHECK ("pointsBalance" >= 0);

-- AddCheckConstraint
ALTER TABLE "QuestionProgress" ADD CONSTRAINT "QuestionProgress_errorCount_nonnegative" CHECK ("errorCount" >= 0);

-- AddCheckConstraint
ALTER TABLE "Product" ADD CONSTRAINT "Product_stock_nonnegative" CHECK ("stock" >= 0);

-- AddCheckConstraint
ALTER TABLE "Product" ADD CONSTRAINT "Product_pointsCost_nonnegative" CHECK ("pointsCost" >= 0);

-- AddCheckConstraint
ALTER TABLE "Question" ADD CONSTRAINT "Question_basePoints_positive" CHECK ("basePoints" > 0);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "Question_isActive_idx" ON "Question"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_questionId_position_key" ON "QuestionOption"("questionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionProgress_userId_questionId_key" ON "QuestionProgress"("userId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerAttempt_userId_idempotencyKey_key" ON "AnswerAttempt"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AnswerAttempt_questionId_idx" ON "AnswerAttempt"("questionId");

-- CreateIndex
CREATE INDEX "PointConfig_createdAt_id_idx" ON "PointConfig"("createdAt", "id");

-- CreateIndex
CREATE INDEX "PointLedger_userId_createdAt_idx" ON "PointLedger"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PointLedger_answerAttemptId_key" ON "PointLedger"("answerAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "PointLedger_orderId_type_key" ON "PointLedger"("orderId", "type");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "Order_userId_idempotencyKey_key" ON "Order"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_replacedByTokenId_fkey" FOREIGN KEY ("replacedByTokenId") REFERENCES "RefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionProgress" ADD CONSTRAINT "QuestionProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionProgress" ADD CONSTRAINT "QuestionProgress_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerAttempt" ADD CONSTRAINT "AnswerAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerAttempt" ADD CONSTRAINT "AnswerAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerAttempt" ADD CONSTRAINT "AnswerAttempt_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "QuestionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointConfig" ADD CONSTRAINT "PointConfig_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_answerAttemptId_fkey" FOREIGN KEY ("answerAttemptId") REFERENCES "AnswerAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
