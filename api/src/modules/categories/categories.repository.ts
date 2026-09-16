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

  /**
   * Cuántos movimientos cuelgan de estas categorías.
   *
   * Recibe una LISTA y no un id porque lo que se cuenta es un subárbol: los
   * movimientos de un centro de costos no están en el centro, están en los
   * conceptos que hay tres niveles más abajo. Contando solo el id de arriba,
   * un centro con cuarenta movimientos daba cero.
   */
  async contarUsos(userId: bigint, categoryIds: readonly bigint[]): Promise<number> {
    if (categoryIds.length === 0) return 0;
    const ids = [...categoryIds];

    const [enMovimientos, enSplits] = await Promise.all([
      this.prisma.transaction.count({ where: { userId, categoryId: { in: ids } } }),
      this.prisma.transactionSplit.count({
        where: { categoryId: { in: ids }, transaction: { userId } },
      }),
    ]);
    return enMovimientos + enSplits;
  }

  /**
   * Borra un subárbol entero, reasignando antes lo que colgaba de él.
   *
   * ── Por qué el subárbol y no la fila ────────────────────────────────────
   * Porque `parent_id` está declarado `ON DELETE SET NULL`: borrando solo el
   * grupo, sus conceptos se quedaban con el padre en nulo y ASCENDÍAN a
   * centros de costos. Un borrado que crea tres centros nuevos no es lo que
   * nadie pidió.
   *
   * ── Por qué en una transacción ──────────────────────────────────────────
   * Porque si la reasignación pasa y el borrado falla, quedan los movimientos
   * en su destino nuevo y la categoría vieja todavía viva —y nadie sabe que
   * se movieron—. Y al revés es peor: `category_id` es `ON DELETE SET NULL`,
   * así que un borrado sin reasignación previa deja los movimientos sin
   * clasificar en silencio.
   */
  async borrarSubarbolReasignando(
    userId: bigint,
    ids: readonly bigint[],
    reasignarA: bigint | null,
  ): Promise<{ eliminadas: number; reasignados: number }> {
    const lista = [...ids];

    return this.prisma.$transaction(async (tx) => {
      let reasignados = 0;

      if (reasignarA !== null) {
        const [movimientos, splits] = await Promise.all([
          tx.transaction.updateMany({
            where: { userId, categoryId: { in: lista } },
            data: { categoryId: reasignarA },
          }),
          tx.transactionSplit.updateMany({
            where: { categoryId: { in: lista }, transaction: { userId } },
            data: { categoryId: reasignarA },
          }),
        ]);
        reasignados = movimientos.count + splits.count;
      }

      const { count } = await tx.category.deleteMany({ where: { userId, id: { in: lista } } });
      return { eliminadas: count, reasignados };
    });
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

  /**
   * Mueve todo lo que cuelga de un concepto a otro y borra el primero.
   *
   * En UNA transacción. A medio camino quedarían movimientos apuntando a una
   * categoría ya borrada, y eso no se arregla mirando la pantalla.
   */
  async unificar(userId: bigint, origenId: bigint, destinoId: bigint): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const movidos = await tx.transaction.updateMany({
        where: { userId, categoryId: origenId },
        data: { categoryId: destinoId },
      });

      // Los splits reparten un movimiento entre categorías: si uno apuntaba al
      // concepto que desaparece, hay que moverlo o se quedaría sin clasificar.
      await tx.transactionSplit.updateMany({
        where: { categoryId: origenId },
        data: { categoryId: destinoId },
      });

      await tx.importRow.updateMany({
        where: { categoryId: origenId },
        data: { categoryId: destinoId },
      });

      // Las reglas aprendidas son únicas por (usuario, patrón), así que
      // cambiarles la categoría nunca choca con las del destino.
      await tx.categoryRule.updateMany({
        where: { userId, categoryId: origenId },
        data: { categoryId: destinoId },
      });

      await tx.category.delete({ where: { id: origenId } });

      return movidos.count;
    });
  }
}
