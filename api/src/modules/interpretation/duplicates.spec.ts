import { DUPLICATE_WINDOW_MS, decideDuplicate, enrich, type KnownCapture } from './duplicates';

/**
 * Wallet y SMS: la misma plata, dos veces. Lo que no puede fallar: que se
 * fusionen cuando son lo mismo, que se marque cuando se parecen, y que dos
 * capturas del MISMO origen nunca se junten.
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

describe('Wallet seguido de SMS', () => {
  it('dentro de la ventana, mismo monto y misma fecha: es el mismo pago', () => {
    const v = decideDuplicate(sms(90_000), [wallet]);
    expect(v.kind).toBe('exact');
    if (v.kind === 'exact') expect(v.match.id).toBe(1n);
  });

  it('justo en el borde de la ventana todavía cuenta', () => {
    expect(decideDuplicate(sms(DUPLICATE_WINDOW_MS), [wallet]).kind).toBe('exact');
  });

  it('fuera de la ventana pero el mismo día: parecido parcial, a revisar', () => {
    expect(decideDuplicate(sms(DUPLICATE_WINDOW_MS + 1), [wallet]).kind).toBe('partial');
  });

  it('otra fecha pero a minutos de distancia —medianoche—: parcial', () => {
    // Pago a las 23:58 del 3, SMS a las 00:02 del 4. Es el mismo pago, pero
    // la fecha no coincide: se guarda y se marca, no se adivina.
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

  it('otro monto no es duplicado de nada', () => {
    expect(decideDuplicate(sms(60_000, { amount: '46000' }), [wallet]).kind).toBe('none');
  });

  it('el mismo origen NUNCA se fusiona: dos SMS son dos compras', () => {
    const otherSms: KnownCapture = { ...wallet, id: 2n, source: 'sms' };
    expect(decideDuplicate(sms(30_000), [otherSms]).kind).toBe('none');
  });

  it('una captura desde la web o a mano no busca duplicados', () => {
    expect(decideDuplicate(sms(30_000, { source: 'web' }), [wallet]).kind).toBe('none');
    expect(decideDuplicate(sms(30_000, { source: 'ios_manual' }), [wallet]).kind).toBe('none');
  });

  it('entre varias candidatas gana la más cercana en el tiempo', () => {
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

  it('sin capturedAt en la conocida se usa cuándo llegó', () => {
    const withoutCapturedAt: KnownCapture = { ...wallet, capturedAt: null };
    expect(decideDuplicate(sms(60_000), [withoutCapturedAt]).kind).toBe('exact');
  });
});

describe('Enriquecer la que ya estaba', () => {
  it('aporta solo lo que falta: el texto del SMS, no el comercio que Wallet ya trajo', () => {
    const changes = enrich(wallet, sms(0));
    expect(changes).toEqual({ rawText: 'Bancolombia: compra por $45.000 en EXITO POBLADO' });
  });

  it('nunca pisa lo que había', () => {
    const withText: KnownCapture = { ...wallet, rawText: 'lo primero que se supo' };
    expect(enrich(withText, sms(0))).toEqual({});
  });

  it('un SMS primero y Wallet después: Wallet aporta el comercio', () => {
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
