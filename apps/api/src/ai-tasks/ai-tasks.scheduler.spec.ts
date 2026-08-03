import { AiTasksScheduler } from './ai-tasks.scheduler';

describe('AiTasksScheduler', () => {
  it('仅对启用且 cron 命中的任务调用 runTask', async () => {
    const runTask = jest.fn().mockResolvedValue({});
    const listEnabledForSchedule = jest.fn().mockResolvedValue([
      {
        id: 't1',
        isEnabled: true,
        cronExpression: '0 8 * * *',
        updatedBy: 'admin-1',
      },
      {
        id: 't2',
        isEnabled: true,
        cronExpression: '0 9 * * *',
        updatedBy: 'admin-1',
      },
    ]);
    const scheduler = new AiTasksScheduler({
      listEnabledForSchedule,
      runTask,
    } as never);
    await scheduler.tick(new Date('2026-08-03T08:00:00+08:00'));
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(runTask).toHaveBeenCalledWith('t1', {
      trigger: 'CRON',
      actorUserId: 'admin-1',
    });
  });

  it('runTask 抛错时不中断其他任务', async () => {
    const runTask = jest
      .fn()
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValueOnce({});
    const listEnabledForSchedule = jest.fn().mockResolvedValue([
      {
        id: 't1',
        isEnabled: true,
        cronExpression: '0 8 * * *',
        updatedBy: 'admin-1',
      },
      {
        id: 't2',
        isEnabled: true,
        cronExpression: '0 8 * * *',
        updatedBy: 'admin-2',
      },
    ]);
    const scheduler = new AiTasksScheduler({
      listEnabledForSchedule,
      runTask,
    } as never);
    await scheduler.tick(new Date('2026-08-03T08:00:00+08:00'));
    expect(runTask).toHaveBeenCalledTimes(2);
  });
});
