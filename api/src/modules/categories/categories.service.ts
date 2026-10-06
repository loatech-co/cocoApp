import { Injectable } from '@nestjs/common';

import {
  categoryFromRow,
  type Category,
  type CategoryMerge,
  type CategorySeed,
  type CategoryTree,
  type CategoryUsage,
} from './categories.domain';
import { CategoriesRepository } from './categories.repository';
import type {
  CreateCategoryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import { rechazoDeVariosPagos } from './varios-pagos';
import {
  anidar,
  descendientesDe,
  generariaCiclo,
  profundidadResultante,
  PROFUNDIDAD_MAXIMA,
} from '../../common/categories/categories.tree';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { english, PERIODICITY, type SpanishPeriodicity } from '../../common/vocabulary';
import type {
  Category as CategoryRow,
  CategoryKind,
  Periodicity,
} from '../../generated/prisma/client';

@Injectable()
export class CategoriesService {
  constructor(private readonly repo: CategoriesRepository) {}

  /** Devuelve el árbol anidado, no la lista plana: es como lo consume la UI. */
  async listarArbol(
    userId: bigint,
    filtros: { kind?: CategoryKind | undefined; incluirArchivadas?: boolean },
  ): Promise<CategoryTree> {
    const categorias = (await this.repo.listar(userId, filtros)).map(categoryFromRow);
    return { tree: anidar(categorias), total: categorias.length };
  }

  async obtener(userId: bigint, id: bigint): Promise<Category> {
    return categoryFromRow(await this.exigirCategoria(userId, id));
  }

  async crear(userId: bigint, dto: CreateCategoryDto): Promise<Category> {
    const parentId = dto.parent_id !== undefined ? BigInt(dto.parent_id) : null;
    // Sin padre es un centro de costos, que es el primer nivel.
    let profundidad = 1;

    if (parentId !== null) {
      const padre = await this.exigirCategoria(userId, parentId);
      const esqueleto = await this.repo.esqueletoDelArbol(userId);

      // Una categoría nueva no tiene hijos: su profundidad es la del padre + 1.
      profundidad = profundidadResultante(
        [...esqueleto, { id: BigInt(-1), parentId: padre.id }],
        BigInt(-1),
        padre.id,
      );
      this.exigirProfundidadValida(profundidad);
    }

    this.exigirVariosPagosCoherente({
      variosPagos: dto.varios_pagos ?? false,
      pagoAutomatico: dto.pago_automatico ?? false,
      recurrente: dto.recurrente ?? false,
      profundidad,
    });

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
      isRecurring: dto.recurrente ?? false,
      isStatic: dto.estatico ?? false,
      periodicity: periodicityOf(dto.periodicidad ?? null),
      paymentDay: dto.dia_de_pago ?? null,
      paymentMonth: dto.mes_de_pago ?? null,
      budget: dto.presupuesto ?? null,
      isAutoPaid: dto.pago_automatico ?? false,
      isMultiPayment: dto.varios_pagos ?? false,
      keywords: dto.palabras_clave ?? [],
    });

    return categoryFromRow(categoria);
  }

  async actualizar(userId: bigint, id: bigint, dto: UpdateCategoryDto): Promise<Category> {
    const actual = await this.exigirCategoria(userId, id);

    /*
      El árbol se pide UNA vez y se reparte, porque lo necesitan dos
      comprobaciones distintas —mover de padre y la marca de varias veces— y
      pedirlo dos veces en la misma petición es una consulta de regalo.

      Perezoso, eso sí: la mayoría de las actualizaciones no tocan ni el padre
      ni esa marca, y entonces no hace falta ninguna.
    */
    let esqueleto: Awaited<ReturnType<typeof this.repo.esqueletoDelArbol>> | null = null;
    const arbol = async (): Promise<NonNullable<typeof esqueleto>> =>
      (esqueleto ??= await this.repo.esqueletoDelArbol(userId));

    if (dto.parent_id !== undefined) {
      const nuevoPadre = dto.parent_id === null ? null : BigInt(dto.parent_id);
      if (nuevoPadre !== null) await this.exigirCategoria(userId, nuevoPadre);

      if (generariaCiclo(await arbol(), id, nuevoPadre)) {
        throw new ValidationError(
          'Una categoría no puede colgar de sí misma ni de una de sus descendientes.',
          { code: 'category_cycle' },
        );
      }

      this.exigirProfundidadValida(profundidadResultante(await arbol(), id, nuevoPadre));
    }

    /*
      Lo que se comprueba es cómo queda la fila, no lo que trajo la petición.

      Encender `pago_automatico` sobre un concepto que YA se paga en varias
      veces no trae `varios_pagos` en el cuerpo, así que mirando solo el DTO
      pasaría, y la fila quedaría con las dos marcas encendidas —que es
      exactamente lo que no puede ocurrir—. Por eso cada campo se lee del DTO
      si viene y de la fila que hay si no.
    */
    const variosPagosFinal = dto.varios_pagos ?? actual.isMultiPayment;
    if (variosPagosFinal) {
      const padreFinal =
        dto.parent_id !== undefined
          ? dto.parent_id === null
            ? null
            : BigInt(dto.parent_id)
          : actual.parentId;

      this.exigirVariosPagosCoherente({
        variosPagos: true,
        pagoAutomatico: dto.pago_automatico ?? actual.isAutoPaid,
        recurrente: dto.recurrente ?? actual.isRecurring,
        profundidad: profundidadResultante(await arbol(), id, padreFinal),
      });
    }

    await this.repo.actualizar(userId, id, cambiosDe(dto));

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
      throw new ConflictError(
        `Esta categoría tiene ${hijos.length} subcategoría(s). Archívala en cascada o reasigna sus hijas primero.`,
        { code: 'category_has_children' },
      );
    }

    await this.repo.archivarVarias(userId, enCascada ? [id, ...hijos] : [id]);
  }

  /**
   * Cuánto arrastra un borrado, antes de hacerlo.
   *
   * La interfaz lo pregunta al abrir la confirmación: sin esto tendría que
   * elegir entre no decir nada —y entonces borrar es a ciegas— o intentarlo y
   * enterarse por el error, que es peor, porque el error llega después de
   * pulsar «Eliminar».
   */
  async usosDe(userId: bigint, id: bigint): Promise<CategoryUsage> {
    await this.exigirCategoria(userId, id);

    const esqueleto = await this.repo.esqueletoDelArbol(userId);
    const descendientes = descendientesDe(esqueleto, id);

    return {
      transactions: await this.repo.contarUsos(userId, [id, ...descendientes]),
      subcategories: descendientes.length,
    };
  }

  /**
   * Elimina una categoría —y todo lo que cuelga de ella—, reasignando sus
   * movimientos.
   *
   * ── Por qué ya no se niega ──────────────────────────────────────────────
   * Antes se negaba en cuanto había un movimiento usándola: «archívala en vez
   * de borrarla». Eso dejaba la estructura sin forma de corregirse —un
   * concepto mal creado con un movimiento dentro no se podía quitar nunca— y
   * obligaba a explicar en la interfaz una regla del sistema en vez de
   * resolver el problema de quien la está usando.
   *
   * Ahora se borra, y lo que hacía falta era preguntar A DÓNDE PASAN sus
   * movimientos. Eso es un dato, no un impedimento.
   *
   * ── Cuándo sigue siendo un error ────────────────────────────────────────
   * Cuando hay movimientos y no se dice a dónde van. No se eligen solos: el
   * sistema no sabe si el alquiler mal clasificado pertenece a «Vivienda» o a
   * «Oficina», y adivinar significa mover plata a un sitio que nadie pidió.
   *
   * Y cuando el destino está DENTRO de lo que se va a borrar: reasignar a algo
   * que desaparece en la misma operación deja los movimientos sin clasificar
   * por el `ON DELETE SET NULL`, que es exactamente lo que se quería evitar.
   */
  async eliminar(
    userId: bigint,
    id: bigint,
    reasignarA?: bigint,
  ): Promise<{ eliminadas: number; reasignados: number }> {
    await this.exigirCategoria(userId, id);

    const esqueleto = await this.repo.esqueletoDelArbol(userId);
    const subarbol = [id, ...descendientesDe(esqueleto, id)];
    const usos = await this.repo.contarUsos(userId, subarbol);

    if (usos > 0 && reasignarA === undefined) {
      throw new ConflictError(
        `Esta categoría tiene ${usos} movimiento(s). Indica a qué categoría pasan.`,
        { code: 'reassignment_required' },
      );
    }

    if (reasignarA !== undefined) {
      await this.exigirCategoria(userId, reasignarA);

      if (subarbol.some((candidato) => candidato === reasignarA)) {
        throw new ConflictError(
          'El destino está dentro de lo que se va a eliminar. Elige uno de fuera.',
          { code: 'reassignment_target_inside' },
        );
      }
    }

    return this.repo.borrarSubarbolReasignando(userId, subarbol, reasignarA ?? null);
  }

  /**
   * A new account's structure: the template, copied as is. The registration
   * calls it right after creating the profile, so there is nothing to check.
   * Returns how many rows it created.
   */
  seedNewAccount(userId: bigint): Promise<number> {
    return this.repo.sembrarPlantilla(userId);
  }

  /**
   * Siembra el diccionario sugerido del Anexo A.
   *
   * Solo corre si el usuario no tiene categorías: no es una migración que se
   * reaplica, es un punto de partida. Y es opcional por diseño — quien prefiera
   * armar su propia taxonomía simplemente no lo llama.
   */
  async sembrarDiccionario(userId: bigint): Promise<CategorySeed> {
    const existentes = await this.repo.contarDelUsuario(userId);
    if (existentes > 0) {
      throw new ConflictError(
        'Ya tienes centros de costos. La plantilla solo se siembra en una cuenta vacía.',
        { code: 'template_requires_empty' },
      );
    }

    // La MISMA plantilla que se copia al crear la cuenta. Dos listas se
    // separan en cuanto alguien toque una: la cuenta nueva nacería con una
    // estructura y la que se quedó vacía se rellenaría con otra.
    return { created: await this.repo.sembrarPlantilla(userId) };
  }

  private exigirVariosPagosCoherente(estado: {
    variosPagos: boolean;
    pagoAutomatico: boolean;
    recurrente: boolean;
    profundidad: number;
  }): void {
    const rechazo = rechazoDeVariosPagos(estado);
    if (rechazo !== null) throw new ValidationError(rechazo.message, { code: rechazo.code });
  }

  private exigirProfundidadValida(profundidad: number): void {
    if (profundidad > PROFUNDIDAD_MAXIMA) {
      throw new ValidationError(
        `El árbol admite hasta ${PROFUNDIDAD_MAXIMA} niveles: centro de costos, categoría y concepto. ` +
          'Anidar más vuelve los reportes ilegibles.',
        { code: 'category_too_deep' },
      );
    }
  }

  private async exigirCategoria(userId: bigint, id: bigint): Promise<CategoryRow> {
    const categoria = await this.repo.buscarPorId(userId, id);
    if (!categoria) throw new NotFoundError('La categoría no existe.');
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
  async unificar(userId: bigint, origenId: bigint, destinoId: bigint): Promise<CategoryMerge> {
    if (origenId === destinoId) {
      throw new ValidationError('Un concepto no se puede unificar consigo mismo.', {
        code: 'merge_into_itself',
      });
    }

    const origen = await this.exigirCategoria(userId, origenId);
    const destino = await this.exigirCategoria(userId, destinoId);

    // Solo entre conceptos. Fundir una categoría en otro movería sus hijos sin que
    // nadie lo haya pedido, y un centro de costos ni siquiera tiene
    // movimientos propios que mover.
    if (origen.parentId === null || destino.parentId === null) {
      throw new ValidationError(
        'Solo se pueden unificar conceptos, no centros de costos ni categorías.',
        { code: 'merge_requires_concepts' },
      );
    }

    // Un concepto con cosas dentro no es un concepto: es una categoría mal puesto,
    // y fundirlo movería sus hijos sin que nadie lo haya pedido.
    const todas = await this.repo.listar(userId, { incluirArchivadas: true });
    const conHijos = todas.filter((c) => c.parentId === origenId).length;
    if (conHijos > 0) {
      throw new ValidationError(
        'Ese concepto tiene otras categorías dentro. Vacíalo antes de unificarlo.',
        { code: 'merge_source_has_children' },
      );
    }

    const movidos = await this.repo.unificar(userId, origenId, destinoId);
    return { moved: movidos, target: categoryFromRow(destino) };
  }
}

