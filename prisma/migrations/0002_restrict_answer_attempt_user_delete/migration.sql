-- DropForeignKey
ALTER TABLE "AnswerAttempt" DROP CONSTRAINT "AnswerAttempt_userId_fkey";

-- AddForeignKey
ALTER TABLE "AnswerAttempt" ADD CONSTRAINT "AnswerAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
