import { Module } from '@nestjs/common';
import { AdminAiModelsController } from './admin-ai-models.controller';
import { AiModelsService } from './ai-models.service';

@Module({
  controllers: [AdminAiModelsController],
  providers: [AiModelsService],
  exports: [AiModelsService],
})
export class AiModelsModule {}