/** The columns a PATCH changes: only what the DTO brought. */
/** The v1 word the DTO carries, as the client's English one; `null` stays `null`. */
function periodicityOf(word: SpanishPeriodicity | null): Periodicity | null {
  return word === null ? null : english(PERIODICITY, word);
}

function cambiosDe(dto: UpdateCategoryDto): Parameters<CategoriesRepository['actualizar']>[2] {
  return {
    ...(dto.name !== undefined && { name: dto.name }),
    ...(dto.kind !== undefined && { kind: dto.kind }),
    // La COLUMNA, no la relación: ver el porqué en `repo.actualizar`.
    ...(dto.parent_id !== undefined && {
      parentId: dto.parent_id === null ? null : BigInt(dto.parent_id),
    }),
    ...(dto.color !== undefined && { color: dto.color }),
    ...(dto.icon !== undefined && { icon: dto.icon }),
    ...(dto.sort_order !== undefined && { sortOrder: dto.sort_order }),
    ...(dto.is_archived !== undefined && { isArchived: dto.is_archived }),
    ...(dto.recurrente !== undefined && { isRecurring: dto.recurrente }),
    ...(dto.estatico !== undefined && { isStatic: dto.estatico }),
    ...(dto.periodicidad !== undefined && { periodicity: periodicityOf(dto.periodicidad) }),
    ...(dto.dia_de_pago !== undefined && { paymentDay: dto.dia_de_pago }),
    ...(dto.mes_de_pago !== undefined && { paymentMonth: dto.mes_de_pago }),
    // `!== undefined` y no un truthy: `null` lo quita y CERO es un valor.
    ...(dto.presupuesto !== undefined && { budget: dto.presupuesto }),
    ...(dto.pago_automatico !== undefined && { isAutoPaid: dto.pago_automatico }),
    ...(dto.varios_pagos !== undefined && { isMultiPayment: dto.varios_pagos }),
    ...(dto.palabras_clave !== undefined && { keywords: dto.palabras_clave }),
  };
}
