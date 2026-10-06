import { Injectable } from '@nestjs/common';
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
  type FullTransaction,
  type TransactionChanges,
  type TransferPartner,
} from './transactions.repository';
import { parsePagination } from './transactions.sort';
import { splitsToWrite } from './transactions.splits';
import {
  changesOf,
  partnerLegChanges,
  requireReconciledSplits,
  requireStillTransfer,
} from './transactions.update';
import { NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { serialize, toMoney, type Money } from '../../common/money/money';
import type { TransactionType } from '../../generated/prisma/client';
import { SoportesService } from '../soportes/soportes.service';
import { TagsService } from '../tags/tags.service';

/** What other modules see of a transaction: they reach the domain through the service. */
export type { Transaction } from './transactions.domain';

/**
 * El primer día del mes de una fecha.
 *
 * Es el valor por defecto de `period`: la mayoría de los gastos pertenecen al
 * mes en que se pagaron, y obligar a declararlo en cada registro sería fricción
 * para el caso común. Solo las facturas que cruzan de mes necesitan decirlo.
 */
function monthOf(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly repository: TransactionsRepository,
    private readonly tags: TagsService,
    private readonly receipts: SoportesService,
  ) {}

  // ── Lectura ────────────────────────────────────────────────────────────────

  async list(userId: bigint, query: ListTransactionsQueryDto): Promise<TransactionPage> {
    const { page, perPage, skip, take } = parsePagination(query.page, query.per_page);
    const { rows, total, sumOf } = await this.repository.findPage(userId, query, {
      skip,
      take,
    });
    const totalOf = (type: TransactionType): string => serialize(sumOf(type));

    return {
      data: rows.map(transactionFromRow),
      meta: { page, perPage, total, sumExpense: totalOf('expense'), sumIncome: totalOf('income') },
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
  async history(userId: bigint): Promise<TransactionHistory> {
    const { first, last } = await this.repository.periodRange(userId);
    const iso = (date: Date | null): string | null => date?.toISOString().slice(0, 10) ?? null;
    return { first: iso(first), last: iso(last) };
  }

  async get(userId: bigint, id: bigint): Promise<Transaction> {
    return transactionFromRow(await this.requireTransaction(userId, id));
  }

  // ── Escritura ──────────────────────────────────────────────────────────────

  async create(userId: bigint, dto: CreateTransactionDto): Promise<Transaction> {
    const draft = await this.prepareCreate(userId, dto);
    const created = await this.repository.createWithDetails(draft.data, draft.splits, draft.tagIds);
    return transactionFromRow(created);
  }

  /**
   * Validates a new movement and builds what gets written, without writing.
   * The capture uses it to write under its own lock (`LedgerService`).
   */
  async prepareCreate(userId: bigint, dto: CreateTransactionDto): Promise<NewTransaction> {
    // Sin cuenta es un caso válido, no un error: llevarlas es opcional.
    const accountId = dto.account_id !== undefined ? BigInt(dto.account_id) : null;
    const categoryId = dto.category_id !== undefined ? BigInt(dto.category_id) : null;
    const amount = toMoney(dto.amount);
    const type = dto.type ?? 'expense';

    if (accountId !== null) await this.requireOwnAccount(userId, accountId);
    if (categoryId !== null) await this.requireOwnCategory(userId, categoryId);

    const splits = await this.prepareSplits(userId, amount, dto.splits);
    const tagIds = dto.tags?.length ? await this.tags.resolveNames(userId, dto.tags) : [];

    return {
      data: {
        userId,
        accountId,
        date: new Date(dto.date),
        period: dto.period ? new Date(dto.period) : monthOf(new Date(dto.date)),
        amount,
        type,
        categoryId,
        description: dto.description ?? null,
        merchant: dto.merchant ?? null,
        notes: dto.notes ?? null,
        externalRef: dto.external_ref ?? null,
        status: dto.status ?? 'cleared',
        source: dto.source ?? 'web',
        rawText: dto.raw_text ?? null,
        capturedAt: dto.captured_at ? new Date(dto.captured_at) : null,
        needsReview: dto.por_revisar ?? false,
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
  async createTransfer(userId: bigint, dto: CreateTransferDto): Promise<Transfer> {
    const fromAccountId = BigInt(dto.from_account_id);
    const toAccountId = BigInt(dto.to_account_id);

    if (fromAccountId === toAccountId) {
      throw new ValidationError('La cuenta de origen y la de destino no pueden ser la misma.', {
        code: 'transfer_same_account',
      });
    }

    await Promise.all([
      this.requireOwnAccount(userId, fromAccountId),
      this.requireOwnAccount(userId, toAccountId),
    ]);

    const amount = toMoney(dto.amount);
    const groupId = randomUUID();
    const date = new Date(dto.date);

    const base = {
      userId,
      date,
      period: dto.period ? new Date(dto.period) : monthOf(date),
      amount,
      type: 'transfer' as const,
      description: dto.description ?? null,
      transferGroupId: groupId,
      status: 'cleared' as const,
    };

    const legs = await this.repository.createTransfer(base, fromAccountId, toAccountId);

    return { transferGroupId: groupId, legs: legs.map(transactionFromRow) };
  }

  async update(userId: bigint, id: bigint, dto: UpdateTransactionDto): Promise<Transaction> {
    const actual = await this.requireTransaction(userId, id);

    const accountId = dto.account_id !== undefined ? BigInt(dto.account_id) : actual.accountId;
    if (accountId !== null && dto.account_id !== undefined) {
      await this.requireOwnAccount(userId, accountId);
    }

    if (dto.category_id !== undefined && dto.category_id !== null) {
      await this.requireOwnCategory(userId, BigInt(dto.category_id));
    }

    const amount = dto.amount !== undefined ? toMoney(dto.amount) : toMoney(actual.amount);

    // Si llegan splits nuevos, se revalida el cuadre contra el monto resultante;
    // si no llegan y el monto cambia, el desglose que ya hay tiene que cuadrar.
    requireReconciledSplits(actual, dto, amount);
    const splits =
      dto.splits !== undefined ? await this.prepareSplits(userId, amount, dto.splits) : null;
    const tagIds = dto.tags !== undefined ? await this.tags.resolveNames(userId, dto.tags) : null;

    const changes = changesOf(dto, accountId, amount);
    const partner = await this.partnerLeg(userId, actual, dto, changes);
    const updated = await this.repository.updateWithDetails(
      userId,
      id,
      changes,
      splits,
      tagIds,
      partner,
    );

    return transactionFromRow(updated);
  }

  /**
   * Borrar una pata de transferencia se lleva la otra: dejar una suelta
   * descuadraría el patrimonio, porque el dinero saldría de una cuenta sin
   * entrar a ninguna.
   */
  async remove(userId: bigint, id: bigint): Promise<void> {
    const transaction = await this.requireTransaction(userId, id);

    // The receipt rows cascade with the movement; their files do not. Their
    // keys are read first and the files go after the rows (phase 6.9).
    if (transaction.transferGroupId) {
      const keys = await this.receipts.keysOf(userId, {
        transferGroupId: transaction.transferGroupId,
      });
      await this.repository.deleteTransferGroup(userId, transaction.transferGroupId);
      await this.receipts.removeFiles(keys);
      return;
    }

    const keys = await this.receipts.keysOf(userId, { transactionId: id });
    await this.repository.deleteOne(userId, id);
    await this.receipts.removeFiles(keys);
  }

  // ── Apoyo ──────────────────────────────────────────────────────────────────

  /**
   * Editar una pata de transferencia edita las dos (como borrar): un monto
   * distinto en cada pata descuadra los saldos de las dos cuentas.
   */
  private async partnerLeg(
    userId: bigint,
    actual: FullTransaction,
    dto: UpdateTransactionDto,
    changes: TransactionChanges,
  ): Promise<TransferPartner | null> {
    if (actual.transferGroupId === null) return null;
    requireStillTransfer(dto);
    if (dto.account_id !== undefined) {
      const partnerAccount = await this.repository.partnerAccount(
        userId,
        actual.transferGroupId,
        actual.id,
      );
      if (partnerAccount !== null && partnerAccount === BigInt(dto.account_id)) {
        throw new ValidationError('La cuenta de origen y la de destino no pueden ser la misma.', {
          code: 'transfer_same_account',
        });
      }
    }
    return {
      userId,
      transferGroupId: actual.transferGroupId,
      changes: partnerLegChanges(changes),
    };
  }

  /**
   * Valida el cuadre y exige que cada categoría sea del usuario (422): sin eso
   * un split colgaba un movimiento propio de un concepto ajeno.
   */
  private async prepareSplits(
    userId: bigint,
    headerAmount: Money,
    splits: readonly SplitDto[] | undefined,
  ): Promise<SplitToWrite[]> {
    const listos = splitsToWrite(headerAmount, splits);
    const ids = listos.flatMap((split) => (split.categoryId !== null ? [split.categoryId] : []));
    if (!(await this.repository.categoriesBelongTo(userId, ids))) {
      throw new ValidationError('La categoría indicada no existe o no es tuya.', {
        code: 'category_not_owned',
      });
    }
    return listos;
  }

  private async requireTransaction(userId: bigint, id: bigint): Promise<FullTransaction> {
    const transaction = await this.repository.findOwned(userId, id);
    if (!transaction) throw new NotFoundError('El movimiento no existe.');
    return transaction;
  }

  /** Sin esta verificación se podría asociar un movimiento a la cuenta de otro. */
  private async requireOwnAccount(userId: bigint, accountId: bigint): Promise<void> {
    if (!(await this.repository.accountBelongsTo(userId, accountId))) {
      throw new ValidationError('La cuenta indicada no existe o no es tuya.', {
        code: 'account_not_owned',
      });
    }
  }

  private async requireOwnCategory(userId: bigint, categoryId: bigint): Promise<void> {
    if (!(await this.repository.categoryBelongsTo(userId, categoryId))) {
      throw new ValidationError('La categoría indicada no existe o no es tuya.', {
        code: 'category_not_owned',
      });
    }
  }
}
