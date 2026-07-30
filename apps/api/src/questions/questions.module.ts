import { Module } from '@nestjs/common';
import { AdminQuestionsController } from './admin-questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  controllers: [AdminQuestionsController],
  providers: [QuestionsService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
