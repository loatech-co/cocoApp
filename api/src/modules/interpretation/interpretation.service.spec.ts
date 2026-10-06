import * as engine from './interpret';
import { InterpretationService } from './interpretation.service';
import { ValidationError } from '../../common/errors/domain-error';
import type { CategoryLookupService } from '../categories/category-lookup.service';
import type { CategorizationService } from '../categorization/categorization.service';
import type { LedgerService } from '../transactions/ledger.service';
import type { TransactionsService } from '../transactions/transactions.service';

/**
 * Lo que la persona eligió a mano manda sobre lo que el motor proponga, y un
 * gasto anotado con concepto y monto —sin texto ni comercio— se registra sin
 * pasar por `interpretar()`. Se prueba con dobles mínimos de la base: lo que
 * se decide aquí es la forma de la clasificación y a qué se llama, no el SQL.
 */
describe('InterpretacionService con una clasificación elegida', () => {
  const USER_ID = 1n;

  // Costos variables (10) › Alimentación (20) › Mercado (30); Transporte (21)
  // es categoría sin conceptos; Gimnasio (31) está archivado.
  const rows = new Map<
    bigint,
    {
      id: bigint;
      name: string;
      isArchived: boolean;
      parent: { id: bigint; parentId: bigint | null } | null;
    }
  >([
    [10n, { id: 10n, name: 'Costos variables', isArchived: false, parent: null }],
    [
      20n,
      { id: 20n, name: 'Alimentación', isArchived: false, parent: { id: 10n, parentId: null } },
    ],
    [21n, { id: 21n, name: 'Transporte', isArchived: false, parent: { id: 10n, parentId: null } }],
    [30n, { id: 30n, name: 'Mercado', isArchived: false, parent: { id: 20n, parentId: 10n } }],
    [31n, { id: 31n, name: 'Gimnasio', isArchived: true, parent: { id: 20n, parentId: 10n } }],
  ]);

  let create: jest.Mock;
  let service: InterpretationService;
  let interpretSpy: jest.SpyInstance;

  beforeEach(() => {
    create = jest.fn((_userId: bigint, dto: Record<string, unknown>) =>
      Promise.resolve({ ...dto, id: 99n }),
    );
    // Sin repetidas ni candidatas a duplicado: aquí se prueba la clasificación.
    const ledger = {
      findIdByExternalRef: jest.fn().mockResolvedValue(null),
      createUnlessTwin: jest.fn().mockResolvedValue({ kind: 'created', id: 99n }),
    } as unknown as LedgerService;
    const categories = {
      findChosen: jest.fn((userId: bigint, id: bigint) =>
        Promise.resolve(userId === USER_ID ? (rows.get(id) ?? null) : null),
      ),
      findSearchable: jest.fn().mockResolvedValue([
        { id: 10n, parentId: null, name: 'Costos variables', keywords: [] },
        { id: 20n, parentId: 10n, name: 'Alimentación', keywords: [] },
        { id: 21n, parentId: 10n, name: 'Transporte', keywords: [] },
        { id: 30n, parentId: 20n, name: 'Mercado', keywords: ['koba'] },
      ]),
    } as unknown as CategoryLookupService;
    const categorization = {
      suggestFor: jest.fn().mockResolvedValue(null),
    } as unknown as CategorizationService;
    // Wallet y SMS pasan por `prepararAlta` y la escritura con candado; lo
    // que se escribe es lo mismo, así que las dos puertas comparten el doble.
    const transactions = {
      create,
      prepareCreate: create,
      get: jest.fn((_userId: bigint, id: bigint) => Promise.resolve({ id })),
    } as unknown as TransactionsService;
    service = new InterpretationService(ledger, categories, categorization, transactions);
    interpretSpy = jest.spyOn(engine, 'interpret');
  });

  afterEach(() => jest.restoreAllMocks());

  const capture = (body: Record<string, unknown>) =>
    service.capture(USER_ID, { source: 'ios_manual', external_ref: 'ref-1', ...body } as never);

  it('un concepto elegido se guarda con certeza alta, sin fuente y sin revisar', async () => {
    const r = await capture({ monto: '45000', category_id: '30' });

    expect(r.classification).toMatchObject({
      certainty: 'high',
      source: null,
      name: 'Mercado',
      reason: 'Lo eligió la persona.',
    });
    expect(r.classification.conceptId).toBe(30n);
    expect(r.classification.categoryId).toBe(20n);
    expect(create).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ category_id: 30, por_revisar: false }),
    );
  });

  it('una categoría elegida (profundidad 2) queda con certeza media y por revisar', async () => {
    const r = await capture({ monto: '18500', category_id: '21' });

    expect(r.classification).toMatchObject({
      certainty: 'medium',
      conceptId: null,
      categoryId: 21n,
      name: 'Transporte',
    });
    expect(create).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ category_id: 21, por_revisar: true }),
    );
  });

  it('un centro de costos no clasifica nada: 422', async () => {
    await expect(capture({ monto: '1000', category_id: '10' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('un concepto archivado, 422', async () => {
    await expect(capture({ monto: '1000', category_id: '31' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('un id ajeno o inexistente, 422', async () => {
    await expect(capture({ monto: '1000', category_id: '404' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      service.capture(2n, {
        source: 'ios_manual',
        external_ref: 'ref-2',
        monto: '1000',
        category_id: '30',
      } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('sin texto ni comercio, con concepto y monto, construye el resultado sin llamar a interpretar()', async () => {
    // La coma decimal se normaliza aquí, igual que cuando pasa por el motor.
    const r = await capture({ monto: '45000,00', fecha: '2026-10-03', category_id: '30' });

    expect(interpretSpy).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        amount: '45000.00',
        date: '2026-10-03',
        merchant: undefined,
        description: undefined,
      }),
    );
    expect(r.summary).toBe('Registrado: $45.000 · Mercado');
  });

  it('sin texto, sin comercio y sin concepto sigue siendo 422, aunque venga el monto', async () => {
    await expect(capture({ monto: '45000' })).rejects.toBeInstanceOf(ValidationError);
    expect(interpretSpy).not.toHaveBeenCalled();
  });

  it('con texto, lo elegido manda sobre lo que el motor propone', async () => {
    const r = await capture({
      texto: 'compra por $45.000 en KOBA COLOMBIA el 03/10/2026',
      source: 'sms',
      category_id: '21',
    });

    expect(interpretSpy).toHaveBeenCalledTimes(1);
    expect(r.classification).toMatchObject({
      certainty: 'medium',
      categoryId: 21n,
      reason: 'Lo eligió la persona.',
    });
    // Y lo leído del texto se conserva.
    expect(create).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ amount: '45000', date: '2026-10-03', category_id: 21 }),
    );
  });

  it('la nota va a notes, y sin monto se le añade el aviso', async () => {
    await capture({ monto: '1000', category_id: '30', nota: 'Para la semana' });
    expect(create).toHaveBeenLastCalledWith(
      USER_ID,
      expect.objectContaining({ notes: 'Para la semana' }),
    );

    await capture({ comercio: 'Exito', category_id: '30', nota: 'Sin ticket' });
    expect(create).toHaveBeenLastCalledWith(
      USER_ID,
      expect.objectContaining({ notes: 'Sin ticket\nCapturado sin valor: hay que ponerlo.' }),
    );

    await capture({ comercio: 'Exito', category_id: '30' });
    expect(create).toHaveBeenLastCalledWith(
      USER_ID,
      expect.objectContaining({ notes: 'Capturado sin valor: hay que ponerlo.' }),
    );
  });
});
