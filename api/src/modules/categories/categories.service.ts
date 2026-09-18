import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Category, CategoryKind, Periodicidad } from '@prisma/client';

import { CategoriesRepository } from './categories.repository';
import {
  anidar,
  descendientesDe,
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
  /**
   * Lo que se espera que cueste cada vez que toca. Puesto, manda sobre el
   * promedio de los meses anteriores. Viaja como cadena, igual que todo lo que
   * es dinero: un decimal en coma flotante pierde centavos.
   */
  presupuesto: string | null;
  /** Si el movimiento se crea solo al llegar el día de pago. */
  pago_automatico: boolean;
  /** Lo que se busca en un soporte para reconocer este concepto. */
  palabras_clave: string[];
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
      presupuesto: dto.presupuesto ?? null,
      pagoAutomatico: dto.pago_automatico ?? false,
      palabrasClave: dto.palabras_clave ?? [],
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
      // La COLUMNA, no la relación: ver el porqué en `repo.actualizar`.
      ...(dto.parent_id !== undefined && {
        parentId: dto.parent_id === null ? null : BigInt(dto.parent_id),
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
      // `!== undefined` y no un truthy: `null` lo quita y CERO es un valor.
      ...(dto.presupuesto !== undefined && { presupuesto: dto.presupuesto }),
      ...(dto.pago_automatico !== undefined && { pagoAutomatico: dto.pago_automatico }),
      ...(dto.palabras_clave !== undefined && { palabrasClave: dto.palabras_clave }),
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

  /**
   * Cuánto arrastra un borrado, antes de hacerlo.
   *
   * La interfaz lo pregunta al abrir la confirmación: sin esto tendría que
   * elegir entre no decir nada —y entonces borrar es a ciegas— o intentarlo y
   * enterarse por el error, que es peor, porque el error llega después de
   * pulsar «Eliminar».
   */
  async usosDe(
    userId: bigint,
    id: bigint,
  ): Promise<{ movimientos: number; subcategorias: number }> {
    await this.exigirCategoria(userId, id);

    const esqueleto = await this.repo.esqueletoDelArbol(userId);
    const descendientes = descendientesDe(esqueleto, id);

    return {
      movimientos: await this.repo.contarUsos(userId, [id, ...descendientes]),
      subcategorias: descendientes.length,
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
      throw new ConflictException(
        `Esta categoría tiene ${usos} movimiento(s). Indica a qué categoría pasan.`,
      );
    }

    if (reasignarA !== undefined) {
      await this.exigirCategoria(userId, reasignarA);

      if (subarbol.some((candidato) => candidato === reasignarA)) {
        throw new ConflictException(
          'El destino está dentro de lo que se va a eliminar. Elige uno de fuera.',
        );
      }
    }

    return this.repo.borrarSubarbolReasignando(userId, subarbol, reasignarA ?? null);
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
        'Ya tienes centros de costos. La plantilla solo se siembra en una cuenta vacía.',
      );
    }

    // La MISMA plantilla que se copia al crear la cuenta. Dos listas se
    // separan en cuanto alguien toque una: la cuenta nueva nacería con una
    // estructura y la que se quedó vacía se rellenaría con otra.
    return { creadas: await this.repo.sembrarPlantilla(userId) };
  }

  private exigirProfundidadValida(profundidad: number): void {
    if (profundidad > PROFUNDIDAD_MAXIMA) {
      throw new UnprocessableEntityException(
        `El árbol admite hasta ${PROFUNDIDAD_MAXIMA} niveles: centro de costos, categoría y concepto. ` +
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

    // Solo entre conceptos. Fundir una categoría en otro movería sus hijos sin que
    // nadie lo haya pedido, y un centro de costos ni siquiera tiene
    // movimientos propios que mover.
    if (origen.parentId === null || destino.parentId === null) {
      throw new UnprocessableEntityException(
        'Solo se pueden unificar conceptos, no centros de costos ni categorías.',
      );
    }

    // Un concepto con cosas dentro no es un concepto: es una categoría mal puesto,
    // y fundirlo movería sus hijos sin que nadie lo haya pedido.
    const todas = await this.repo.listar(userId, { incluirArchivadas: true });
    const conHijos = todas.filter((c) => c.parentId === origenId).length;
    if (conHijos > 0) {
      throw new UnprocessableEntityException(
        'Ese concepto tiene otras categorías dentro. Vacíalo antes de unificarlo.',
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
      presupuesto: categoria.presupuesto === null ? null : categoria.presupuesto.toString(),
      pago_automatico: categoria.pagoAutomatico,
      palabras_clave: categoria.palabrasClave,
    };
  }
}
