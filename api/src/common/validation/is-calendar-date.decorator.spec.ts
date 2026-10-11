import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { IsCalendarDate } from './is-calendar-date.decorator';

class Body {
  @IsCalendarDate({ message: 'La fecha debe tener formato YYYY-MM-DD.' })
  date!: string;
}

async function errorsOf(date: unknown): Promise<number> {
  const errors = await validate(plainToInstance(Body, { date }));
  return errors.length;
}

describe('IsCalendarDate', () => {
  it('accepts a day that exists', async () => {
    expect(await errorsOf('2026-02-28')).toBe(0);
    expect(await errorsOf('2024-02-29')).toBe(0);
  });

  it('rejects a day the calendar does not have', async () => {
    expect(await errorsOf('2026-02-30')).toBeGreaterThan(0);
    expect(await errorsOf('2026-13-01')).toBeGreaterThan(0);
  });

  it('rejects a time, an offset or any other shape', async () => {
    expect(await errorsOf('2026-02-10T10:00:00Z')).toBeGreaterThan(0);
    expect(await errorsOf('2026-02-10T23:30:00-05:00')).toBeGreaterThan(0);
    expect(await errorsOf('10/02/2026')).toBeGreaterThan(0);
    expect(await errorsOf('2026-2-1')).toBeGreaterThan(0);
    expect(await errorsOf(null)).toBeGreaterThan(0);
  });
});
