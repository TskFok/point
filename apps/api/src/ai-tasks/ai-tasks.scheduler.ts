import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiTasksService } from './ai-tasks.service';
import { cronMatchesDate } from './cron-expression';

@Injectable()
export class AiTasksScheduler {
  private readonly logger = new Logger(AiTasksScheduler.name);

  constructor(private readonly aiTasksService: AiTasksService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(): Promise<void> {
    await this.tick(new Date());
  }

  async tick(now: Date): Promise<void> {
    const tasks = await this.aiTasksService.listEnabledForSchedule();
    for (const task of tasks) {
      if (!cronMatchesDate(task.cronExpression, now)) {
        continue;
      }
      try {
        await this.aiTasksService.runTask(task.id, {
          trigger: 'CRON',
          actorUserId: task.updatedBy,
        });
      } catch (error) {
        this.logger.warn(
          `AI task ${task.id} schedule run skipped/failed: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }
  }
}
