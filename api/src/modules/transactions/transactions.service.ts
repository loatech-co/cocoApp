import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type Transaction, type TransactionType } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { serializar, toMoney, type Money } from '../../common/money/money';
import { verificarCuadreDeSplits } from '../../common/money/splits';
import { PrismaService } from '../../prisma/prisma.service';
import { TagsService } from '../tags/tags.module';
import type {
  CreateTransactionDto,
  CreateTransferDto,
  ListTransactionsQueryDto,
  SplitDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
import { parseOrden, parsePaginacion } from './transactions.sort';

export interface SplitView {
  id: bigint;
  category_id: bigint | null;
  amount: string;
  note: string | null;
}

export interface TransactionView {
  id: bigint;
  uuid: string;
  account_id: bigint;
  date: string;
  amount: string;
  type: TransactionType;
  category_id: bigint | null;
  description: string | null;
  merchant: string | null;
  notes: string | null;
  transfer_group_id: string | null;
  transfer_direction: 'out' | 'in' | null;
  external_ref: string | null;
  status: Transaction['status'];
  tags: string[];
  splits: SplitView[];
  created_at: Date;
}

/** Lo que Prisma devuelve cuando se incluyen splits y etiquetas. */
type TransaccionCompleta = Prisma.TransactionGetPayload<{
  include: { splits: true; tags: { include: { tag: true } } };
}>;

const INCLUIR_TODO = {
  splits: true,
  tags: { include: { tag: true } },
} as const;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tags: TagsService,
  ) {}

  // ── Lectura ────────────────────────────────────────────────────────────────

  async listar(
    userId: bigint,
    query: ListTransactionsQueryDto,
  ): Promise<{ data: TransactionView[]; meta: { page: number; per_page: number; total: number } }> {
    const where = this.construirFiltro(userId, query);
    const { page, perPage, skip, take } = parsePaginacion(query.page, query.per_page);

    const [filas, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: INCLUIR_TODO,
        orderBy: parseOrden(query.sort),
        skip,
        take,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: filas.map((fila) => this.presentar(fila)),
      meta: { page, per_page: perPage, total },
    };
  }

  async obtener(userId: bigint, id: bigint): Promise<TransactionView> {
    return this.presentar(await this.exigirMovimiento(userId, id));
  }

  // ── Escritura ──────────────────────────────────────────────────────────────

  async crear(userId: bigint, dto: CreateTransactionDto): Promise<TransactionView> {
    const accountId = BigInt(dto.account_id);
    const categoryId = dto.category_id !== undefined ? BigInt(dto.category_id) : null;
    const amount = toMoney(dto.amount);
    const tipo = dto.type ?? 'expense';

    await this.exigirCuentaPropia(userId, accountId);
    if (categoryId !== null) await this.exigirCategoriaPropia(userId, categoryId);

    const splits = this.prepararSplits(amount, dto.splits);
    const tagIds = dto.tags?.length ? await this.tags.resolverNombres(userId, dto.tags) : [];

    // Todo dentro de una sola transacción: si los splits no cuadran o algo
    // falla a medio camino, no queda un movimiento huérfano sin su desglose.
    const creada = await this.prisma.$transaction(async (tx) => {
      const movimiento = await tx.transaction.create({
        data: {
          userId,
          accountId,
          date: new Date(dto.date),
          amount,
          type: tipo,
          categoryId,
          description: dto.description ?? null,
          merchant: dto.merchant ?? null,
          notes: dto.notes ?? null,
          externalRef: dto.external_ref ?? null,
          status: dto.status ?? 'cleared',
        },
      });

      if (splits.length > 0) {
        await tx.transactionSplit.createMany({
          data: splits.map((split) => ({
            transactionId: movimiento.id,
            categoryId: split.categoryId,
            amount: split.amount,
            note: split.note,
          })),
        });
      }

      if (tagIds.length > 0) {
        await tx.transactionTag.createMany({
          data: tagIds.map((tagId) => ({ transactionId: movimiento.id, tagId })),
        });
      }

      return tx.transaction.findUniqueOrThrow({
        where: { id: movimiento.id },
        include: INCLUIR_TODO,
      });
    });

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
      throw new UnprocessableEntityException(
        'La cuenta de origen y la de destino no pueden ser la misma.',
      );
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
      amount,
      type: 'transfer' as const,
      description: dto.description ?? null,
      transferGroupId: grupo,
      status: 'cleared' as const,
    };

    const patas = await this.prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: { ...base, accountId: origen, transferDir: 'out' },
      });
      await tx.transaction.create({
        data: { ...base, accountId: destino, transferDir: 'in' },
      });

      return tx.transaction.findMany({
        where: { userId, transferGroupId: grupo },
        include: INCLUIR_TODO,
        orderBy: { transferDir: 'asc' },
      });
    });

    return { transfer_group_id: grupo, legs: patas.map((pata) => this.presentar(pata)) };
  }

  async actualizar(
    userId: bigint,
    id: bigint,
    dto: UpdateTransactionDto,
  ): Promise<TransactionView> {
    const actual = await this.exigirMovimiento(userId, id);

    const accountId = dto.account_id !== undefined ? BigInt(dto.account_id) : actual.accountId;
    if (dto.account_id !== undefined) await this.exigirCuentaPropia(userId, accountId);

    if (dto.category_id !== undefined && dto.category_id !== null) {
      await this.exigirCategoriaPropia(userId, BigInt(dto.category_id));
    }

    const amount = dto.amount !== undefined ? toMoney(dto.amount) : toMoney(actual.amount);

    // Si llegan splits nuevos, se revalida el cuadre contra el monto resultante.
    const splits = dto.splits !== undefined ? this.prepararSplits(amount, dto.splits) : null;
    const tagIds = dto.tags !== undefined ? await this.tags.resolverNombres(userId, dto.tags) : null;

    const actualizada = await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id },
        data: {
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
        },
      });

      if (splits !== null) {
        await tx.transactionSplit.deleteMany({ where: { transactionId: id } });
        if (splits.length > 0) {
          await tx.transactionSplit.createMany({
            data: splits.map((split) => ({
              transactionId: id,
              categoryId: split.categoryId,
              amount: split.amount,
              note: split.note,
            })),
          });
        }
      }

      if (tagIds !== null) {
        await tx.transactionTag.deleteMany({ where: { transactionId: id } });
        if (tagIds.length > 0) {
          await tx.transactionTag.createMany({
            data: tagIds.map((tagId) => ({ transactionId: id, tagId })),
          });
        }
      }

      return tx.transaction.findUniqueOrThrow({ where: { id }, include: INCLUIR_TODO });
    });

    return this.presentar(actualizada);
  }

  /**
   * Borrar una pata de transferencia se lleva la otra: dejar una suelta
   * descuadraría el patrimonio, porque el dinero saldría de una cuenta sin
   * entrar a ninguna.
   */
  async eliminar(userId: bigint, id: bigint): Promise<void> {
    const movimiento = await this.exigirMovimiento(userId, id);

    if (movimiento.transferGroupId) {
      await this.prisma.transaction.deleteMany({
        where: { userId, transferGroupId: movimiento.transferGroupId },
      });
      return;
    }

    await this.prisma.transaction.deleteMany({ where: { id, userId } });
  }

  // ── Apoyo ──────────────────────────────────────────────────────────────────

  private construirFiltro(
    userId: bigint,
    query: ListTransactionsQueryDto,
  ): Prisma.TransactionWhereInput {
    const where: Prisma.TransactionWhereInput = { userId };

    if (query.from || query.to) {
      where.date = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      };
    }

    if (query.account_id !== undefined) where.accountId = BigInt(query.account_id);
    if (query.category_id !== undefined) where.categoryId = BigInt(query.category_id);
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.tag_id !== undefined) where.tags = { some: { tagId: BigInt(query.tag_id) } };

    if (query.min_amount || query.max_amount) {
      where.amount = {
        ...(query.min_amount && { gte: toMoney(query.min_amount) }),
        ...(query.max_amount && { lte: toMoney(query.max_amount) }),
      };
    }

    if (query.q) {
      where.OR = [
        { description: { contains: query.q } },
        { merchant: { contains: query.q } },
        { notes: { contains: query.q } },
      ];
    }

    return where;
  }

  /** Valida el cuadre y normaliza los splits. Lanza 422 si no cuadran. */
  private prepararSplits(
    amountCabecera: Money,
    splits: readonly SplitDto[] | undefined,
  ): { categoryId: bigint | null; amount: Money; note: string | null }[] {
    if (!splits || splits.length === 0) return [];

    const montos = splits.map((split) => toMoney(split.amount));
    const cuadre = verificarCuadreDeSplits(amountCabecera, montos);

    if (!cuadre.cuadra) {
      throw new UnprocessableEntityException(
        `La suma de los splits (${serializar(cuadre.suma)}) no coincide con el monto (${serializar(amountCabecera)}). Diferencia: ${serializar(cuadre.diferencia)}.`,
      );
    }

    return splits.map((split, indice) => ({
      categoryId: split.category_id !== undefined ? BigInt(split.category_id) : null,
      amount: montos[indice]!,
      note: split.note ?? null,
    }));
  }

  private async exigirMovimiento(userId: bigint, id: bigint): Promise<TransaccionCompleta> {
    const movimiento = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: INCLUIR_TODO,
    });
    if (!movimiento) throw new NotFoundException('El movimiento no existe.');
    return movimiento;
  }

  /** Sin esta verificación se podría asociar un movimiento a la cuenta de otro. */
  private async exigirCuentaPropia(userId: bigint, accountId: bigint): Promise<void> {
    const existe = await this.prisma.account.count({ where: { id: accountId, userId } });
    if (existe === 0) {
      throw new UnprocessableEntityException('La cuenta indicada no existe o no es tuya.');
    }
  }

  private async exigirCategoriaPropia(userId: bigint, categoryId: bigint): Promise<void> {
    const existe = await this.prisma.category.count({ where: { id: categoryId, userId } });
    if (existe === 0) {
      throw new UnprocessableEntityException('La categoría indicada no existe o no es tuya.');
    }
  }

  private presentar(fila: TransaccionCompleta): TransactionView {
    return {
      id: fila.id,
      uuid: fila.uuid,
      account_id: fila.accountId,
      date: fila.date.toISOString().slice(0, 10),
      amount: serializar(toMoney(fila.amount)),
      type: fila.type,
      category_id: fila.categoryId,
      description: fila.description,
      merchant: fila.merchant,
      notes: fila.notes,
      transfer_group_id: fila.transferGroupId,
      transfer_direction: fila.transferDir,
      external_ref: fila.externalRef,
      status: fila.status,
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
