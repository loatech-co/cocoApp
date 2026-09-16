import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Category, CategoryKind, Periodicidad } from '@prisma/client';

import { CategoriesRepository } from './categories.repository';
import { DICCIONARIO_INICIAL } from './categories.seed';
import {
  anidar,
  generariaCiclo,
  profundidadResultante,
  PROFUNDIDAD_MAXIMA,
  type ConHijos,
} from './categories.tree';
import type { CreateCategoryDto, ReorderCategoriesDto, UpdateCategoryDto } from './dto/category.dto';

export interface CategoryView {
  id: bigint;
  parentId: bigint | null;
  name: string;
  kind: CategoryKind;
  color: string | null;
  icon: string | null;
  sort_order: number;
  is_archived: boolean;
  /** Si el concepto se paga cada cierto tiempo. */
  recurrente: boolean;
  /** Si el centro de costos no se reclasifica desde la tabla de movimientos. */
  estatico: boolean;
  periodicidad: Periodicidad | null;
  /** Día del mes en que se debe pagar. */
  dia_de_pago: number | null;
  /** Mes de referencia del ciclo, 1–12. Solo si la periodicidad no es mensual. */
  mes_de_pago: number | null;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly repo: CategoriesRepository) {}

  /** Devuelve el árbol anidado, no la lista plana: es como lo consume la UI. */
  async listarArbol(
    userId: bigint,
    filtros: { kind?: CategoryKind; incluirArchivadas?: boolean },
  ): Promise<{ arbol: ConHijos<CategoryView>[]; total: number }> {
    const categorias = await this.repo.listar(userId, filtros);
    const vistas = categorias.map((categoria) => this.presentar(categoria));
    return { arbol: anidar(vistas), total: vistas.length };
  }

  async obtener(userId: bigint, id: bigint): Promise<CategoryView> {
    return this.presentar(await this.exigirCategoria(userId, id));
  }

  async crear(userId: bigint, dto: CreateCategoryDto): Promise<CategoryView> {
    const parentId = dto.parent_id !== undefined ? BigInt(dto.parent_id) : null;

    if (parentId !== null) {
      const padre = await this.exigirCategoria(userId, parentId);
      const esqueleto = await this.repo.esqueletoDelArbol(userId);

      // Una categoría nueva no tiene hijos: su profundidad es la del padre + 1.
      const profundidad = profundidadResultante(
        [...esqueleto, { id: BigInt(-1), parentId: padre.id }],
        BigInt(-1),
        padre.id,
      );
      this.exigirProfundidadValida(profundidad);
    }

    const categoria = await this.repo.crear(userId, {
      userId,
      name: dto.name,
      kind: dto.kind,
      parentId,
      color: dto.color ?? null,
      icon: dto.icon ?? null,
      sortOrder: dto.sort_order ?? 0,
      // La fila se arma campo por campo, así que un dato nuevo del DTO no
      // llega solo: hay que nombrarlo aquí o se pierde en silencio, con la
      // API devolviendo 201 y el concepto creado sin su recurrencia.
      recurrente: dto.recurrente ?? false,
      estatico: dto.estatico ?? false,
      periodicidad: dto.periodicidad ?? null,
      diaDePago: dto.dia_de_pago ?? null,
      mesDePago: dto.mes_de_pago ?? null,
    });

    return this.presentar(categoria);
  }

  async actualizar(userId: bigint, id: bigint, dto: UpdateCategoryDto): Promise<CategoryView> {
    await this.exigirCategoria(userId, id);

    if (dto.parent_id !== undefined) {
      const nuevoPadre = dto.parent_id === null ? null : BigInt(dto.parent_id);
      if (nuevoPadre !== null) await this.exigirCategoria(userId, nuevoPadre);

      const esqueleto = await this.repo.esqueletoDelArbol(userId);

      if (generariaCiclo(esqueleto, id, nuevoPadre)) {
        throw new UnprocessableEntityException(
          'Una categoría no puede colgar de sí misma ni de una de sus descendientes.',
        );
      }

      this.exigirProfundidadValida(profundidadResultante(esqueleto, id, nuevoPadre));
    }

    await this.repo.actualizar(userId, id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.kind !== undefined && { kind: dto.kind }),
      ...(dto.parent_id !== undefined && {
        parent:
          dto.parent_id === null
            ? { disconnect: true }
            : { connect: { id: BigInt(dto.parent_id) } },
      }),
      ...(dto.color !== undefined && { color: dto.color }),
      ...(dto.icon !== undefined && { icon: dto.icon }),
      ...(dto.sort_order !== undefined && { sortOrder: dto.sort_order }),
      ...(dto.is_archived !== undefined && { isArchived: dto.is_archived }),
      ...(dto.recurrente !== undefined && { recurrente: dto.recurrente }),
      ...(dto.estatico !== undefined && { estatico: dto.estatico }),
      ...(dto.periodicidad !== undefined && { periodicidad: dto.periodicidad }),
      ...(dto.dia_de_pago !== undefined && { diaDePago: dto.dia_de_pago }),
      ...(dto.mes_de_pago !== undefined && { mesDePago: dto.mes_de_pago }),
    });

    return this.obtener(userId, id);
  }

  async reordenar(userId: bigint, dto: ReorderCategoriesDto): Promise<void> {
    await this.repo.reordenar(
      userId,
      dto.items.map((item) => ({ id: BigInt(item.id), sortOrder: item.sort_order })),
    );
  }

  /**
   * La operación por defecto es ARCHIVAR, no borrar: los reportes de periodos
   * pasados dejarían de cuadrar si desapareciera una categoría en uso.
   * El borrado físico solo se permite cuando nunca se usó.
   */
  async archivar(userId: bigint, id: bigint, enCascada: boolean): Promise<void> {
    await this.exigirCategoria(userId, id);

    const esqueleto = await this.repo.esqueletoDelArbol(userId);
    const hijos = esqueleto.filter((nodo) => nodo.parentId === id).map((nodo) => nodo.id);

    if (hijos.length > 0 && !enCascada) {
      throw new ConflictException(
        `Esta categoría tiene ${hijos.length} subcategoría(s). Archívala en cascada o reasigna sus hijas primero.`,
      );
    }

    await this.repo.archivarVarias(userId, enCascada ? [id, ...hijos] : [id]);
  }

  async eliminar(userId: bigint, id: bigint): Promise<void> {
    await this.exigirCategoria(userId, id);

    const usos = await this.repo.contarUsos(userId, id);
    if (usos > 0) {
      throw new ConflictException(
        `Esta categoría se usa en ${usos} movimiento(s). Archívala en vez de borrarla.`,
      );
    }

    await this.repo.borrar(userId, id);
  }

  /**
   * Siembra el diccionario sugerido del Anexo A.
   *
   * Solo corre si el usuario no tiene categorías: no es una migración que se
   * reaplica, es un punto de partida. Y es opcional por diseño — quien prefiera
   * armar su propia taxonomía simplemente no lo llama.
   */
  async sembrarDiccionario(userId: bigint): Promise<{ creadas: number }> {
    const existentes = await this.repo.contarDelUsuario(userId);
    if (existentes > 0) {
      throw new ConflictException(
        'Ya tienes categorías. El diccionario inicial solo se siembra en una cuenta vacía.',
      );
    }

    let creadas = 0;

    for (const [indice, padre] of DICCIONARIO_INICIAL.entries()) {
      const raiz = await this.repo.crear(userId, {
        userId,
        name: padre.name,
        kind: padre.kind,
        color: padre.color,
        icon: padre.icon,
        sortOrder: indice * 100,
      });
      creadas += 1;

      if (padre.children.length > 0) {
        await this.repo.crearVarias(
          padre.children.map((hijo, posicion) => ({
            userId,
            name: hijo.name,
            kind: padre.kind,
            parentId: raiz.id,
            // Las hijas heredan el color del padre: en una gráfica se leen como
            // una misma familia, y el icono es lo que las distingue.
            color: padre.color,
            icon: hijo.icon,
            sortOrder: indice * 100 + posicion + 1,
          })),
        );
        creadas += padre.children.length;
      }
    }

    return { creadas };
  }

  private exigirProfundidadValida(profundidad: number): void {
    if (profundidad > PROFUNDIDAD_MAXIMA) {
      throw new UnprocessableEntityException(
        `El árbol admite hasta ${PROFUNDIDAD_MAXIMA} niveles: centro de costos, grupo y concepto. ` +
          'Anidar más vuelve los reportes ilegibles.',
      );
    }
  }

  private async exigirCategoria(userId: bigint, id: bigint): Promise<Category> {
    const categoria = await this.repo.buscarPorId(userId, id);
    if (!categoria) throw new NotFoundException('La categoría no existe.');
    return categoria;
  }

  /**
   * Funde un concepto en otro: todo lo que colgaba del primero pasa al
   * segundo y el primero desaparece.
   *
   * ── Por qué existe ──────────────────────────────────────────────────────
   * Porque los duplicados aparecen solos. Una importación crea "Movistar",
   * otra crea "MOVISTAR S.A.", y a partir de ahí la misma factura está
   * repartida en dos conceptos que suman por separado: ningún total cuadra y
   * la dona muestra dos porciones donde hay una.
   *
   * ── Por qué no basta con renombrar ──────────────────────────────────────
   * Renombrar deja dos conceptos con el mismo nombre, que es peor: se ven
   * iguales y siguen sumando aparte. La única salida es mover los
   * movimientos y borrar el que sobra.
   *
   * Todo en UNA transacción. A medio camino quedarían movimientos apuntando a
   * una categoría ya borrada, y eso no se arregla mirando la pantalla.
   */
  async unificar(
    userId: bigint,
    origenId: bigint,
    destinoId: bigint,
  ): Promise<{ movidos: number; destino: CategoryView }> {
    if (origenId === destinoId) {
      throw new UnprocessableEntityException('Un concepto no se puede unificar consigo mismo.');
    }

    const origen = await this.exigirCategoria(userId, origenId);
    const destino = await this.exigirCategoria(userId, destinoId);

    // Solo entre conceptos. Fundir un grupo en otro movería sus hijos sin que
    // nadie lo haya pedido, y un centro de costos ni siquiera tiene
    // movimientos propios que mover.
    if (origen.parentId === null || destino.parentId === null) {
      throw new UnprocessableEntityException(
        'Solo se pueden unificar conceptos, no centros de costos ni grupos.',
      );
    }

    // Un concepto con cosas dentro no es un concepto: es un grupo mal puesto,
    // y fundirlo movería sus hijos sin que nadie lo haya pedido.
    const todas = await this.repo.listar(userId, { incluirArchivadas: true });
    const conHijos = todas.filter((c) => c.parentId === origenId).length;
    if (conHijos > 0) {
      throw new UnprocessableEntityException(
        'Ese concepto tiene cosas dentro. Vacíalo antes de unificarlo.',
      );
    }

    const movidos = await this.repo.unificar(userId, origenId, destinoId);
    return { movidos, destino: this.presentar(destino) };
  }

  private presentar(categoria: Category): CategoryView {
    return {
      id: categoria.id,
      parentId: categoria.parentId,
      name: categoria.name,
      kind: categoria.kind,
      color: categoria.color,
      icon: categoria.icon,
      sort_order: categoria.sortOrder,
      is_archived: categoria.isArchived,
      recurrente: categoria.recurrente,
      estatico: categoria.estatico,
      periodicidad: categoria.periodicidad,
      dia_de_pago: categoria.diaDePago,
      mes_de_pago: categoria.mesDePago,
    };
  }
}
