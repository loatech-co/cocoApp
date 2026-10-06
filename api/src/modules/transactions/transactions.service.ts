import { Injectable } from '@nestjs/common';
import type { Transaction, TransactionType } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import type {
  CreateTransactionDto,
  CreateTransferDto,
  ListTransactionsQueryDto,
  SplitDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
import {
  TransactionsRepository,
  type SplitToWrite,
  type TransaccionCompleta,
} from './transactions.repository';
import { parsePaginacion } from './transactions.sort';
import { splitsParaEscribir } from './transactions.splits';
import { NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { serializar, toMoney, type Money } from '../../common/money/money';
import { SoportesService } from '../soportes/soportes.service';
import { TagsService } from '../tags/tags.service';

interface SplitView {
  id: bigint;
  category_id: bigint | null;
  amount: string;
  note: string | null;
}

export interface TransactionView {
  id: bigint;
  uuid: string;
  account_id: bigint | null;
  date: string;
  /** El mes AL QUE PERTENECE el gasto, que no siempre es el del pago. */
  period: string;
  amount: string;
  /** ISO 4217 code of `amount`. */
  currency: string;
  type: TransactionType;
  category_id: bigint | null;
  description: string | null;
  merchant: string | null;
  notes: string | null;
  transfer_group_id: string | null;
  transfer_direction: 'out' | 'in' | null;
  external_ref: string | null;
  status: Transaction['status'];
  source: Transaction['source'];
  raw_text: string | null;
  captured_at: Date | null;
  por_revisar: boolean;
  tags: string[];
  splits: SplitView[];
  created_at: Date;
}

/**
 * El primer día del mes de una fecha.
 *
 * Es el valor por defecto de `period`: la mayoría de los gastos pertenecen al
 * mes en que se pagaron, y obligar a declararlo en cada registro sería fricción
 * para el caso común. Solo las facturas que cruzan de mes necesitan decirlo.
 */
function mesDe(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 1));
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly repository: TransactionsRepository,
    private readonly tags: TagsService,
    private readonly soportes: SoportesService,
  ) {}

  // ── Lectura ────────────────────────────────────────────────────────────────

  async listar(
    userId: bigint,
    query: ListTransactionsQueryDto,
  ): Promise<{
    data: TransactionView[];
    meta: {
      page: number;
      per_page: number;
      total: number;
      sum_expense: string;
      sum_income: string;
    };
  }> {
    const { page, perPage, skip, take } = parsePaginacion(query.page, query.per_page);
    const {
      rows: filas,
      total,
      sumOf,
    } = await this.repository.findPage(userId, query, {
      skip,
      take,
    });
    const sumaDe = (tipo: TransactionType): string => serializar(sumOf(tipo));

    return {
      data: filas.map((fila) => this.presentar(fila)),
      meta: {
        page,
        per_page: perPage,
        total,
        sum_expense: sumaDe('expense'),
        sum_income: sumaDe('income'),
      },
    };
  }

  /**
   * Desde cuándo y hasta cuándo hay historia.
   *
   * Existe para que "Todo" signifique algo. Sin esto, el rango arrancaba en
   * 1970 y terminaba cinco años en el futuro: el eje de la gráfica se estiraba
   * sobre medio siglo vacío para dibujar cuatro años de datos, y el botón de
   * fechas prometía un periodo que nunca existió.
   *
   * Por PERIODO y no por fecha de pago: es el eje con el que se mira la app.
   */
  async historia(userId: bigint): Promise<{ first: string | null; last: string | null }> {
    const { first, last } = await this.repository.periodRange(userId);
    const iso = (fecha: Date | null): string | null => fecha?.toISOString().slice(0, 10) ?? null;
    return { first: iso(first), last: iso(last) };
  }

  async obtener(userId: bigint, id: bigint): Promise<TransactionView> {
    return this.presentar(await this.exigirMovimiento(userId, id));
  }

  // ── Escritura ──────────────────────────────────────────────────────────────

  async crear(userId: bigint, dto: CreateTransactionDto): Promise<TransactionView> {
    // Sin cuenta es un caso válido, no un error: llevarlas es opcional.
    const accountId = dto.account_id !== undefined ? BigInt(dto.account_id) : null;
    const categoryId = dto.category_id !== undefined ? BigInt(dto.category_id) : null;
    const amount = toMoney(dto.amount);
    const tipo = dto.type ?? 'expense';

    if (accountId !== null) await this.exigirCuentaPropia(userId, accountId);
    if (categoryId !== null) await this.exigirCategoriaPropia(userId, categoryId);

    const splits = await this.prepararSplits(userId, amount, dto.splits);
    const tagIds = dto.tags?.length ? await this.tags.resolverNombres(userId, dto.tags) : [];

    const creada = await this.repository.createWithDetails(
      {
        userId,
        accountId,
        date: new Date(dto.date),
        period: dto.period ? new Date(dto.period) : mesDe(new Date(dto.date)),
        amount,
        type: tipo,
        categoryId,
        description: dto.description ?? null,
        merchant: dto.merchant ?? null,
        notes: dto.notes ?? null,
        externalRef: dto.external_ref ?? null,
        status: dto.status ?? 'cleared',
        source: dto.source ?? 'web',
        rawText: dto.raw_text ?? null,
        capturedAt: dto.captured_at ? new Date(dto.captured_at) : null,
        porRevisar: dto.por_revisar ?? false,
      },
      splits,
      tagIds,
    );

    return this.presentar(creada);
  }

  /**
   * Una transferencia son DOS filas emparejadas por `transfer_group_id`, no un
   * movimiento con dos cuentas. Se crean en la misma transacción: jamás debe
   * existir una pata sin su contraparte, porque entonces el dinero se
   * "evaporaría" de un lado sin aparecer en el otro.
   *
   * No cuenta como gasto ni como ingreso: solo redistribuye saldo entre
   * bolsillos del propio usuario.
   */
  async crearTransferencia(
    userId: bigint,
    dto: CreateTransferDto,
  ): Promise<{ transfer_group_id: string; legs: TransactionView[] }> {
    const origen = BigInt(dto.from_account_id);
    const destino = BigInt(dto.to_account_id);

    if (origen === destino) {
      throw new ValidationError('La cuenta de origen y la de destino no pueden ser la misma.');
    }

    await Promise.all([
      this.exigirCuentaPropia(userId, origen),
      this.exigirCuentaPropia(userId, destino),
    ]);

    const amount = toMoney(dto.amount);
    const grupo = randomUUID();
    const fecha = new Date(dto.date);

    const base = {
      userId,
      date: fecha,
      period: dto.period ? new Date(dto.period) : mesDe(fecha),
      amount,
      type: 'transfer' as const,
      description: dto.description ?? null,
      transferGroupId: grupo,
      status: 'cleared' as const,
    };

    const patas = await this.repository.createTransfer(base, origen, destino);

    return { transfer_group_id: grupo, legs: patas.map((pata) => this.presentar(pata)) };
  }

  async actualizar(
    userId: bigint,
    id: bigint,
    dto: UpdateTransactionDto,
  ): Promise<TransactionView> {
    const actual = await this.exigirMovimiento(userId, id);

    const accountId = dto.account_id !== undefined ? BigInt(dto.account_id) : actual.accountId;
    if (accountId !== null && dto.account_id !== undefined) {
      await this.exigirCuentaPropia(userId, accountId);
    }

    if (dto.category_id !== undefined && dto.category_id !== null) {
      await this.exigirCategoriaPropia(userId, BigInt(dto.category_id));
    }

    const amount = dto.amount !== undefined ? toMoney(dto.amount) : toMoney(actual.amount);

    // Si llegan splits nuevos, se revalida el cuadre contra el monto resultante.
    const splits =
      dto.splits !== undefined ? await this.prepararSplits(userId, amount, dto.splits) : null;
    const tagIds =
      dto.tags !== undefined ? await this.tags.resolverNombres(userId, dto.tags) : null;

    const actualizada = await this.repository.updateWithDetails(
      id,
      cambiosDe(dto, accountId, amount),
      splits,
      tagIds,
    );

    return this.presentar(actualizada);
  }

  /**
   * Borrar una pata de transferencia se lleva la otra: dejar una suelta
   * descuadraría el patrimonio, porque el dinero saldría de una cuenta sin
   * entrar a ninguna.
   */
  async eliminar(userId: bigint, id: bigint): Promise<void> {
    const movimiento = await this.exigirMovimiento(userId, id);

    // The receipt rows cascade with the movement; their files do not. Their
    // keys are read first and the files go after the rows (phase 6.9).
    if (movimiento.transferGroupId) {
      const keys = await this.soportes.keysOf(userId, {
        transferGroupId: movimiento.transferGroupId,
      });
      await this.repository.deleteTransferGroup(userId, movimiento.transferGroupId);
      await this.soportes.removeFiles(keys);
      return;
    }

    const keys = await this.soportes.keysOf(userId, { transactionId: id });
    await this.repository.deleteOne(userId, id);
    await this.soportes.removeFiles(keys);
  }

  // ── Apoyo ──────────────────────────────────────────────────────────────────

  /**
   * Valida el cuadre y exige que cada categoría sea del usuario (422): sin eso
   * un split colgaba un movimiento propio de un concepto ajeno.
   */
  private async prepararSplits(
    userId: bigint,
    amountCabecera: Money,
    splits: readonly SplitDto[] | undefined,
  ): Promise<SplitToWrite[]> {
    const listos = splitsParaEscribir(amountCabecera, splits);
    const ids = listos.flatMap((split) => (split.categoryId !== null ? [split.categoryId] : []));
    if (!(await this.repository.categoriesBelongTo(userId, ids))) {
      throw new ValidationError('La categoría indicada no existe o no es tuya.');
    }
    return listos;
  }

  private async exigirMovimiento(userId: bigint, id: bigint): Promise<TransaccionCompleta> {
    const movimiento = await this.repository.findOwned(userId, id);
    if (!movimiento) throw new NotFoundError('El movimiento no existe.');
    return movimiento;
  }

  /** Sin esta verificación se podría asociar un movimiento a la cuenta de otro. */
  private async exigirCuentaPropia(userId: bigint, accountId: bigint): Promise<void> {
    if (!(await this.repository.accountBelongsTo(userId, accountId))) {
      throw new ValidationError('La cuenta indicada no existe o no es tuya.');
    }
  }

  private async exigirCategoriaPropia(userId: bigint, categoryId: bigint): Promise<void> {
    if (!(await this.repository.categoryBelongsTo(userId, categoryId))) {
      throw new ValidationError('La categoría indicada no existe o no es tuya.');
    }
  }

  private presentar(fila: TransaccionCompleta): TransactionView {
    return {
      id: fila.id,
      uuid: fila.uuid,
      account_id: fila.accountId,
      date: fila.date.toISOString().slice(0, 10),
      period: fila.period.toISOString().slice(0, 10),
      amount: serializar(toMoney(fila.amount)),
      currency: fila.currency,
      type: fila.type,
      category_id: fila.categoryId,
      description: fila.description,
      merchant: fila.merchant,
      notes: fila.notes,
      transfer_group_id: fila.transferGroupId,
      transfer_direction: fila.transferDir,
      external_ref: fila.externalRef,
      status: fila.status,
      source: fila.source,
      raw_text: fila.rawText,
      captured_at: fila.capturedAt,
      por_revisar: fila.porRevisar,
      tags: fila.tags.map((vinculo) => vinculo.tag.name),
      splits: fila.splits.map((split) => ({
        id: split.id,
        category_id: split.categoryId,
        amount: serializar(toMoney(split.amount)),
        note: split.note,
      })),
      created_at: fila.createdAt,
    };
  }
}

/** The columns a PATCH changes: only what the DTO brought. */
function cambiosDe(
  dto: UpdateTransactionDto,
  accountId: bigint | null,
  amount: Money,
): Parameters<TransactionsRepository['updateWithDetails']>[1] {
  return {
    ...(dto.account_id !== undefined && { accountId }),
    ...(dto.date !== undefined && { date: new Date(dto.date) }),
    ...(dto.amount !== undefined && { amount }),
    ...(dto.type !== undefined && { type: dto.type }),
    ...(dto.category_id !== undefined && {
      categoryId: dto.category_id === null ? null : BigInt(dto.category_id),
    }),
    ...(dto.description !== undefined && { description: dto.description }),
    ...(dto.merchant !== undefined && { merchant: dto.merchant }),
    ...(dto.notes !== undefined && { notes: dto.notes }),
    ...(dto.status !== undefined && { status: dto.status }),
    ...(dto.source !== undefined && { source: dto.source }),
    ...(dto.raw_text !== undefined && { rawText: dto.raw_text }),
    ...(dto.captured_at !== undefined && {
      capturedAt: dto.captured_at === null ? null : new Date(dto.captured_at),
    }),
    ...(dto.por_revisar !== undefined && { porRevisar: dto.por_revisar }),
  };
}
