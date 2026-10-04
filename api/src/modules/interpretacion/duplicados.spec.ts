import { VENTANA_DE_DUPLICADO_MS, decidirDuplicado, enriquecer, type CapturaConocida } from './duplicados';

/**
 * Wallet y SMS: la misma plata, dos veces. Lo que no puede fallar: que se
 * fusionen cuando son lo mismo, que se marque cuando se parecen, y que dos
 * capturas del MISMO origen nunca se junten.
 */
const t0 = new Date('2026-10-04T15:00:00Z');
const masTarde = (ms: number) => new Date(t0.getTime() + ms);

const wallet: CapturaConocida = {
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

const sms = (ms: number, extra: Partial<Parameters<typeof decidirDuplicado>[0]> = {}) => ({
  source: 'sms',
  date: '2026-10-04',
  amount: '45000',
  capturedAt: masTarde(ms),
  rawText: 'Bancolombia: compra por $45.000 en EXITO POBLADO',
  merchant: null,
  description: null,
  ...extra,
});

describe('Wallet seguido de SMS', () => {
  it('dentro de la ventana, mismo monto y misma fecha: es el mismo pago', () => {
    const v = decidirDuplicado(sms(90_000), [wallet]);
    expect(v.tipo).toBe('exacto');
    if (v.tipo === 'exacto') expect(v.con.id).toBe(1n);
  });

  it('justo en el borde de la ventana todavía cuenta', () => {
    expect(decidirDuplicado(sms(VENTANA_DE_DUPLICADO_MS), [wallet]).tipo).toBe('exacto');
  });

  it('fuera de la ventana pero el mismo día: parecido parcial, a revisar', () => {
    expect(decidirDuplicado(sms(VENTANA_DE_DUPLICADO_MS + 1), [wallet]).tipo).toBe('parcial');
  });

  it('otra fecha pero a minutos de distancia —medianoche—: parcial', () => {
    // Pago a las 23:58 del 3, SMS a las 00:02 del 4. Es el mismo pago, pero
    // la fecha no coincide: se guarda y se marca, no se adivina.
    const anoche = { ...wallet, date: '2026-10-03', capturedAt: new Date('2026-10-03T23:58:00-05:00'), createdAt: new Date('2026-10-03T23:58:00-05:00') };
    const v = decidirDuplicado(sms(0, { capturedAt: new Date('2026-10-04T00:02:00-05:00') }), [anoche]);
    expect(v.tipo).toBe('parcial');
  });

  it('otro monto no es duplicado de nada', () => {
    expect(decidirDuplicado(sms(60_000, { amount: '46000' }), [wallet]).tipo).toBe('ninguno');
  });

  it('el mismo origen NUNCA se fusiona: dos SMS son dos compras', () => {
    const otroSms: CapturaConocida = { ...wallet, id: 2n, source: 'sms' };
    expect(decidirDuplicado(sms(30_000), [otroSms]).tipo).toBe('ninguno');
  });

  it('una captura desde la web o a mano no busca duplicados', () => {
    expect(decidirDuplicado(sms(30_000, { source: 'web' }), [wallet]).tipo).toBe('ninguno');
    expect(decidirDuplicado(sms(30_000, { source: 'ios_manual' }), [wallet]).tipo).toBe('ninguno');
  });

  it('entre varias candidatas gana la más cercana en el tiempo', () => {
    const lejana: CapturaConocida = { ...wallet, id: 9n, capturedAt: masTarde(-8 * 60_000), createdAt: masTarde(-8 * 60_000) };
    const v = decidirDuplicado(sms(30_000), [lejana, wallet]);
    expect(v.tipo).toBe('exacto');
    if (v.tipo === 'exacto') expect(v.con.id).toBe(1n);
  });

  it('sin capturedAt en la conocida se usa cuándo llegó', () => {
    const sinCaptura: CapturaConocida = { ...wallet, capturedAt: null };
    expect(decidirDuplicado(sms(60_000), [sinCaptura]).tipo).toBe('exacto');
  });
});

describe('Enriquecer la que ya estaba', () => {
  it('aporta solo lo que falta: el texto del SMS, no el comercio que Wallet ya trajo', () => {
    const cambios = enriquecer(wallet, sms(0));
    expect(cambios).toEqual({ rawText: 'Bancolombia: compra por $45.000 en EXITO POBLADO' });
  });

  it('nunca pisa lo que había', () => {
    const conTexto: CapturaConocida = { ...wallet, rawText: 'lo primero que se supo' };
    expect(enriquecer(conTexto, sms(0))).toEqual({});
  });

  it('un SMS primero y Wallet después: Wallet aporta el comercio', () => {
    const primeroElSms: CapturaConocida = { ...wallet, source: 'sms', merchant: null, description: null, rawText: 'SMS' };
    const cambios = enriquecer(primeroElSms, { ...sms(0), source: 'wallet', merchant: 'Exito Poblado', description: 'Exito Poblado', rawText: null });
    expect(cambios).toEqual({ merchant: 'Exito Poblado', description: 'Exito Poblado' });
  });
});
