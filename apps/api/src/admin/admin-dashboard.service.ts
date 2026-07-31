import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const BUSINESS_TIME_ZONE = 'Asia/Shanghai';
const SHANGHAI_UTC_OFFSET_HOURS = 8;
const shanghaiDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function asiaShanghaiDayRange(now: Date): {
  start: Date;
  end: Date;
} {
  const dateParts = Object.fromEntries(
    shanghaiDateFormatter
      .formatToParts(now)
      .filter(
        ({ type }) => type === 'year' || type === 'month' || type === 'day',
      )
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<'year' | 'month' | 'day', number>;
  const offsetMs = SHANGHAI_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const startMs =
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day) - offsetMs;

  return {
    start: new Date(startMs),
    end: new Date(
      Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day + 1) -
        offsetMs,
    ),
  };
}

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(now = new Date()) {
    const { start, end } = asiaShanghaiDayRange(now);
    const [
      activeQuestionCount,
      todayAnswerCount,
      pendingOrderCount,
      activeProductCount,
    ] = await this.prisma.$transaction([
      this.prisma.question.count({ where: { isActive: true } }),
      this.prisma.answerAttempt.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
      this.prisma.order.count({ where: { status: 'PENDING_PICKUP' } }),
      this.prisma.product.count({ where: { isActive: true } }),
    ]);

    return {
      activeQuestionCount,
      todayAnswerCount,
      pendingOrderCount,
      activeProductCount,
    };
  }
}
