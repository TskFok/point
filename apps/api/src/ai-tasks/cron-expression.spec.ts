import { assertCronExpression, cronMatchesDate } from './cron-expression';

describe('cron-expression', () => {
  it('接受合法 5 段表达式', () => {
    expect(assertCronExpression(' 0 8 * * * ')).toBe('0 8 * * *');
  });

  it('拒绝非法表达式', () => {
    expect(() => assertCronExpression('not-a-cron')).toThrow(/crontab/);
  });

  it('命中每天 8:00（Asia/Shanghai）', () => {
    const d = new Date('2026-08-03T08:00:00+08:00');
    expect(cronMatchesDate('0 8 * * *', d)).toBe(true);
    expect(
      cronMatchesDate('0 8 * * *', new Date('2026-08-03T08:01:00+08:00')),
    ).toBe(false);
  });
});
