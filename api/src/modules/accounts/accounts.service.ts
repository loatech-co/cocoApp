import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Account } from '@prisma/client';

import { calcularCupoDisponible, calcularSaldo } from '../../common/money/balance';
import { serializar, toMoney } from '../../common/money/money';
import { AccountsRepository } from './accounts.repository';
import type { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

/** Forma con la que una cuenta sale por la API. Montos como string decimal. */
export interface AccountView {
  id: bigint;
  name: string;
  type: Account['type'];
  currency: string;
  institution: string | null;
  last4: string | null;
  credit_limit: string | null;
  cutoff_day: number | null;
  payment_day: number | null;
  opening_balance: string;
  is_archived: boolean;
  /** Derivado de los movimientos. No existe como columna. */
  balance: string;
  /** Incluye los movimientos `pending`. */
  balance_projected: string;
  /** Solo en tarjetas: `credit_limit − saldo adeudado`. */
  available_credit: string | null;
  created_at: Date;
}

@Injectable()
export class AccountsService {
  constructor(private readonly repo: AccountsRepository) {}

  async listar(userId: bigint, incluirArchivadas = false): Promise<AccountView[]> {
    const [cuentas, agregados] = await Promise.all([
      this.repo.listar(userId, incluirArchivadas),
      this.repo.agregadosDeSaldo(userId),
    ]);

    return cuentas.map((cuenta) =>
      this.presentar(cuenta, agregados.get(cuenta.id.toString()) ?? []),
    );
  }

  async obtener(userId: bigint, id: bigint): Promise<AccountView> {
    const cuenta = await this.exigirCuenta(userId, id);
    const agregados = await this.repo.agregadosDeSaldo(userId);
    return this.presentar(cuenta, agregados.get(cuenta.id.toString()) ?? []);
  }

  async crear(userId: bigint, dto: CreateAccountDto): Promise<AccountView> {
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

  async actualizar(userId: bigint, id: bigint, dto: UpdateAccountDto): Promise<AccountView> {
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
      throw new ConflictException(
        `Esta cuenta tiene ${movimientos} movimiento(s). Archívala en vez de borrarla para no perder el histórico.`,
      );
    }

    await this.repo.borrar(userId, id);
  }

  private async exigirCuenta(userId: bigint, id: bigint): Promise<Account> {
    const cuenta = await this.repo.buscarPorId(userId, id);
    // 404 y no 403: confirmar que existe ya sería filtrar información.
    if (!cuenta) throw new NotFoundException('La cuenta no existe.');
    return cuenta;
  }

  /** Los campos de tarjeta solo tienen sentido en cuentas de crédito. */
  private validarCoherenciaDeCredito(
    tipo: Account['type'],
    dto: Pick<UpdateAccountDto, 'credit_limit' | 'cutoff_day' | 'payment_day'>,
  ): void {
    if (tipo === 'credit') return;

    const camposDeCredito = [
      ['credit_limit', dto.credit_limit],
      ['cutoff_day', dto.cutoff_day],
      ['payment_day', dto.payment_day],
    ] as const;

    const invasores = camposDeCredito
      .filter(([, valor]) => valor !== undefined && valor !== null)
      .map(([nombre]) => nombre);

    if (invasores.length > 0) {
      throw new BadRequestException(
        `${invasores.join(', ')} solo aplica(n) a cuentas de tipo "credit".`,
      );
    }
  }

  private presentar(
    cuenta: Account,
    movimientos: Parameters<typeof calcularSaldo>[2],
  ): AccountView {
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
      credit_limit: creditLimit ? serializar(creditLimit) : null,
      cutoff_day: cuenta.cutoffDay,
      payment_day: cuenta.paymentDay,
      opening_balance: serializar(openingBalance),
      is_archived: cuenta.isArchived,
      balance: serializar(saldo.cleared),
      balance_projected: serializar(saldo.proyectado),
      available_credit: cupo ? serializar(cupo) : null,
      created_at: cuenta.createdAt,
    };
  }
}
