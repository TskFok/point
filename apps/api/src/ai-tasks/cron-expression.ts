import { CronExpressionParser } from 'cron-parser';

const CRON_TZ = 'Asia/Shanghai';

export function assertCronExpression(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('crontab 表达式不能为空');
  }
  const parts = normalized.split(/\s+/);
  if (parts.length !== 5) {
    throw new Error('crontab 必须是 5 段表达式');
  }
  try {
    CronExpressionParser.parse(normalized, { tz: CRON_TZ });
  } catch {
    throw new Error('crontab 表达式不合法');
  }
  return normalized;
}

/** 以分钟为粒度判断表达式是否在该时刻命中（时区 Asia/Shanghai） */
export function cronMatchesDate(expression: string, date: Date): boolean {
  const minuteStartMs = Math.floor(date.getTime() / 60_000) * 60_000;
  const minuteEndMs = minuteStartMs + 60_000;
  try {
    const iter = CronExpressionParser.parse(expression, {
      currentDate: new Date(minuteStartMs - 1),
      endDate: new Date(minuteEndMs),
      tz: CRON_TZ,
    });
    const next = iter.next().toDate();
    return next.getTime() >= minuteStartMs && next.getTime() < minuteEndMs;
  } catch {
    return false;
  }
}
