import { UnprocessableEntityException } from '@nestjs/common';

import type { PrismaService } from '../../prisma/prisma.service';
import type { CategorizationService } from '../categorization/categorization.module';
import type { TransactionsService } from '../transactions/transactions.service';
import { InterpretacionService } from './interpretacion.service';
import * as motor from './interpretar';

/**
 * Lo que la persona eligió a mano manda sobre lo que el motor proponga, y un
 * gasto anotado con concepto y monto —sin texto ni comercio— se registra sin
 * pasar por `interpretar()`. Se prueba con dobles mínimos de la base: lo que
 * se decide aquí es la forma de la clasificación y a qué se llama, no el SQL.
 */
describe('InterpretacionService con una clasificación elegida', () => {
  const USUARIO = 1n;

  // Costos variables (10) › Alimentación (20) › Mercado (30); Transporte (21)
  // es categoría sin conceptos; Gimnasio (31) está archivado.
  const filas = new Map<bigint, { id: bigint; name: string; isArchived: boolean; parent: { id: bigint; parentId: bigint | null } | null }>([
    [10n, { id: 10n, name: 'Costos variables', isArchived: false, parent: null }],
    [20n, { id: 20n, name: 'Alimentación', isArchived: false, parent: { id: 10n, parentId: null } }],
    [21n, { id: 21n, name: 'Transporte', isArchived: false, parent: { id: 10n, parentId: null } }],
    [30n, { id: 30n, name: 'Mercado', isArchived: false, parent: { id: 20n, parentId: 10n } }],
    [31n, { id: 31n, name: 'Gimnasio', isArchived: true, parent: { id: 20n, parentId: 10n } }],
  ]);

  let crear: jest.Mock;
  let servicio: InterpretacionService;
  let interpretar: jest.SpyInstance;

  beforeEach(() => {
    crear = jest.fn((_userId: bigint, dto: Record<string, unknown>) => Promise.resolve({ ...dto, id: 99n }));
    const prisma = {
      // Sin repetidas ni candidatas a duplicado: aquí se prueba la clasificación.
      transaction: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      category: {
        findFirst: jest.fn(({ where }: { where: { id: bigint; userId: bigint } }) =>
          Promise.resolve(where.userId === USUARIO ? (filas.get(where.id) ?? null) : null),
        ),
        findMany: jest.fn().mockResolvedValue([
          { id: 10n, parentId: null, name: 'Costos variables', palabrasClave: [] },
          { id: 20n, parentId: 10n, name: 'Alimentación', palabrasClave: [] },
          { id: 21n, parentId: 10n, name: 'Transporte', palabrasClave: [] },
          { id: 30n, parentId: 20n, name: 'Mercado', palabrasClave: ['koba'] },
        ]),
      },
    } as unknown as PrismaService;
    const categorization = { sugerirPara: jest.fn().mockResolvedValue(null) } as unknown as CategorizationService;
    const transactions = { crear } as unknown as TransactionsService;
    servicio = new InterpretacionService(prisma, categorization, transactions);
    interpretar = jest.spyOn(motor, 'interpretar');
  });

  afterEach(() => jest.restoreAllMocks());

  const capturar = (body: Record<string, unknown>) =>
    servicio.capturar(USUARIO, { source: 'ios_manual', external_ref: 'ref-1', ...body } as never);

  it('un concepto elegido se guarda con certeza alta, sin fuente y sin revisar', async () => {
    const r = await capturar({ monto: '45000', category_id: '30' });

    expect(r.clasificacion).toMatchObject({ certeza: 'alta', fuente: null, nombre: 'Mercado', motivo: 'Lo eligió la persona.' });
    expect(r.clasificacion.concepto_id).toBe(30n);
    expect(r.clasificacion.categoria_id).toBe(20n);
    expect(crear).toHaveBeenCalledWith(USUARIO, expect.objectContaining({ category_id: 30, por_revisar: false }));
  });

  it('una categoría elegida (profundidad 2) queda con certeza media y por revisar', async () => {
    const r = await capturar({ monto: '18500', category_id: '21' });

    expect(r.clasificacion).toMatchObject({ certeza: 'media', concepto_id: null, categoria_id: 21n, nombre: 'Transporte' });
    expect(crear).toHaveBeenCalledWith(USUARIO, expect.objectContaining({ category_id: 21, por_revisar: true }));
  });

  it('un centro de costos no clasifica nada: 422', async () => {
    await expect(capturar({ monto: '1000', category_id: '10' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(crear).not.toHaveBeenCalled();
  });

  it('un concepto archivado, 422', async () => {
    await expect(capturar({ monto: '1000', category_id: '31' })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('un id ajeno o inexistente, 422', async () => {
    await expect(capturar({ monto: '1000', category_id: '404' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(servicio.capturar(2n, { source: 'ios_manual', external_ref: 'ref-2', monto: '1000', category_id: '30' } as never)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('sin texto ni comercio, con concepto y monto, construye el resultado sin llamar a interpretar()', async () => {
    // La coma decimal se normaliza aquí, igual que cuando pasa por el motor.
    const r = await capturar({ monto: '45000,00', fecha: '2026-10-03', category_id: '30' });

    expect(interpretar).not.toHaveBeenCalled();
    expect(crear).toHaveBeenCalledWith(USUARIO, expect.objectContaining({ amount: '45000.00', date: '2026-10-03', merchant: undefined, description: undefined }));
    expect(r.resumen).toBe('Registrado: $45.000 · Mercado');
  });

  it('sin texto, sin comercio y sin concepto sigue siendo 422, aunque venga el monto', async () => {
    await expect(capturar({ monto: '45000' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(interpretar).not.toHaveBeenCalled();
  });

  it('con texto, lo elegido manda sobre lo que el motor propone', async () => {
    const r = await capturar({ texto: 'compra por $45.000 en KOBA COLOMBIA el 03/10/2026', source: 'sms', category_id: '21' });

    expect(interpretar).toHaveBeenCalledTimes(1);
    expect(r.clasificacion).toMatchObject({ certeza: 'media', categoria_id: 21n, motivo: 'Lo eligió la persona.' });
    // Y lo leído del texto se conserva.
    expect(crear).toHaveBeenCalledWith(USUARIO, expect.objectContaining({ amount: '45000', date: '2026-10-03', category_id: 21 }));
  });

  it('la nota va a notes, y sin monto se le añade el aviso', async () => {
    await capturar({ monto: '1000', category_id: '30', nota: 'Para la semana' });
    expect(crear).toHaveBeenLastCalledWith(USUARIO, expect.objectContaining({ notes: 'Para la semana' }));

    await capturar({ comercio: 'Exito', category_id: '30', nota: 'Sin ticket' });
    expect(crear).toHaveBeenLastCalledWith(
      USUARIO,
      expect.objectContaining({ notes: 'Sin ticket\nCapturado sin valor: hay que ponerlo.' }),
    );

    await capturar({ comercio: 'Exito', category_id: '30' });
    expect(crear).toHaveBeenLastCalledWith(USUARIO, expect.objectContaining({ notes: 'Capturado sin valor: hay que ponerlo.' }));
  });
});
