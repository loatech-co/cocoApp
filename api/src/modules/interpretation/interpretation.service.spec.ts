import * as engine from './interpret';
import { InterpretationService } from './interpretation.service';
import { ValidationError } from '../../common/errors/domain-error';
import type { CategoryLookupService } from '../categories/category-lookup.service';
import type { CategorizationService } from '../categorization/categorization.service';
import type { LedgerService } from '../transactions/ledger.service';
import type { TransactionsService } from '../transactions/transactions.service';

/**
 * What the person chose by hand wins over what the engine proposes, and an
 * expense noted with concept and amount —no text or merchant— is recorded
 * without going through `interpret()`. Tested with minimal database doubles:
 * what is decided here is the shape of the classification and what gets
 * called, not the SQL.
 */
describe('InterpretationService with a chosen classification', () => {
  const USER_ID = 1n;

  // Costos variables (10) › Alimentación (20) › Mercado (30); Transporte (21)
  // is a category without concepts; Gimnasio (31) is archived.
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
    // No repeats and no duplicate candidates: the classification is what is tested here.
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
    // Wallet and SMS go through `prepareCreate` and the locked write; what is
    // written is the same, so both doors share the double.
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

  it('a chosen concept is saved with high certainty, no source and not for review', async () => {
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

  it('a chosen category (depth 2) gets medium certainty and is for review', async () => {
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

  it('a cost center classifies nothing: 422', async () => {
    await expect(capture({ monto: '1000', category_id: '10' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('an archived concept, 422', async () => {
    await expect(capture({ monto: '1000', category_id: '31' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("someone else's or a missing id, 422", async () => {
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

  it('without text or merchant, with concept and amount, builds the result without calling interpret()', async () => {
    // The decimal comma is normalised here, as when it goes through the engine.
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

  it('without text, merchant or concept it is still 422, even with an amount', async () => {
    await expect(capture({ monto: '45000' })).rejects.toBeInstanceOf(ValidationError);
    expect(interpretSpy).not.toHaveBeenCalled();
  });

  it('with text, the choice wins over what the engine proposes', async () => {
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
    // And what was read from the text is kept.
    expect(create).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ amount: '45000', date: '2026-10-03', category_id: 21 }),
    );
  });

  it('the note goes to notes, and without an amount the warning is added', async () => {
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
