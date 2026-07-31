import {
  AdminDashboardService,
  asiaShanghaiDayRange,
} from './admin-dashboard.service';

describe('AdminDashboardService', () => {
  it('按 Asia/Shanghai 自然日生成左闭右开绝对时间边界', () => {
    expect(asiaShanghaiDayRange(new Date('2026-07-31T15:59:59.999Z'))).toEqual({
      start: new Date('2026-07-30T16:00:00.000Z'),
      end: new Date('2026-07-31T16:00:00.000Z'),
    });
    expect(asiaShanghaiDayRange(new Date('2026-07-31T16:00:00.000Z'))).toEqual({
      start: new Date('2026-07-31T16:00:00.000Z'),
      end: new Date('2026-08-01T16:00:00.000Z'),
    });
  });

  it('在单次事务中并行统计四项运营指标', async () => {
    const questionCount = Promise.resolve(12);
    const answerCount = Promise.resolve(34);
    const orderCount = Promise.resolve(5);
    const productCount = Promise.resolve(6);
    const prisma = {
      question: { count: jest.fn().mockReturnValue(questionCount) },
      answerAttempt: { count: jest.fn().mockReturnValue(answerCount) },
      order: { count: jest.fn().mockReturnValue(orderCount) },
      product: { count: jest.fn().mockReturnValue(productCount) },
      $transaction: jest.fn().mockResolvedValue([12, 34, 5, 6] as const),
    };
    const service = new AdminDashboardService(prisma as never);
    const now = new Date('2026-07-31T02:30:00.000Z');

    await expect(service.getDashboard(now)).resolves.toEqual({
      activeQuestionCount: 12,
      todayAnswerCount: 34,
      pendingOrderCount: 5,
      activeProductCount: 6,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith([
      questionCount,
      answerCount,
      orderCount,
      productCount,
    ]);
    expect(prisma.answerAttempt.count).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: new Date('2026-07-30T16:00:00.000Z'),
          lt: new Date('2026-07-31T16:00:00.000Z'),
        },
      },
    });
  });
});
