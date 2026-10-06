import { Injectable } from '@nestjs/common';

import { AccountsRepository } from './accounts.repository';
import type { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { computeAvailableCredit, computeBalance } from '../../common/money/balance';
import { serialize, toMoney } from '../../common/money/money';
import type { Account as AccountRow } from '../../generated/prisma/client';

/** An account as the service hands it out (the domain). Amounts as decimal strings. */
export interface Account {
  id: bigint;
  name: string;
  type: AccountRow['type'];
  /** ISO 4217. */
  currency: string;
  institution: string | null;
  last4: string | null;
  creditLimit: string | null;
  cutoffDay: number | null;
  paymentDay: number | null;
  openingBalance: string;
  isArchived: boolean;
  /** Derived from the transactions. It does not exist as a column. */
  balance: string;
  /** Includes the `pending` transactions. */
  balanceProjected: string;
  /** Cards only: `creditLimit − balance owed`. */
  availableCredit: string | null;
  createdAt: Date;
}

@Injectable()
export class AccountsService {
  constructor(private readonly repo: AccountsRepository) {}

  async list(userId: bigint, shouldIncludeArchived = false): Promise<Account[]> {
    const [rows, movementsByAccount] = await Promise.all([
      this.repo.list(userId, shouldIncludeArchived),
      this.repo.balanceMovements(userId),
    ]);

    return rows.map((account) =>
      this.present(account, movementsByAccount.get(account.id.toString()) ?? []),
    );
  }

  async get(userId: bigint, id: bigint): Promise<Account> {
    const account = await this.requireAccount(userId, id);
    const movementsByAccount = await this.repo.balanceMovements(userId);
    return this.present(account, movementsByAccount.get(account.id.toString()) ?? []);
  }

  async create(userId: bigint, dto: CreateAccountDto): Promise<Account> {
    this.checkCreditFields(dto.type, dto);

    const account = await this.repo.create(userId, {
      userId,
      name: dto.name,
      type: dto.type,
      institution: dto.institution ?? null,
      last4: dto.last4 ?? null,
      creditLimit: dto.credit_limit ? toMoney(dto.credit_limit) : null,
      cutoffDay: dto.cutoff_day ?? null,
      paymentDay: dto.payment_day ?? null,
      openingBalance: toMoney(dto.opening_balance ?? 0),
    });

    return this.present(account, []);
  }

  async update(userId: bigint, id: bigint, dto: UpdateAccountDto): Promise<Account> {
    const actual = await this.requireAccount(userId, id);
    const resultingType = dto.type ?? actual.type;
    this.checkCreditFields(resultingType, dto);

    await this.repo.update(userId, id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.institution !== undefined && { institution: dto.institution }),
      ...(dto.last4 !== undefined && { last4: dto.last4 }),
      ...(dto.credit_limit !== undefined && { creditLimit: toMoney(dto.credit_limit) }),
      ...(dto.cutoff_day !== undefined && { cutoffDay: dto.cutoff_day }),
      ...(dto.payment_day !== undefined && { paymentDay: dto.payment_day }),
      ...(dto.opening_balance !== undefined && {
        openingBalance: toMoney(dto.opening_balance),
      }),
      ...(dto.is_archived !== undefined && { isArchived: dto.is_archived }),
    });

    return this.get(userId, id);
  }

  /**
   * Deleting an account with transactions would destroy financial history, so
   * it is not allowed: it is archived. A physical delete is only allowed when
   * the account was never used.
   */
  async remove(userId: bigint, id: bigint): Promise<void> {
    await this.requireAccount(userId, id);

    const transactionCount = await this.repo.countTransactions(userId, id);
    if (transactionCount > 0) {
      throw new ConflictError(
        `Esta cuenta tiene ${transactionCount} movimiento(s). Archívala en vez de borrarla para no perder el histórico.`,
        { code: 'account_has_transactions' },
      );
    }

    await this.repo.delete(userId, id);
  }

  private async requireAccount(userId: bigint, id: bigint): Promise<AccountRow> {
    const account = await this.repo.findById(userId, id);
    // 404 and not 403: confirming it exists would already leak information.
    if (!account) throw new NotFoundError('La cuenta no existe.');
    return account;
  }

  /** Card fields only make sense on credit accounts. */
  private checkCreditFields(
    type: AccountRow['type'],
    dto: Pick<UpdateAccountDto, 'credit_limit' | 'cutoff_day' | 'payment_day'>,
  ): void {
    if (type === 'credit') return;

    // `unknown`: with @IsOptional the JSON can carry a null the type does not mention.
    const creditFields: readonly (readonly [string, unknown])[] = [
      ['credit_limit', dto.credit_limit],
      ['cutoff_day', dto.cutoff_day],
      ['payment_day', dto.payment_day],
    ];

    const offending = creditFields
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([name]) => name);

    if (offending.length > 0) {
      throw new BadRequestError(
        `${offending.join(', ')} solo aplica(n) a cuentas de tipo "credit".`,
        { code: 'credit_fields_on_non_credit' },
      );
    }
  }

  private present(account: AccountRow, movements: Parameters<typeof computeBalance>[2]): Account {
    const openingBalance = toMoney(account.openingBalance);
    const balance = computeBalance(account.type, openingBalance, movements);
    const creditLimit = account.creditLimit ? toMoney(account.creditLimit) : null;
    const availableCredit = computeAvailableCredit(creditLimit, balance.cleared);

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      institution: account.institution,
      last4: account.last4,
      creditLimit: creditLimit ? serialize(creditLimit) : null,
      cutoffDay: account.cutoffDay,
      paymentDay: account.paymentDay,
      openingBalance: serialize(openingBalance),
      isArchived: account.isArchived,
      balance: serialize(balance.cleared),
      balanceProjected: serialize(balance.projected),
      availableCredit: availableCredit ? serialize(availableCredit) : null,
      createdAt: account.createdAt,
    };
  }
}
