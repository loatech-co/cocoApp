import { DUPLICATE_WINDOW_MS, decideDuplicate, enrich, type KnownCapture } from './duplicates';

/**
 * Wallet and SMS: the same money, twice. What cannot fail: that they merge
 * when they are the same, that it is flagged when they look alike, and that
 * two captures from the SAME source are never merged.
 */
const t0 = new Date('2026-10-04T15:00:00Z');
const later = (ms: number) => new Date(t0.getTime() + ms);

const wallet: KnownCapture = {
  id: 1n,
  source: 'wallet',
  date: '2026-10-04',
  amount: '45000.00',
  capturedAt: t0,
  createdAt: t0,
  rawText: null,
  merchant: 'Exito Poblado',
  description: 'Exito Poblado',
};

const sms = (ms: number, extra: Partial<Parameters<typeof decideDuplicate>[0]> = {}) => ({
  source: 'sms',
  date: '2026-10-04',
  amount: '45000',
  capturedAt: later(ms),
  rawText: 'Bancolombia: compra por $45.000 en EXITO POBLADO',
  merchant: null,
  description: null,
  ...extra,
});

describe('Wallet followed by SMS', () => {
  it('within the window, same amount and same date: it is the same payment', () => {
    const v = decideDuplicate(sms(90_000), [wallet]);
    expect(v.kind).toBe('exact');
    if (v.kind === 'exact') expect(v.match.id).toBe(1n);
  });

  it('right at the edge of the window still counts', () => {
    expect(decideDuplicate(sms(DUPLICATE_WINDOW_MS), [wallet]).kind).toBe('exact');
  });

  it('outside the window but the same day: a partial match, for review', () => {
    expect(decideDuplicate(sms(DUPLICATE_WINDOW_MS + 1), [wallet]).kind).toBe('partial');
  });

  it('another date but minutes apart —midnight—: partial', () => {
    // Payment at 23:58 on the 3rd, SMS at 00:02 on the 4th. It is the same
    // payment, but the date does not match: it is saved and flagged, not guessed.
    const lastNight = {
      ...wallet,
      date: '2026-10-03',
      capturedAt: new Date('2026-10-03T23:58:00-05:00'),
      createdAt: new Date('2026-10-03T23:58:00-05:00'),
    };
    const v = decideDuplicate(sms(0, { capturedAt: new Date('2026-10-04T00:02:00-05:00') }), [
      lastNight,
    ]);
    expect(v.kind).toBe('partial');
  });

  it('another amount is a duplicate of nothing', () => {
    expect(decideDuplicate(sms(60_000, { amount: '46000' }), [wallet]).kind).toBe('none');
  });

  it('the same source NEVER merges: two SMS are two purchases', () => {
    const otherSms: KnownCapture = { ...wallet, id: 2n, source: 'sms' };
    expect(decideDuplicate(sms(30_000), [otherSms]).kind).toBe('none');
  });

  it('a capture from the web or by hand does not look for duplicates', () => {
    expect(decideDuplicate(sms(30_000, { source: 'web' }), [wallet]).kind).toBe('none');
    expect(decideDuplicate(sms(30_000, { source: 'ios_manual' }), [wallet]).kind).toBe('none');
  });

  it('among several candidates the closest in time wins', () => {
    const distant: KnownCapture = {
      ...wallet,
      id: 9n,
      capturedAt: later(-8 * 60_000),
      createdAt: later(-8 * 60_000),
    };
    const v = decideDuplicate(sms(30_000), [distant, wallet]);
    expect(v.kind).toBe('exact');
    if (v.kind === 'exact') expect(v.match.id).toBe(1n);
  });

  it('without capturedAt on the known one, its arrival time is used', () => {
    const withoutCapturedAt: KnownCapture = { ...wallet, capturedAt: null };
    expect(decideDuplicate(sms(60_000), [withoutCapturedAt]).kind).toBe('exact');
  });
});

describe('Enriching the existing one', () => {
  it('adds only what is missing: the SMS text, not the merchant Wallet already brought', () => {
    const changes = enrich(wallet, sms(0));
    expect(changes).toEqual({ rawText: 'Bancolombia: compra por $45.000 en EXITO POBLADO' });
  });

  it('never overwrites what was there', () => {
    const withText: KnownCapture = { ...wallet, rawText: 'lo primero que se supo' };
    expect(enrich(withText, sms(0))).toEqual({});
  });

  it('an SMS first and Wallet later: Wallet adds the merchant', () => {
    const smsFirst: KnownCapture = {
      ...wallet,
      source: 'sms',
      merchant: null,
      description: null,
      rawText: 'SMS',
    };
    const changes = enrich(smsFirst, {
      ...sms(0),
      source: 'wallet',
      merchant: 'Exito Poblado',
      description: 'Exito Poblado',
      rawText: null,
    });
    expect(changes).toEqual({ merchant: 'Exito Poblado', description: 'Exito Poblado' });
  });
});
