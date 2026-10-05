import { msUntilNextDailyRun, todayInBogota } from './auto-charge.task';

describe('AutoChargeTask schedule', () => {
  it('today is the Bogotá date, five hours behind UTC', () => {
    expect(todayInBogota(new Date('2026-10-06T04:59:00Z'))).toBe('2026-10-05');
    expect(todayInBogota(new Date('2026-10-06T05:00:00Z'))).toBe('2026-10-06');
  });

  it('the next run is the coming 00:05 in Bogotá (05:05 UTC)', () => {
    // 10:00 Bogotá → tomorrow 00:05 is 14 h 5 min away.
    expect(msUntilNextDailyRun(new Date('2026-10-05T15:00:00Z'))).toBe((14 * 60 + 5) * 60 * 1000);
    // 00:00 Bogotá → five minutes.
    expect(msUntilNextDailyRun(new Date('2026-10-06T05:00:00Z'))).toBe(5 * 60 * 1000);
  });

  it('exactly at 00:05 it waits a full day instead of firing twice', () => {
    expect(msUntilNextDailyRun(new Date('2026-10-06T05:05:00Z'))).toBe(24 * 60 * 60 * 1000);
  });

  it('crosses month and year ends', () => {
    expect(todayInBogota(new Date('2027-01-01T03:00:00Z'))).toBe('2026-12-31');
    expect(msUntilNextDailyRun(new Date('2027-01-01T03:00:00Z'))).toBe((2 * 60 + 5) * 60 * 1000);
  });
});
