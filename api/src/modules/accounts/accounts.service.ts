import { Injectable } from '@nestjs/common';
import type { Account as AccountRow } from '../../generated/prisma/client';

import { AccountsRepository } from './accounts.repository';
import type { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { calcularCupoDisponible, calcularSaldo } from '../../common/money/balance';
import { serializar, toMoney } from '../../common/money/money';

/** Una cuenta como la entrega el servicio (el dominio). Montos como string decimal. */
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
  /** Derivado de los movimientos. No existe como columna. */
  balance: string;
  /** Incluye los movimientos `pending`. */
  balanceProjected: string;
  /** Solo en tarjetas: `creditLimit − saldo adeudado`. */
  availableCredit: string | null;
  createdAt: Date;
}

@Injectable()
export class AccountsService {
  constructor(private readonly repo: AccountsRepository) {}

  async listar(userId: bigint, incluirArchivadas = false): Promise<Account[]> {
    const [cuentas, agregados] = await Promise.all([
      this.repo.listar(userId, incluirArchivadas),
      this.repo.agregadosDeSaldo(userId),
    ]);

    return cuentas.map((cuenta) =>
      this.presentar(cuenta, agregados.get(cuenta.id.toString()) ?? []),
    );
  }

  async obtener(userId: bigint, id: bigint): Promise<Account> {
    const cuenta = await this.exigirCuenta(userId, id);
    const agregados = await this.repo.agregadosDeSaldo(userId);
    return this.presentar(cuenta, agregados.get(cuenta.id.toString()) ?? []);
  }

  async crear(userId: bigint, dto: CreateAccountDto): Promise<Account> {
    this.validarCoherenciaDeCredito(dto.type, dto);

    const cuenta = await this.repo.crear(userId, {
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

    return this.presentar(cuenta, []);
  }

  async actualizar(userId: bigint, id: bigint, dto: UpdateAccountDto): Promise<Account> {
    const actual = await this.exigirCuenta(userId, id);
    const tipoResultante = dto.type ?? actual.type;
    this.validarCoherenciaDeCredito(tipoResultante, dto);

    await this.repo.actualizar(userId, id, {
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

    return this.obtener(userId, id);
  }

  /**
   * Borrar una cuenta con movimientos destruiría historial financiero, así que
   * está prohibido: se archiva. Solo se permite el borrado físico cuando la
   * cuenta nunca se usó.
   */
  async eliminar(userId: bigint, id: bigint): Promise<void> {
    await this.exigirCuenta(userId, id);

    const movimientos = await this.repo.contarMovimientos(userId, id);
    if (movimientos > 0) {
      throw new ConflictError(
        `Esta cuenta tiene ${movimientos} movimiento(s). Archívala en vez de borrarla para no perder el histórico.`,
        { code: 'account_has_transactions' },
      );
    }

    await this.repo.borrar(userId, id);
  }

  private async exigirCuenta(userId: bigint, id: bigint): Promise<AccountRow> {
    const cuenta = await this.repo.buscarPorId(userId, id);
    // 404 y no 403: confirmar que existe ya sería filtrar información.
    if (!cuenta) throw new NotFoundError('La cuenta no existe.');
    return cuenta;
  }

  /** Los campos de tarjeta solo tienen sentido en cuentas de crédito. */
  private validarCoherenciaDeCredito(
    tipo: AccountRow['type'],
    dto: Pick<UpdateAccountDto, 'credit_limit' | 'cutoff_day' | 'payment_day'>,
  ): void {
    if (tipo === 'credit') return;

    // `unknown`: con @IsOptional el JSON puede traer un null que el tipo no dice.
    const camposDeCredito: readonly (readonly [string, unknown])[] = [
      ['credit_limit', dto.credit_limit],
      ['cutoff_day', dto.cutoff_day],
      ['payment_day', dto.payment_day],
    ];

    const invasores = camposDeCredito
      .filter(([, valor]) => valor !== undefined && valor !== null)
      .map(([nombre]) => nombre);

    if (invasores.length > 0) {
      throw new BadRequestError(
        `${invasores.join(', ')} solo aplica(n) a cuentas de tipo "credit".`,
        { code: 'credit_fields_on_non_credit' },
      );
    }
  }

  private presentar(cuenta: AccountRow, movimientos: Parameters<typeof calcularSaldo>[2]): Account {
    const openingBalance = toMoney(cuenta.openingBalance);
    const saldo = calcularSaldo(cuenta.type, openingBalance, movimientos);
    const creditLimit = cuenta.creditLimit ? toMoney(cuenta.creditLimit) : null;
    const cupo = calcularCupoDisponible(creditLimit, saldo.cleared);

    return {
      id: cuenta.id,
      name: cuenta.name,
      type: cuenta.type,
      currency: cuenta.currency,
      institution: cuenta.institution,
      last4: cuenta.last4,
      creditLimit: creditLimit ? serializar(creditLimit) : null,
      cutoffDay: cuenta.cutoffDay,
      paymentDay: cuenta.paymentDay,
      openingBalance: serializar(openingBalance),
      isArchived: cuenta.isArchived,
      balance: serializar(saldo.cleared),
      balanceProjected: serializar(saldo.proyectado),
      availableCredit: cupo ? serializar(cupo) : null,
      createdAt: cuenta.createdAt,
    };
  }
}
