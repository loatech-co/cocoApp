import { periodChange, periodOf } from './period';

const day = (iso: string) => new Date(iso);

describe('periodOf', () => {
  it('snaps a requested month to its first day', () => {
    expect(periodOf('2026-03-15', day('2026-04-05'))).toEqual(day('2026-03-01'));
  });

  it('falls back to the month of the date', () => {
    expect(periodOf(undefined, day('2026-04-05'))).toEqual(day('2026-04-01'));
  });
});

describe('periodChange', () => {
  const inItsMonth = { date: day('2026-03-05'), period: day('2026-03-01') };
  const crossing = { date: day('2026-04-06'), period: day('2026-03-01') };

  it('keeps the month when neither period nor date comes', () => {
    expect(periodChange({}, inItsMonth)).toBeUndefined();
  });

  it('takes an explicit period, normalized', () => {
    expect(periodChange({ period: '2026-02-20', date: '2026-04-01' }, crossing)).toEqual(
      day('2026-02-01'),
    );
  });

  it('moves the month with the date when the period followed the date', () => {
    expect(periodChange({ date: '2026-04-05' }, inItsMonth)).toEqual(day('2026-04-01'));
  });

  it('keeps a month that was set on purpose when only the date moves', () => {
    expect(periodChange({ date: '2026-04-09' }, crossing)).toBeUndefined();
  });
});
