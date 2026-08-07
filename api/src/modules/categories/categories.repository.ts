import { Injectable } from '@nestjs/common';
import type { Category, CategoryKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { NodoDeCategoria } from './categories.tree';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listar(
    userId: bigint,
    filtros: { kind?: CategoryKind; incluirArchivadas?: boolean } = {},
  ): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: {
        userId,
        ...(filtros.kind ? { kind: filtros.kind } : {}),
        ...(filtros.incluirArchivadas ? {} : { isArchived: false }),
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Solo id y parentId: para validar ciclos y profundidad no hace falta traerse
   * el árbol completo con nombres y colores.
   */
  async esqueletoDelArbol(userId: bigint): Promise<NodoDeCategoria[]> {
    return this.prisma.category.findMany({
      where: { userId },
      select: { id: true, parentId: true },
    });
  }

  async buscarPorId(userId: bigint, id: bigint): Promise<Category | null> {
    return this.prisma.category.findFirst({ where: { id, userId } });
  }

  async crear(userId: bigint, data: Prisma.CategoryUncheckedCreateInput): Promise<Category> {
    return this.prisma.category.create({ data: { ...data, userId } });
  }

  async actualizar(userId: bigint, id: bigint, data: Prisma.CategoryUpdateInput): Promise<number> {
    const { count } = await this.prisma.category.updateMany({ where: { id, userId }, data });
    return count;
  }

  async archivarVarias(userId: bigint, ids: readonly bigint[]): Promise<number> {
    if (ids.length === 0) return 0;
    const { count } = await this.prisma.category.updateMany({
      where: { userId, id: { in: [...ids] } },
      data: { isArchived: true },
    });
    return count;
  }

  async borrar(userId: bigint, id: bigint): Promise<number> {
    const { count } = await this.prisma.category.deleteMany({ where: { id, userId } });
    return count;
  }

  async contarUsos(userId: bigint, categoryId: bigint): Promise<number> {
    const [enMovimientos, enSplits] = await Promise.all([
      this.prisma.transaction.count({ where: { userId, categoryId } }),
      this.prisma.transactionSplit.count({
        where: { categoryId, transaction: { userId } },
      }),
    ]);
    return enMovimientos + enSplits;
  }

  /** Reordena en una sola transacción: o queda todo el orden nuevo, o ninguno. */
  async reordenar(
    userId: bigint,
    items: readonly { id: bigint; sortOrder: number }[],
  ): Promise<void> {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.category.updateMany({
          where: { id: item.id, userId },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }

  async contarDelUsuario(userId: bigint): Promise<number> {
    return this.prisma.category.count({ where: { userId } });
  }

  async crearVarias(data: Prisma.CategoryUncheckedCreateInput[]): Promise<void> {
    await this.prisma.category.createMany({ data });
  }
}
