import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAiTasksController } from './admin-ai-tasks.controller';
import { AiTasksScheduler } from './ai-tasks.scheduler';
import { AiTasksService } from './ai-tasks.service';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [AdminAiTasksController],
  providers: [AiTasksService, AiTasksScheduler],
  exports: [AiTasksService],
})
export class AiTasksModule {}
