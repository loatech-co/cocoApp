import { Injectable } from '@nestjs/common';
import type { Category, CategoryKind, Prisma } from '@prisma/client';

import { PLANTILLA_DE_CUENTA_NUEVA, type NodoDePlantilla } from './categories.plantilla';
import { unir } from './palabras-clave';
import type { NodoDeCategoria } from '../../common/categories/categories.tree';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listar(
    userId: bigint,
    filtros: { kind?: CategoryKind | undefined; incluirArchivadas?: boolean } = {},
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

  /**
   * ── Por qué el tipo es `UncheckedUpdateMany` y no `UpdateInput` ───────────
   * Porque esto es un `updateMany`, y `updateMany` NO acepta escrituras
   * anidadas de relaciones: ni `connect`, ni `disconnect`, ni `create`. Solo
   * columnas.
   *
   * Estaba declarado como `CategoryUpdateInput`, que sí las admite, así que
   * TypeScript daba por bueno un `parent: { connect: … }` que Prisma rechaza
   * en tiempo de ejecución con «Unknown argument `parent`». El resultado era
   * un 500 al cambiar de categoría un concepto, y nunca lo vio nadie porque el
   * tipo mentía.
   *
   * `Unchecked` es la variante que expone las claves ajenas como lo que son
   * —`parentId`, un número—, que es como se cambia un padre desde aquí.
   */
  async actualizar(
    userId: bigint,
    id: bigint,
    data: Prisma.CategoryUncheckedUpdateManyInput,
  ): Promise<number> {
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
   * categoría, sus conceptos se quedaban con el padre en nulo y ASCENDÍAN a
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

  /**
   * Copia la plantilla de cuenta nueva. Devuelve cuántas filas creó.
   *
   * La llaman dos sitios que no se conocen entre sí: el registro, para que una
   * cuenta nazca con su estructura (por `CategoriesService.seedNewAccount`), y
   * `POST /categories/seed`, para rellenar una que se quedó vacía.
   * `categories.plantilla.ts` es la ESTRUCTURA y el porqué de cada decisión;
   * esto es el acceso a la base.
   *
   * ── Por qué nivel por nivel y no un `createMany` ────────────────────────────
   * Porque un hijo necesita el `id` de su padre, y `createMany` no devuelve los
   * ids que acaba de asignar. El árbol son nueve filas: el ahorro de una sola
   * consulta no paga tener que resolver eso a mano.
   */
  async sembrarPlantilla(userId: bigint): Promise<number> {
    return this.copyTemplate(userId, PLANTILLA_DE_CUENTA_NUEVA, null);
  }

  private async copyTemplate(
    userId: bigint,
    nodos: readonly NodoDePlantilla[],
    parentId: bigint | null,
  ): Promise<number> {
    let creadas = 0;

    for (const [posicion, nodo] of nodos.entries()) {
      const fila = await this.prisma.category.create({
        data: {
          userId,
          name: nodo.name,
          // Todo lo de la plantilla es gasto. Los ingresos no se clasifican
          // todavía en esta app —la opción está apagada y rotulada «Pronto»—,
          // así que sembrar un árbol de ingresos sería sembrar algo que no se
          // puede usar.
          kind: 'expense',
          parentId,
          icon: nodo.icon ?? null,
          estatico: nodo.estatico ?? false,
          // Explícito y correlativo, no el 0 de fábrica: con todo en cero el
          // orden lo acaba decidiendo el id, que es el orden de inserción por
          // casualidad y no por decisión.
          sortOrder: posicion,
        },
      });
      creadas += 1;

      if (nodo.children?.length) {
        creadas += await this.copyTemplate(userId, nodo.children, fila.id);
      }
    }

    return creadas;
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

      /*
        Las palabras clave del que desaparece pasan al que queda.

        Son lo que hace que el próximo recibo de ese acreedor se reconozca
        solo, y unificar «Movistar» en «MOVISTAR S.A.» es decir que son el
        mismo: las palabras que reconocían al primero reconocen al segundo.
        Dejándolas morir con la fila, la unificación arreglaba los totales y
        rompía la lectura, y eso no se ve hasta el mes siguiente —cuando un
        recibo que entraba clasificado deja de entrar— y para entonces nadie
        lo relaciona con haber unificado dos conceptos.

        `unir` las junta sin repetir: el nombre del acreedor suele estar en
        los dos, que es justo por lo que se crearon duplicados.
      */
      const [origen, destino] = await Promise.all([
        tx.category.findUnique({ where: { id: origenId }, select: { palabrasClave: true } }),
        tx.category.findUnique({ where: { id: destinoId }, select: { palabrasClave: true } }),
      ]);

      const juntas = unir(destino?.palabrasClave ?? [], origen?.palabrasClave ?? []);
      if (juntas.length !== (destino?.palabrasClave.length ?? 0)) {
        await tx.category.update({ where: { id: destinoId }, data: { palabrasClave: juntas } });
      }

      await tx.category.delete({ where: { id: origenId } });

      return movidos.count;
    });
  }
}
