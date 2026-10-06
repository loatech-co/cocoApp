import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { NewTransaction } from './ledger.types';
import {
  transactionFromRow,
  type Transaction,
  type TransactionHistory,
  type TransactionPage,
  type Transfer,
} from './transactions.domain';
import type {
  SplitRequest,
  TransactionEdit,
  TransactionFilters,
  TransactionRequest,
  TransferRequest,
} from './transactions.inputs';
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
import { ReceiptsService } from '../receipts/receipts.service';
import { TagsService } from '../tags/tags.service';

/** What other modules see of a transaction: they reach the domain through the service. */
export type { Transaction } from './transactions.domain';

/**
 * The first day of the month of a date.
 *
 * It is the default of `period`: most expenses belong to the month they were
 * paid in, and making every record declare it would be friction for the
 * common case. Only the bills that cross months need to say it.
 */
function monthOf(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly repository: TransactionsRepository,
    private readonly tags: TagsService,
    private readonly receipts: ReceiptsService,
  ) {}

  // ── Lectura ────────────────────────────────────────────────────────────────

  async list(userId: bigint, query: TransactionFilters): Promise<TransactionPage> {
    const { page, perPage, skip, take } = parsePagination(query.page, query.perPage);
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
   * From when and until when there is history.
   *
   * It exists so that "Todo" means something. Without it, the range started
   * in 1970 and ended five years in the future: the chart's axis stretched
   * over half an empty century to draw four years of data, and the date button
   * promised a period that never existed.
   *
   * By PERIOD and not by payment date: it is the axis the app is read on.
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

  async create(userId: bigint, dto: TransactionRequest): Promise<Transaction> {
    const draft = await this.prepareCreate(userId, dto);
    const created = await this.repository.createWithDetails(draft.data, draft.splits, draft.tagIds);
    return transactionFromRow(created);
  }

  /**
   * Validates a new movement and builds what gets written, without writing.
   * The capture uses it to write under its own lock (`LedgerService`).
   */
  async prepareCreate(userId: bigint, dto: TransactionRequest): Promise<NewTransaction> {
    // Without an account is a valid case, not an error: tracking them is optional.
    const accountId = dto.accountId !== undefined ? BigInt(dto.accountId) : null;
    const categoryId = dto.categoryId !== undefined ? BigInt(dto.categoryId) : null;
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
        externalRef: dto.externalRef ?? null,
        status: dto.status ?? 'cleared',
        source: dto.source ?? 'web',
        rawText: dto.rawText ?? null,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : null,
        needsReview: dto.needsReview ?? false,
      },
      splits,
      tagIds,
    };
  }

  /**
   * A transfer is TWO rows paired by `transfer_group_id`, not a transaction
   * with two accounts. They are created in the same database transaction: a
   * leg must never exist without its counterpart, because then the money
   * would "evaporate" from one side without showing up on the other.
   *
   * It counts as neither expense nor income: it only moves balance between
   * the user's own pockets.
   */
  async createTransfer(userId: bigint, dto: TransferRequest): Promise<Transfer> {
    const fromAccountId = BigInt(dto.fromAccountId);
    const toAccountId = BigInt(dto.toAccountId);

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

  async update(userId: bigint, id: bigint, dto: TransactionEdit): Promise<Transaction> {
    const actual = await this.requireTransaction(userId, id);

    const accountId = dto.accountId !== undefined ? BigInt(dto.accountId) : actual.accountId;
    if (accountId !== null && dto.accountId !== undefined) {
      await this.requireOwnAccount(userId, accountId);
    }

    if (dto.categoryId !== undefined && dto.categoryId !== null) {
      await this.requireOwnCategory(userId, BigInt(dto.categoryId));
    }

    const amount = dto.amount !== undefined ? toMoney(dto.amount) : toMoney(actual.amount);

    // If new splits come, they are checked against the resulting amount; if
    // they do not and the amount changes, the existing splits have to reconcile.
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
   * Deleting a transfer leg takes the other one: leaving one alone would
   * break the net worth, because the money would leave one account without
   * entering any.
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
   * Editing a transfer leg edits both (like deleting): a different amount on
   * each leg breaks the balances of both accounts.
   */
  private async partnerLeg(
    userId: bigint,
    actual: FullTransaction,
    dto: TransactionEdit,
    changes: TransactionChanges,
  ): Promise<TransferPartner | null> {
    if (actual.transferGroupId === null) return null;
    requireStillTransfer(dto);
    if (dto.accountId !== undefined) {
      const partnerAccount = await this.repository.partnerAccount(
        userId,
        actual.transferGroupId,
        actual.id,
      );
      if (partnerAccount !== null && partnerAccount === BigInt(dto.accountId)) {
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
   * Checks the splits reconcile and requires each category to be the user's
   * (422): without it a split hung one's own transaction from someone else's
   * concept.
   */
  private async prepareSplits(
    userId: bigint,
    headerAmount: Money,
    splits: readonly SplitRequest[] | undefined,
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

  /** Without this check a transaction could be tied to someone else's account. */
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
