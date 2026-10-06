import { Injectable } from '@nestjs/common';
import type { TransactionType } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import type {
  CreateTransactionDto,
  CreateTransferDto,
  ListTransactionsQueryDto,
  SplitDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
import type { NewTransaction } from './ledger.types';
import {
  transactionFromRow,
  type Transaction,
  type TransactionHistory,
  type TransactionPage,
  type Transfer,
} from './transactions.domain';
import {
  TransactionsRepository,
  type SplitToWrite,
  type TransaccionCompleta,
  type TransactionChanges,
  type TransferPartner,
} from './transactions.repository';
import { parsePaginacion } from './transactions.sort';
import { splitsParaEscribir } from './transactions.splits';
import {
  cambiosDe,
  cambiosDeLaOtraPata,
  exigirDesgloseCuadrado,
  exigirQueSigaSiendoTransferencia,
} from './transactions.update';
import { NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { serializar, toMoney, type Money } from '../../common/money/money';
import { SoportesService } from '../soportes/soportes.service';
import { TagsService } from '../tags/tags.service';

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

  async listar(userId: bigint, query: ListTransactionsQueryDto): Promise<TransactionPage> {
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
      data: filas.map(transactionFromRow),
      meta: { page, perPage, total, sumExpense: sumaDe('expense'), sumIncome: sumaDe('income') },
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
  async historia(userId: bigint): Promise<TransactionHistory> {
    const { first, last } = await this.repository.periodRange(userId);
    const iso = (fecha: Date | null): string | null => fecha?.toISOString().slice(0, 10) ?? null;
    return { first: iso(first), last: iso(last) };
  }

  async obtener(userId: bigint, id: bigint): Promise<Transaction> {
    return transactionFromRow(await this.exigirMovimiento(userId, id));
  }

  // ── Escritura ──────────────────────────────────────────────────────────────

  async crear(userId: bigint, dto: CreateTransactionDto): Promise<Transaction> {
    const nuevo = await this.prepararAlta(userId, dto);
    const creada = await this.repository.createWithDetails(nuevo.data, nuevo.splits, nuevo.tagIds);
    return transactionFromRow(creada);
  }

  /**
   * Validates a new movement and builds what gets written, without writing.
   * The capture uses it to write under its own lock (`LedgerService`).
   */
  async prepararAlta(userId: bigint, dto: CreateTransactionDto): Promise<NewTransaction> {
    // Sin cuenta es un caso válido, no un error: llevarlas es opcional.
    const accountId = dto.account_id !== undefined ? BigInt(dto.account_id) : null;
    const categoryId = dto.category_id !== undefined ? BigInt(dto.category_id) : null;
    const amount = toMoney(dto.amount);
    const tipo = dto.type ?? 'expense';

    if (accountId !== null) await this.exigirCuentaPropia(userId, accountId);
    if (categoryId !== null) await this.exigirCategoriaPropia(userId, categoryId);

    const splits = await this.prepararSplits(userId, amount, dto.splits);
    const tagIds = dto.tags?.length ? await this.tags.resolverNombres(userId, dto.tags) : [];

    return {
      data: {
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
    };
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
  async crearTransferencia(userId: bigint, dto: CreateTransferDto): Promise<Transfer> {
    const origen = BigInt(dto.from_account_id);
    const destino = BigInt(dto.to_account_id);

    if (origen === destino) {
      throw new ValidationError('La cuenta de origen y la de destino no pueden ser la misma.', {
        code: 'transfer_same_account',
      });
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

    return { transferGroupId: grupo, legs: patas.map(transactionFromRow) };
  }

  async actualizar(userId: bigint, id: bigint, dto: UpdateTransactionDto): Promise<Transaction> {
    const actual = await this.exigirMovimiento(userId, id);

    const accountId = dto.account_id !== undefined ? BigInt(dto.account_id) : actual.accountId;
    if (accountId !== null && dto.account_id !== undefined) {
      await this.exigirCuentaPropia(userId, accountId);
    }

    if (dto.category_id !== undefined && dto.category_id !== null) {
      await this.exigirCategoriaPropia(userId, BigInt(dto.category_id));
    }

    const amount = dto.amount !== undefined ? toMoney(dto.amount) : toMoney(actual.amount);

    // Si llegan splits nuevos, se revalida el cuadre contra el monto resultante;
    // si no llegan y el monto cambia, el desglose que ya hay tiene que cuadrar.
    exigirDesgloseCuadrado(actual, dto, amount);
    const splits =
      dto.splits !== undefined ? await this.prepararSplits(userId, amount, dto.splits) : null;
    const tagIds =
      dto.tags !== undefined ? await this.tags.resolverNombres(userId, dto.tags) : null;

    const cambios = cambiosDe(dto, accountId, amount);
    const otra = await this.otraPata(userId, actual, dto, cambios);
    const actualizada = await this.repository.updateWithDetails(id, cambios, splits, tagIds, otra);

    return transactionFromRow(actualizada);
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
   * Editar una pata de transferencia edita las dos (como borrar): un monto
   * distinto en cada pata descuadra los saldos de las dos cuentas.
   */
  private async otraPata(
    userId: bigint,
    actual: TransaccionCompleta,
    dto: UpdateTransactionDto,
    cambios: TransactionChanges,
  ): Promise<TransferPartner | null> {
    if (actual.transferGroupId === null) return null;
    exigirQueSigaSiendoTransferencia(dto);
    if (dto.account_id !== undefined) {
      const suya = await this.repository.partnerAccount(userId, actual.transferGroupId, actual.id);
      if (suya !== null && suya === BigInt(dto.account_id)) {
        throw new ValidationError('La cuenta de origen y la de destino no pueden ser la misma.', {
          code: 'transfer_same_account',
        });
      }
    }
    return {
      userId,
      transferGroupId: actual.transferGroupId,
      changes: cambiosDeLaOtraPata(cambios),
    };
  }

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
      throw new ValidationError('La categoría indicada no existe o no es tuya.', {
        code: 'category_not_owned',
      });
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
      throw new ValidationError('La cuenta indicada no existe o no es tuya.', {
        code: 'account_not_owned',
      });
    }
  }

  private async exigirCategoriaPropia(userId: bigint, categoryId: bigint): Promise<void> {
    if (!(await this.repository.categoryBelongsTo(userId, categoryId))) {
      throw new ValidationError('La categoría indicada no existe o no es tuya.', {
        code: 'category_not_owned',
      });
    }
  }
}
