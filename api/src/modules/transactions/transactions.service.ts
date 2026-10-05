import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type Transaction, type TransactionType } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { serializar, toMoney, type Money } from '../../common/money/money';
import { verificarCuadreDeSplits } from '../../common/money/splits';
import { PrismaService } from '../../prisma/prisma.service';
import { idsDeCategorias, ramasDe } from '../categories/categories.tree';
import { SoportesService } from '../soportes/soportes.service';
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

/** Lo que Prisma devuelve cuando se incluyen splits y etiquetas. */
type TransaccionCompleta = Prisma.TransactionGetPayload<{
  include: { splits: true; tags: { include: { tag: true } } };
}>;

const INCLUIR_TODO = {
  splits: true,
  tags: { include: { tag: true } },
} as const;

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
    private readonly prisma: PrismaService,
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
    const where = await this.construirFiltro(userId, query);
    const { page, perPage, skip, take } = parsePaginacion(query.page, query.per_page);

    // Las sumas las hace la BASE, sobre el filtro entero. Traerlas sumando en
    // memoria obligaría a descargar todas las filas del filtro —no las
    // cincuenta de la página— solo para pintar un pie de tabla.
    const [filas, total, sumas] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: INCLUIR_TODO,
        orderBy: parseOrden(query.sort),
        skip,
        take,
      }),
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.groupBy({
        by: ['type'],
        where,
        _sum: { amount: true },
      }),
    ]);

    const sumaDe = (tipo: TransactionType): string =>
      serializar(toMoney(sumas.find((s) => s.type === tipo)?._sum.amount ?? 0));

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
    const extremos = await this.prisma.transaction.aggregate({
      where: { userId },
      _min: { period: true },
      _max: { period: true },
    });

    const iso = (fecha: Date | null): string | null => fecha?.toISOString().slice(0, 10) ?? null;

    return { first: iso(extremos._min.period), last: iso(extremos._max.period) };
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
      period: dto.period ? new Date(dto.period) : mesDe(fecha),
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
    if (accountId !== null && dto.account_id !== undefined) {
      await this.exigirCuentaPropia(userId, accountId);
    }

    if (dto.category_id !== undefined && dto.category_id !== null) {
      await this.exigirCategoriaPropia(userId, BigInt(dto.category_id));
    }

    const amount = dto.amount !== undefined ? toMoney(dto.amount) : toMoney(actual.amount);

    // Si llegan splits nuevos, se revalida el cuadre contra el monto resultante.
    const splits = dto.splits !== undefined ? this.prepararSplits(amount, dto.splits) : null;
    const tagIds =
      dto.tags !== undefined ? await this.tags.resolverNombres(userId, dto.tags) : null;

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
          ...(dto.source !== undefined && { source: dto.source }),
          ...(dto.raw_text !== undefined && { rawText: dto.raw_text }),
          ...(dto.captured_at !== undefined && {
            capturedAt: dto.captured_at === null ? null : new Date(dto.captured_at),
          }),
          ...(dto.por_revisar !== undefined && { porRevisar: dto.por_revisar }),
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

    // The receipt rows cascade with the movement; their files do not. Their
    // keys are read first and the files go after the rows (phase 6.9).
    if (movimiento.transferGroupId) {
      const keys = await this.soportes.keysOf(userId, {
        transferGroupId: movimiento.transferGroupId,
      });
      await this.prisma.transaction.deleteMany({
        where: { userId, transferGroupId: movimiento.transferGroupId },
      });
      await this.soportes.removeFiles(keys);
      return;
    }

    const keys = await this.soportes.keysOf(userId, { transactionId: id });
    await this.prisma.transaction.deleteMany({ where: { id, userId } });
    await this.soportes.removeFiles(keys);
  }

  // ── Apoyo ──────────────────────────────────────────────────────────────────

  /**
   * Todos los ids de la rama que cuelga de una categoría, ella incluida.
   *
   * Filtrar por "Costos fijos" tiene que traer TODO lo que hay debajo: sus
   * categorías y los conceptos de cada una. Comparar `categoryId` contra un solo
   * id devolvería cero movimientos, porque ninguno se cuelga de un centro de
   * costos directamente — se cuelgan del concepto, que es la hoja.
   */
  /** Varias categorías con sus ramas, de una sola lectura del árbol. */
  private async ramasDe(userId: bigint, ids: readonly bigint[]): Promise<bigint[]> {
    const todas = await this.prisma.category.findMany({
      where: { userId },
      select: { id: true, parentId: true },
    });
    return ramasDe(todas, ids);
  }

  /**
   * Las categorías cuyo NOMBRE contiene el texto, con toda su rama.
   *
   * Con la rama, no solo las que coinciden: los movimientos cuelgan del
   * concepto, así que buscar el nombre de una categoría sin expandirla no
   * devolvería ni una fila.
   */
  private async ramaPorNombre(userId: bigint, texto: string): Promise<bigint[]> {
    const todas = await this.prisma.category.findMany({
      where: { userId },
      select: { id: true, parentId: true, name: true },
    });

    const aguja = texto.toLowerCase();
    const coinciden = todas.filter((c) => c.name.toLowerCase().includes(aguja)).map((c) => c.id);

    return coinciden.length === 0 ? [] : ramasDe(todas, coinciden);
  }

  private async construirFiltro(
    userId: bigint,
    query: ListTransactionsQueryDto,
  ): Promise<Prisma.TransactionWhereInput> {
    const where: Prisma.TransactionWhereInput = { userId };

    if (query.from || query.to) {
      // Por PERÍODO: el rango que la persona elige arriba se refiere al mes al
      // que pertenece el gasto, no al día en que salió la plata. Si filtrara
      // por `date`, marzo aparecería vacío cuando sus facturas se pagaron en
      // abril — que es exactamente lo que pasaba.
      where.period = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      };
    }

    if (query.account_id !== undefined) where.accountId = BigInt(query.account_id);

    const pedidas = [
      ...(query.category_id !== undefined ? [BigInt(query.category_id)] : []),
      ...idsDeCategorias(query.category_ids),
    ];
    if (pedidas.length > 0) {
      where.categoryId = { in: await this.ramasDe(userId, pedidas) };
    }
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
      // La búsqueda también entra por la CLASIFICACIÓN: escribir "servicios
      // públicos" tiene que traer todo lo que cuelga de esa categoría, aunque
      // ninguna fila lo diga en su descripción. Quien busca piensa en el
      // nombre con el que ordenó su plata, no en cómo vino escrito el cargo.
      const porClasificacion = await this.ramaPorNombre(userId, query.q);

      // `mode: 'insensitive'` NO es opcional. Postgres compara distinguiendo
      // mayúsculas —MariaDB no lo hacía—, así que buscar "celsia" no
      // encontraría "Celsia (Energia)". Quien busca escribe en minúscula.
      where.OR = [
        { description: { contains: query.q, mode: 'insensitive' } },
        { merchant: { contains: query.q, mode: 'insensitive' } },
        { notes: { contains: query.q, mode: 'insensitive' } },
        ...(porClasificacion.length > 0 ? [{ categoryId: { in: porClasificacion } }] : []),
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
      amount: montos[indice],
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
